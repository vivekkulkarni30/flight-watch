import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../server/server.js';
import { clearCache, setClock } from '../server/cache.js';

// Searches are cached for 30 s (issue #11), so start every test with an empty cache.
beforeEach(() => clearCache());

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
  assert.deepEqual(res.json(), { ...qfa1, onRoute: [] }); // no poller, so no warnings on the route
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

test('two searches for the same flight within 30 s ask OpenSky once (issue #11)', async () => {
  let now = 1_000_000;
  setClock(() => now);
  const asked = [];
  const app = buildServer({
    lookupFlight: async (callsign) => {
      asked.push(callsign);
      return qfa1;
    },
  });

  const first = await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  now += 10_000;
  const second = await app.inject({ method: 'GET', url: '/api/flight/qfa1' });
  assert.deepEqual(second.json(), first.json());
  assert.deepEqual(asked, ['QFA1']);

  // A different flight is its own search.
  await app.inject({ method: 'GET', url: '/api/flight/QFA2' });
  assert.deepEqual(asked, ['QFA1', 'QFA2']);

  // After 30 s we ask again, so the path keeps moving.
  now += 25_000;
  await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  assert.deepEqual(asked, ['QFA1', 'QFA2', 'QFA1']);
  await app.close();
});

// Route check (core/route-check.js): the answer says which warnings the path passes near.
const fakePoller = (results) => ({ latest: (name) => results[name] });

const sigmet = (id, coords) => ({
  id,
  kind: 'sigmet',
  hazard: 'TS',
  level: null,
  name: 'Thunderstorms, MELBOURNE FIR',
  validFrom: '2026-09-28T00:00:00.000Z',
  validTo: '2026-09-28T04:00:00.000Z',
  shape: { type: 'polygon', coords },
});

test('GET /api/flight/:number includes onRoute: the warnings the path passes near', async () => {
  // qfa1 leaves Sydney heading north-west. One storm sits across its path, one is far out over the Tasman.
  const onPath = sigmet('YMMM-1', [[-32.5, 149.0], [-32.5, 151.0], [-33.5, 151.0], [-33.5, 149.0]]);
  const farAway = sigmet('YMMM-2', [[-36, 158], [-36, 160], [-38, 160], [-38, 158]]);
  const app = buildServer({
    lookupFlight: async () => qfa1,
    poller: fakePoller({ sigmets: [onPath, farAway] }),
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().onRoute, [onPath]);
  assert.deepEqual(res.json().points, qfa1.points); // the path itself is unchanged
  await app.close();
});

test('GET /api/flight/:number gives onRoute [] before the poller has fetched any warnings', async () => {
  const app = buildServer({ lookupFlight: async () => qfa1, poller: fakePoller({}) });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().onRoute, []);
  await app.close();
});

test('GET /api/flight/:number includes volcano alerts near the path in onRoute, after the SIGMETs', async () => {
  // A made-up alert for the test: 30 km around a point about 18 km off qfa1's path.
  const nearPath = {
    id: 'volcano-test',
    kind: 'volcano',
    hazard: 'VA',
    level: 'ORANGE',
    name: 'Test volcano',
    validFrom: '2026-09-28T00:00:00.000Z',
    validTo: '2026-09-29T00:00:00.000Z',
    shape: { type: 'circle', center: [-33.0, 150.6], radiusKm: 30 },
  };
  const onPath = sigmet('YMMM-1', [[-32.5, 149.0], [-32.5, 151.0], [-33.5, 151.0], [-33.5, 149.0]]);
  const app = buildServer({
    lookupFlight: async () => qfa1,
    poller: fakePoller({ sigmets: [onPath], volcanoes: [nearPath] }),
  });
  const res = await app.inject({ method: 'GET', url: '/api/flight/QFA1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().onRoute, [onPath, nearPath]);
  await app.close();
});
