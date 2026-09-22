import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';
import { loadAirports } from './feeds/airports.js';
import { toCallsign } from './feeds/airlines.js';
import { startPolling } from './poller.js';

const here = dirname(fileURLToPath(import.meta.url));

// The real flight lookup lives in feeds/opensky.js. It's loaded the first time a flight is asked for,
// so the server starts (and tests run) without it.
const lookupFromOpenSky = async (callsign, options) => (await import('./feeds/opensky.js')).lookupFlight(callsign, options);

// Build the app without starting it, so tests can call app.inject().
// Tests can pass their own lookupFlight, so they don't call OpenSky, and their own poller (anything with
// latest(name)). Without a poller there are no warnings and every flight search asks OpenSky.
export function buildServer(options = {}) {
  const lookupFlight = options.lookupFlight ?? lookupFromOpenSky;
  const poller = options.poller;

  // The aircraft broadcasting this callsign, from the OpenSky states the poller keeps in memory.
  // undefined: no states yet (no poller, or the first fetch hasn't come back), so ask OpenSky.
  // null: we have the states and nobody is using that callsign.
  const findState = (callsign) => {
    const states = poller?.latest('opensky-states');
    if (!states) return undefined;
    return states.find((s) => s[1]?.trim() === callsign) ?? null;
  };

  const app = Fastify();
  app.register(fastifyStatic, { root: join(here, '..', 'public') });

  // Large airports only, for the map to draw as dots (about 1,200; medium ones would add 3,400 more).
  app.get('/api/airports', async () =>
    loadAirports()
      .filter((a) => a.type === 'large_airport')
      .map(({ iata, name, lat, lon }) => ({ iata, name, lat, lon })),
  );

  // A flight's path: { callsign, icao24, points: [{ t, lat, lon, altM }] }.
  // People type a flight number (QF144), but planes broadcast a callsign (QFA144), so convert first.
  // 404 unknown-airline: we don't know that airline code. 404 not-found: no plane is using that callsign now.
  app.get('/api/flight/:number', async (request, reply) => {
    const callsign = toCallsign(request.params.number);
    if (!callsign) return reply.code(404).send({ error: 'unknown-airline' });

    // With the states in memory we already know if the plane is up and which aircraft it is (its icao24),
    // so we only need to ask OpenSky for the track.
    const state = findState(callsign);
    if (state === null) return reply.code(404).send({ error: 'not-found' });

    let path;
    try {
      path = await lookupFlight(callsign, state ? { icao24: state[0] } : undefined);
    } catch (err) {
      // Catch it here: left alone, Fastify sends OpenSky's own status (a 503, say) back to the browser,
      // which reads as if our server were down. 502 says "the server is fine, the feed behind it isn't".
      log.error(`flight lookup for ${callsign} failed: OpenSky status ${err.status ?? 'unknown'} (${err.message})`);
      return reply.code(502).send({ error: 'feed-unavailable' });
    }
    if (!path) return reply.code(404).send({ error: 'not-found' });

    // The track can lag a little behind; the states are at most a couple of seconds old, so add where the
    // plane is now. State fields: [3] time of position, [5] lon, [6] lat, [7] altitude in metres.
    const [, , , t, , lon, lat, altM] = state ?? [];
    if (lat != null && lon != null && t > (path.points.at(-1)?.t ?? 0)) {
      path = { ...path, points: [...path.points, { t, lat, lon, altM }] };
    }
    return path;
  });

  // The latest SIGMET warnings (storms, turbulence, icing, volcanic ash), [] until the first fetch is in.
  app.get('/api/warnings', async () => poller?.latest('sigmets') ?? []);

  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;

  // Keep the feeds fresh in the background. Both feeds are loaded when first used, like the flight lookup.
  // - sigmets: warnings change slowly, once a minute is plenty.
  // - opensky-states: every aircraft in the air, every 2 s, so a flight search finds the plane straight away
  //   and its position is always fresh.
  const poller = startPolling({
    log,
    sources: [
      {
        name: 'sigmets',
        everySeconds: 60,
        fetch: async () => (await import('./feeds/sigmets.js')).fetchSigmets(),
      },
      {
        name: 'opensky-states',
        everySeconds: 2,
        fetch: async () => (await import('./feeds/opensky.js')).fetchStates(),
      },
    ],
  });

  const app = buildServer({ poller });
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
