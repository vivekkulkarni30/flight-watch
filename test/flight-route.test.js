import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/server.js';

// A made-up path, in the same shape the OpenSky feed gives us.
const qfa1 = {
  callsign: 'QFA1',
  icao24: '7c6b2d',
  points: [
    { t: 1757901600, lat: -33.95, lon: 151.18, altM: 0 },
    { t: 1757902200, lat: -32.1, lon: 149.6, altM: 10670 },
  ],
};

test('GET /api/flight/:number returns the path from lookupFlight', async () => {
  const asked = [];
  const app = buildServer({
    lookupFlight: async (callsign) => {
      asked.push(callsign);
      return qfa1;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), qfa1);
  assert.deepEqual(asked, ['QFA1']); // passed on as given
  await app.close();
});

test('GET /api/flight/:number gives 404 when the flight is not found', async () => {
  const app = buildServer({ lookupFlight: async () => null });
  const res = await app.inject({ method: 'GET', url: '/api/flight/ZZZ999' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not-found' });
  await app.close();
});
