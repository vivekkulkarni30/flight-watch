import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  assert.deepEqual(asked, ['QFA1']); // already a callsign, so passed on as given
  await app.close();
});

test('GET /api/flight/:number gives 404 not-found when no plane has that callsign', async () => {
  const app = buildServer({ lookupFlight: async () => null });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF9999' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not-found' });
  await app.close();
});

test('GET /api/flight/:number turns a flight number into a callsign before looking it up (issue #7)', async () => {
  const asked = [];
  const app = buildServer({
    lookupFlight: async (callsign) => {
      asked.push(callsign);
      return { ...qfa1, callsign };
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/qf144' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().callsign, 'QFA144');
  assert.deepEqual(asked, ['QFA144']);
  await app.close();
});

test('GET /api/flight/:number ignores spaces around what was typed', async () => {
  const asked = [];
  const app = buildServer({
    lookupFlight: async (callsign) => {
      asked.push(callsign);
      return null;
    },
  });
  // The search box sends the text as typed, so " qf144" arrives with a space (%20) in front.
  await app.inject({ method: 'GET', url: '/api/flight/%20qf144' });
  assert.deepEqual(asked, ['QFA144']);
  await app.close();
});

test('GET /api/flight/:number gives 404 unknown-airline for an airline code we do not know', async () => {
  const asked = [];
  const app = buildServer({
    lookupFlight: async (callsign) => {
      asked.push(callsign);
      return qfa1;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/ZZ1' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'unknown-airline' });
  assert.deepEqual(asked, []); // no need to ask OpenSky
  await app.close();
});

test('GET /api/flight/:number gives 502 and logs an error when OpenSky fails', async (t) => {
  // Send the log to a temporary file so we can read it back.
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-route-'));
  const file = join(folder, 'test.log');
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = file;
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });

  const app = buildServer({
    lookupFlight: async () => {
      const err = new Error('OpenSky returned 503');
      err.status = 503;
      throw err;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.json(), { error: 'feed-unavailable' });

  // The server is still fine afterwards.
  const home = await app.inject({ method: 'GET', url: '/' });
  assert.equal(home.statusCode, 200);

  const log = readFileSync(file, 'utf8');
  assert.match(log, /ERROR .*QFA1.*503/);
  await app.close();
});

// Aircraft states as the poller keeps them: the states array from OpenSky's states/all.
// [0] icao24, [1] callsign (padded), [3] time of position, [5] lon, [6] lat, [7] altitude in metres.
const warmStates = [
  ['7c6b2d', 'QFA1    ', 'Australia', 1757902800, 1757902800, 148.9, -31.2, 11280, false],
  ['7c806a', 'QFA10   ', 'Australia', 1757902801, 1757902801, 115.97, -31.91, 121.92, false],
];
const warmPoller = { latest: (name) => (name === 'opensky-states' ? warmStates : undefined) };

test('GET /api/flight/:number uses the states in memory when warm: asks only for the track, adds the latest position', async () => {
  const asked = [];
  const app = buildServer({
    poller: warmPoller,
    lookupFlight: async (callsign, options) => {
      asked.push([callsign, options]);
      return qfa1;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(asked, [['QFA1', { icao24: '7c6b2d' }]]); // icao24 known, so no states/all request
  const points = res.json().points;
  assert.equal(points.length, 3);
  assert.deepEqual(points.at(-1), { t: 1757902800, lat: -31.2, lon: 148.9, altM: 11280 });
  await app.close();
});

test('GET /api/flight/:number gives 404 not-found straight away when warm and no plane has that callsign', async () => {
  const asked = [];
  const app = buildServer({
    poller: warmPoller,
    lookupFlight: async (callsign) => {
      asked.push(callsign);
      return qfa1;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF144' });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not-found' });
  assert.deepEqual(asked, []); // no need to ask OpenSky
  await app.close();
});

test('GET /api/flight/:number asks OpenSky as before when the states are not in yet', async () => {
  const asked = [];
  const app = buildServer({
    poller: { latest: () => undefined },
    lookupFlight: async (callsign, options) => {
      asked.push([callsign, options]);
      return qfa1;
    },
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QF1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), qfa1);
  assert.deepEqual(asked, [['QFA1', undefined]]);
  await app.close();
});
