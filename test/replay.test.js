import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../server/server.js';
import { clearCache } from '../server/cache.js';
import { startPolling } from '../server/poller.js';
import { applyReplay } from '../server/replay.js';
import { lookupFlight as lookupFromOpenSky } from '../server/feeds/opensky.js';
import { fetchSigmets, parseSigmets } from '../server/feeds/sigmets.js';
import { fetchVolcanoes, parseVolcanoes } from '../server/feeds/volcanoes.js';

// Replay mode: REPLAY=<name> runs the app on saved answers from replay/<name>/ instead of the live feeds.
// Each feed is replayed only if its file is in the folder; the others stay live.

beforeEach(() => clearCache());

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const readFixture = (name) => JSON.parse(readFileSync(fixture(name), 'utf8'));

// Make a scenario folder in a temporary place, with the given files copied from test/fixtures:
//   scenario(t, { 'flight-QFA145.json': 'opensky-track-sample.json' })
// Returns the folder that holds the scenarios (what applyReplay calls root), with the scenario named 'test'.
function scenario(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'flight-watch-replay-'));
  mkdirSync(join(root, 'test'));
  for (const [name, from] of Object.entries(files)) copyFileSync(fixture(from), join(root, 'test', name));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Send the log to a temporary file for one test, so we can read the lines back.
function captureLog(t) {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-replay-log-'));
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = join(folder, 'test.log');
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });
  return () => readFileSync(process.env.LOG_FILE, 'utf8');
}

// A stand-in for fetch that answers every outside feed from the test fixtures, and remembers each URL asked.
function fakeFetch() {
  const urls = [];
  const answers = [
    ['opensky-network.org/api/states/all', 'opensky-states-sample.json'],
    ['opensky-network.org/api/tracks/all', 'opensky-track-sample.json'],
    ['aviationweather.gov', 'sigmets-sample.json'],
    ['volcanoes.usgs.gov', 'volcanoes-sample.json'],
  ];
  const fetch = async (url) => {
    urls.push(String(url));
    const [, file] = answers.find(([part]) => String(url).includes(part));
    return new Response(readFileSync(fixture(file), 'utf8'), { status: 200 });
  };
  return { fetch, urls };
}

// The live feeds, as server.js sets them up, but asking the fake fetch instead of the network.
function liveFeeds(fetch) {
  return {
    lookupFlight: (callsign) => lookupFromOpenSky(callsign, { fetch }),
    sources: [
      { name: 'sigmets', everySeconds: 60, fetch: () => fetchSigmets({ fetch }) },
      { name: 'volcanoes', everySeconds: 600, fetch: () => fetchVolcanoes({ fetch }) },
    ],
  };
}

// Start the poller and wait until every feed has its first answer.
async function poll(t, sources) {
  const poller = startPolling({ sources, log: { info() {}, warn() {} } });
  t.after(() => poller.stopPolling());
  for (let i = 0; i < 100 && sources.some((s) => poller.latest(s.name).fetchedAt === null); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return poller;
}

async function get(app, url) {
  const res = await app.inject({ method: 'GET', url });
  assert.equal(res.statusCode, 200);
  return res.json();
}

test('replay: /api/flight/QF145 gives the saved track as a path, without asking OpenSky', async (t) => {
  captureLog(t);
  const root = scenario(t, { 'flight-QFA145.json': 'opensky-track-sample.json' });
  const { fetch, urls } = fakeFetch();
  const replay = applyReplay('test', { root, ...liveFeeds(fetch) });

  const app = buildServer({ lookupFlight: replay.lookupFlight });
  const flight = await get(app, '/api/flight/QF145');
  await app.close();

  const track = readFixture('opensky-track-sample.json');
  assert.equal(flight.callsign, 'QFA145');
  assert.equal(flight.icao24, '7c5324');
  assert.equal(flight.points.length, 20);
  assert.deepEqual(flight.points[0], { t: 1793326573, lat: -33.9598, lon: 151.191, altM: -304 });
  assert.deepEqual(flight.points.at(-1).t, track.path.at(-1)[0]);
  assert.deepEqual(urls, []); // OpenSky was never asked
});

test('replay: /api/warnings gives the saved SIGMETs and volcano alerts, with status ok', async (t) => {
  captureLog(t);
  const root = scenario(t, { 'sigmets.json': 'sigmets-sample.json', 'volcanoes.json': 'volcanoes-sample.json' });
  const { fetch, urls } = fakeFetch();
  const replay = applyReplay('test', { root, ...liveFeeds(fetch) });

  const app = buildServer({ poller: await poll(t, replay.sources) });
  const answer = await get(app, '/api/warnings');
  await app.close();

  const sigmets = parseSigmets(readFixture('sigmets-sample.json'));
  const volcanoes = parseVolcanoes(readFixture('volcanoes-sample.json'));
  assert.ok(sigmets.length > 0 && volcanoes.length > 0);
  assert.deepEqual(answer.warnings, [...sigmets, ...volcanoes]);
  assert.equal(answer.feeds.sigmets.status, 'ok');
  assert.equal(answer.feeds.volcanoes.status, 'ok');
  assert.equal(typeof answer.feeds.sigmets.fetchedAt, 'string');
  assert.deepEqual(urls, []); // neither feed was asked
});

test('replay: a feed with no file in the scenario stays live', async (t) => {
  captureLog(t);
  // Only the flight is saved, so the SIGMETs, the volcano alerts and any other flight come from the feeds.
  const root = scenario(t, { 'flight-QFA145.json': 'opensky-track-sample.json' });
  const { fetch, urls } = fakeFetch();
  const replay = applyReplay('test', { root, ...liveFeeds(fetch) });

  const app = buildServer({ lookupFlight: replay.lookupFlight, poller: await poll(t, replay.sources) });
  const answer = await get(app, '/api/warnings');
  assert.equal(answer.feeds.sigmets.status, 'ok');
  assert.equal(answer.feeds.volcanoes.status, 'ok');
  assert.ok(urls.some((u) => u.includes('aviationweather.gov')));
  assert.ok(urls.some((u) => u.includes('volcanoes.usgs.gov')));

  // QF1 isn't in the scenario, so we ask OpenSky as usual.
  const flight = await get(app, '/api/flight/QF1');
  assert.equal(flight.callsign, 'QFA1');
  assert.ok(urls.some((u) => u.includes('opensky-network.org/api/states/all')));
  await app.close();
});

test('replay: logs which feeds are replayed and which stay live', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch();

  const all = scenario(t, {
    'flight-QFA145.json': 'opensky-track-sample.json',
    'sigmets.json': 'sigmets-sample.json',
    'volcanoes.json': 'volcanoes-sample.json',
  });
  applyReplay('test', { root: all, ...liveFeeds(fetch) });
  assert.match(readLog(), /INFO  replay "test": replaying flight-QFA145, sigmets, volcanoes; live: other flights\n/);

  const flightOnly = scenario(t, { 'flight-QFA145.json': 'opensky-track-sample.json' });
  applyReplay('test', { root: flightOnly, ...liveFeeds(fetch) });
  assert.match(readLog(), /INFO  replay "test": replaying flight-QFA145; live: sigmets, volcanoes, other flights\n/);
});

test('replay: an unknown scenario stops with a clear error instead of quietly going live', (t) => {
  captureLog(t);
  const root = scenario(t, {});
  const { fetch } = fakeFetch();
  assert.throws(() => applyReplay('nope', { root, ...liveFeeds(fetch) }), /replay scenario "nope" not found/);
});
