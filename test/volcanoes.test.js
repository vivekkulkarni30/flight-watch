import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchVolcanoes } from '../server/feeds/volcanoes.js';

// The real list of elevated US volcanoes from USGS, 4 volcanoes (see data/README.md).
const sample = readFileSync(new URL('./fixtures/volcanoes-sample.json', import.meta.url), 'utf8');

// Akutan as USGS's getMonitoredVolcanoes list gave it on 2026-10-30: GREEN, so not elevated. The elevated list
// didn't have a GREEN one that day, so we add this real row to check that GREEN is left out.
const akutanGreen = {
  volcano_name: 'Akutan',
  vnum: '311320',
  sent_utc: '2019-09-06 18:29:39',
  sent_unixtime: 1567794579,
  alert_level: 'NORMAL',
  color_code: 'GREEN',
  obs_fullname: 'Alaska Volcano Observatory',
  obs_abbr: 'avo',
  notice_type_cd: 'IS',
  notice_identifier: 'DOI-USGS-AVO-2019-09-04T15:47:55-08:00',
};

// A stand-in for fetch that answers with the given status and body, and remembers what it was asked.
function fakeFetch(status = 200, body = sample) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(status === 204 ? null : body, { status });
  };
  return { fetch, calls };
}

// Send the log to a temporary file for one test, so we can read the lines back.
function captureLog(t) {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-volcanoes-'));
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

test('fetchVolcanoes asks USGS for the elevated volcanoes and says who is asking', async (t) => {
  captureLog(t);
  const { fetch, calls } = fakeFetch();
  await fetchVolcanoes({ fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes');
  assert.match(calls[0].options.headers['User-Agent'], /flight-watch/);
});

test('fetchVolcanoes turns Great Sitkin (ORANGE) into a 100 km circle around the volcano', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const sitkin = (await fetchVolcanoes({ fetch })).items.find((w) => w.id === 'volcano-311120');

  assert.deepEqual(sitkin, {
    id: 'volcano-311120',
    kind: 'volcano',
    hazard: 'VA',
    level: 'ORANGE',
    name: 'Great Sitkin (WATCH, aviation code ORANGE)',
    validFrom: '2026-10-29T19:39:34.000Z', // the notice's sent time; the feed gives Unix seconds
    validTo: null, // an alert lasts until USGS changes it
    // The position comes from data/us-volcanoes.csv; the feed doesn't have one.
    shape: { type: 'circle', center: [52.0765, -176.1109], radiusKm: 100 },
  });
});

test('fetchVolcanoes gives every volcano in the sample its level and radius', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const summary = (await fetchVolcanoes({ fetch })).items.map((w) => [w.name, w.level, w.shape.radiusKm]);
  assert.deepEqual(summary, [
    ['Great Sitkin (WATCH, aviation code ORANGE)', 'ORANGE', 100],
    ['Shishaldin (ADVISORY, aviation code YELLOW)', 'YELLOW', 50],
    ['Kilauea (ADVISORY, aviation code YELLOW)', 'YELLOW', 50],
    ['Ahyi Seamount (ADVISORY, aviation code YELLOW)', 'YELLOW', 50],
  ]);
});

test('fetchVolcanoes keeps east longitudes (Ahyi Seamount, near Guam)', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const ahyi = (await fetchVolcanoes({ fetch })).items.find((w) => w.id === 'volcano-284141');
  assert.deepEqual(ahyi.shape.center, [20.437, 145.03]);
});

test('fetchVolcanoes makes a RED alert a 200 km circle', async (t) => {
  captureLog(t);
  const rows = JSON.parse(sample);
  rows[0] = { ...rows[0], color_code: 'RED', alert_level: 'WARNING' };
  const { fetch } = fakeFetch(200, JSON.stringify(rows));
  const sitkin = (await fetchVolcanoes({ fetch })).items.find((w) => w.id === 'volcano-311120');
  assert.equal(sitkin.level, 'RED');
  assert.equal(sitkin.shape.radiusKm, 200);
  assert.equal(sitkin.name, 'Great Sitkin (WARNING, aviation code RED)');
});

test('fetchVolcanoes leaves out GREEN volcanoes and ones with no colour code', async (t) => {
  captureLog(t);
  const rows = [...JSON.parse(sample), akutanGreen, { ...akutanGreen, color_code: 'UNASSIGNED' }, { ...akutanGreen, color_code: null }];
  const { fetch } = fakeFetch(200, JSON.stringify(rows));
  const { items: warnings } = await fetchVolcanoes({ fetch });
  assert.equal(warnings.length, 4);
  assert.equal(warnings.find((w) => w.id === 'volcano-311320'), undefined);
});

test('fetchVolcanoes leaves out a volcano we have no position for, and logs a WARN', async (t) => {
  const readLog = captureLog(t);
  const rows = [{ ...JSON.parse(sample)[0], vnum: '123456', volcano_name: 'Nowhere' }];
  const { fetch } = fakeFetch(200, JSON.stringify(rows));
  assert.deepEqual((await fetchVolcanoes({ fetch })).items, []);
  assert.match(readLog(), /WARN  volcano Nowhere \(vnum 123456\) is not in data\/us-volcanoes.csv: left out/);
});

test('fetchVolcanoes uses the name for the id when there is no vnum, and null when there is no sent time', async (t) => {
  captureLog(t);
  // Kilauea's position is found by name when the vnum is missing.
  const rows = [{ ...JSON.parse(sample)[2], vnum: null, sent_unixtime: null }];
  const { fetch } = fakeFetch(200, JSON.stringify(rows));
  const { items: [kilauea] } = await fetchVolcanoes({ fetch });
  assert.equal(kilauea.id, 'volcano-Kilauea');
  assert.equal(kilauea.validFrom, null);
  assert.deepEqual(kilauea.shape.center, [19.421, -155.287]);
});

test('fetchVolcanoes says ok, with the time it arrived, when USGS answers with a list', async (t) => {
  captureLog(t);
  const before = Date.now();
  const result = await fetchVolcanoes({ fetch: fakeFetch().fetch });
  assert.equal(result.status, 'ok');
  assert.equal(result.items.length, 4);
  assert.ok(Date.parse(result.fetchedAt) >= before - 1000, `fetchedAt ${result.fetchedAt}`);
  assert.equal(result.fetchedAt, new Date(result.fetchedAt).toISOString()); // an ISO time
});

test('fetchVolcanoes says no-data for a 204, not "no alerts", and logs it as a WARN (issue #23)', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch(204);
  assert.deepEqual(await fetchVolcanoes({ fetch }), { status: 'no-data', fetchedAt: null, items: [] });
  assert.match(readLog(), /WARN  volcano feed returned 204/);
});

test('fetchVolcanoes says no-data for an empty body (WARN), but ok for an empty list', async (t) => {
  const readLog = captureLog(t);
  assert.deepEqual(await fetchVolcanoes({ fetch: fakeFetch(200, '').fetch }), { status: 'no-data', fetchedAt: null, items: [] });
  assert.match(readLog(), /WARN  volcano feed returned 200 with an empty body/);
  // An empty list is a real answer: no US volcano is above normal right now.
  const empty = await fetchVolcanoes({ fetch: fakeFetch(200, '[]').fetch });
  assert.equal(empty.status, 'ok');
  assert.deepEqual(empty.items, []);
});

test('fetchVolcanoes throws with status 500 and logs a WARN when the feed fails', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch(500, 'Internal Server Error');
  await assert.rejects(fetchVolcanoes({ fetch }), (err) => err.status === 500);
  assert.match(readLog(), /WARN  volcano feed returned 500/);
});
