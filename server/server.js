import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';
import { loadAirports } from './feeds/airports.js';

const here = dirname(fileURLToPath(import.meta.url));

// The real flight lookup lives in feeds/opensky.js. It's loaded the first time a flight is asked for,
// so the server starts (and tests run) without it.
const lookupFromOpenSky = async (callsign) => (await import('./feeds/opensky.js')).lookupFlight(callsign);

// Build the app without starting it, so tests can call app.inject().
// Tests can pass their own lookupFlight, so they don't call OpenSky.
export function buildServer(options = {}) {
  const lookupFlight = options.lookupFlight ?? lookupFromOpenSky;
  const app = Fastify();
  app.register(fastifyStatic, { root: join(here, '..', 'public') });

  // Large airports only, for the map to draw as dots (about 1,200; medium ones would add 3,400 more).
  app.get('/api/airports', async () =>
    loadAirports()
      .filter((a) => a.type === 'large_airport')
      .map(({ iata, name, lat, lon }) => ({ iata, name, lat, lon })),
  );

  // A flight's path: { callsign, icao24, points: [{ t, lat, lon, altM }] }.
  // The number goes to the lookup exactly as typed.
  app.get('/api/flight/:number', async (request, reply) => {
    const path = await lookupFlight(request.params.number);
    if (!path) return reply.code(404).send({ error: 'not-found' });
    return path;
  });

  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const app = buildServer();
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
