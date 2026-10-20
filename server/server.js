import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';
import { loadAirports } from './feeds/airports.js';
import { toCallsign } from './feeds/airlines.js';
import { startPolling } from './poller.js';
import { cached } from './cache.js';
import { warningsOnRoute } from '../core/route-check.js';

const here = dirname(fileURLToPath(import.meta.url));

// The real flight lookup lives in feeds/opensky.js. It's loaded the first time a flight is asked for,
// so the server starts (and tests run) without it.
const lookupFromOpenSky = async (callsign) => (await import('./feeds/opensky.js')).lookupFlight(callsign);

// Build the app without starting it, so tests can call app.inject().
// Tests can pass their own lookupFlight, so they don't call OpenSky, and their own poller (anything with
// latest(name)). Without a poller every warning feed counts as no-data.
export function buildServer(options = {}) {
  const lookupFlight = options.lookupFlight ?? lookupFromOpenSky;
  const poller = options.poller;

  // The latest result for each warning feed: { status: 'ok' | 'no-data', fetchedAt, items } (see poller.js).
  // 'no-data' means we don't know (a 204, or no answer yet), which is not the same as "no warnings" (issue #23).
  const WARNING_FEEDS = ['sigmets', 'volcanoes'];
  const noData = { status: 'no-data', fetchedAt: null, items: [] };
  function warningFeeds() {
    const results = Object.fromEntries(WARNING_FEEDS.map((name) => [name, poller?.latest(name) ?? noData]));
    return {
      // All the warnings we have, SIGMETs first, then the volcano alerts.
      warnings: WARNING_FEEDS.flatMap((name) => results[name].items),
      // Per feed, whether we have data and when it arrived, so the page can tell "clear" from "unknown".
      feeds: Object.fromEntries(
        WARNING_FEEDS.map((name) => [name, { status: results[name].status, fetchedAt: results[name].fetchedAt }]),
      ),
    };
  }

  const app = Fastify();
  app.register(fastifyStatic, { root: join(here, '..', 'public') });

  // Large airports only, for the map to draw as dots (about 1,200; medium ones would add 3,400 more).
  app.get('/api/airports', async () =>
    loadAirports()
      .filter((a) => a.type === 'large_airport')
      .map(({ iata, name, lat, lon }) => ({ iata, name, lat, lon })),
  );

  // A flight's path: { callsign, icao24, points: [{ t, lat, lon, altM }], onRoute: [warnings], feeds }.
  // onRoute is the SIGMET warnings and volcano alerts the path passes through or within 50 km of.
  // feeds is the same as in /api/warnings: an empty onRoute only means "clear" if every feed is 'ok'.
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
    // A new object, so the cached path isn't changed.
    const { warnings, feeds } = warningFeeds();
    return { ...path, onRoute: warningsOnRoute(path, warnings), feeds };
  });

  // All current warnings, and how each feed is doing:
  //   { warnings: [...], feeds: { sigmets: { status, fetchedAt }, volcanoes: { status, fetchedAt } } }
  // warnings is the SIGMETs (storms, turbulence, icing, volcanic ash) followed by the volcano alerts. A feed
  // with no data adds nothing to it, so one feed being slow or down never hides the other; its status says so.
  app.get('/api/warnings', async () => warningFeeds());

  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;

  // Keep the SIGMET warnings fresh in the background. They change slowly, so once a minute is plenty, and
  // aviationweather.gov allows 100 requests a minute. The feed is loaded when first used, like the flight lookup.
  // OpenSky is not polled: we ask it only when someone searches (see /api/flight above). Polling it every 2 s
  // used up our daily allowance overnight (issue #11).
  let lookupFlight = lookupFromOpenSky;
  let sources = [
    {
      name: 'sigmets',
      everySeconds: 60,
      fetch: async () => (await import('./feeds/sigmets.js')).fetchSigmets(),
    },
    // Volcano alerts from USGS. Alert levels change over hours or days, not minutes, and USGS asks for
    // reasonable use, so every 10 minutes is plenty: 144 requests a day.
    {
      name: 'volcanoes',
      everySeconds: 600,
      fetch: async () => (await import('./feeds/volcanoes.js')).fetchVolcanoes(),
    },
  ];

  // Replay mode: REPLAY=tasman serves saved answers from replay/tasman/ instead of the feeds that have a file
  // there (see server/replay.js). Feeds without a file stay live. Loaded only when asked for, like the feeds.
  if (process.env.REPLAY) {
    const { applyReplay } = await import('./replay.js');
    ({ lookupFlight, sources } = applyReplay(process.env.REPLAY, { lookupFlight, sources }));
  }

  const poller = startPolling({ log, sources });
  const app = buildServer({ lookupFlight, poller });
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
