import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';
import { loadAirports } from './feeds/airports.js';
import { toCallsign } from './feeds/airlines.js';
import { startPolling } from './poller.js';
import { cached } from './cache.js';

const here = dirname(fileURLToPath(import.meta.url));

// The real flight lookup lives in feeds/opensky.js. It's loaded the first time a flight is asked for,
// so the server starts (and tests run) without it.
const lookupFromOpenSky = async (callsign) => (await import('./feeds/opensky.js')).lookupFlight(callsign);

// Build the app without starting it, so tests can call app.inject().
// Tests can pass their own lookupFlight, so they don't call OpenSky, and their own poller (anything with
// latest(name)). Without a poller there are no warnings.
export function buildServer(options = {}) {
  const lookupFlight = options.lookupFlight ?? lookupFromOpenSky;
  const poller = options.poller;

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

    // OpenSky only lets anonymous users ask so often each day (issue #11), so we keep each answer for 30 s.
    // Ten people searching QF1 in the same half minute cost one request, not ten. If OpenSky refuses later on
    // (429), the cache hands back the last path we had and logs a WARN.
    let path;
    try {
      path = await cached(`flight:${callsign}`, 30, () => lookupFlight(callsign));
    } catch (err) {
      // Catch it here: left alone, Fastify sends OpenSky's own status (a 503, say) back to the browser,
      // which reads as if our server were down. 502 says "the server is fine, the feed behind it isn't".
      log.error(`flight lookup for ${callsign} failed: OpenSky status ${err.status ?? 'unknown'} (${err.message})`);
      return reply.code(502).send({ error: 'feed-unavailable' });
    }
    if (!path) return reply.code(404).send({ error: 'not-found' });
    return path;
  });

  // The latest SIGMET warnings (storms, turbulence, icing, volcanic ash), [] until the first fetch is in.
  app.get('/api/warnings', async () => poller?.latest('sigmets') ?? []);

  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;

  // Keep the SIGMET warnings fresh in the background. They change slowly, so once a minute is plenty, and
  // aviationweather.gov allows 100 requests a minute. The feed is loaded when first used, like the flight lookup.
  // OpenSky is not polled: we ask it only when someone searches (see /api/flight above). Polling it every 2 s
  // used up our daily allowance overnight (issue #11).
  const poller = startPolling({
    log,
    sources: [
      {
        name: 'sigmets',
        everySeconds: 60,
        fetch: async () => (await import('./feeds/sigmets.js')).fetchSigmets(),
      },
    ],
  });

  const app = buildServer({ poller });
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
