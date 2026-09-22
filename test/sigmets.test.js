import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSigmets } from '../server/feeds/sigmets.js';

// 9 real SIGMETs from aviationweather.gov, trimmed (see data/README.md).
const sample = readFileSync(new URL('./fixtures/sigmets-sample.json', import.meta.url), 'utf8');

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
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-sigmets-'));
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

test('fetchSigmets asks aviationweather.gov for JSON and says who is asking', async (t) => {
  captureLog(t);
  const { fetch, calls } = fakeFetch();
  await fetchSigmets({ fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://aviationweather.gov/api/data/isigmet?format=json');
  assert.match(calls[0].options.headers['User-Agent'], /flight-watch/);
});

test('fetchSigmets turns the sample into Warnings with polygons as [lat, lon] pairs', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const warnings = await fetchSigmets({ fetch });

  assert.ok(warnings.length > 0);
  for (const w of warnings) {
    assert.equal(w.kind, 'sigmet');
    assert.equal(w.level, null);
    assert.equal(w.shape.type, 'polygon');
    assert.ok(w.shape.coords.length >= 3, `${w.id} has only ${w.shape.coords.length} points`);
    for (const [lat, lon] of w.shape.coords) {
      assert.ok(lat >= -90 && lat <= 90, `${w.id}: lat ${lat}`);
      assert.ok(lon >= -180 && lon <= 180, `${w.id}: lon ${lon}`);
    }
  }
});

test('fetchSigmets reads the Etna ash warning: name, times, and the polygon with lat first', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const etna = (await fetchSigmets({ fetch })).find((w) => w.id === 'LIRR-1-1793319000');

  assert.deepEqual(etna, {
    id: 'LIRR-1-1793319000',
    kind: 'sigmet',
    hazard: 'VA',
    level: null,
    name: 'Volcanic ash, ROMA FIR',
    validFrom: '2026-10-30T00:10:00.000Z',
    validTo: '2026-10-30T06:10:00.000Z',
    // The feed gives { lon, lat } and repeats the first point at the end; we keep each corner once.
    shape: {
      type: 'polygon',
      coords: [
        [37.45, 15.45],
        [37.75, 15],
        [37.6, 15.25],
        [37.55, 15.45],
      ],
    },
  });
});

test('fetchSigmets keeps every hazard in the sample', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const hazards = new Set((await fetchSigmets({ fetch })).map((w) => w.hazard));
  assert.deepEqual([...hazards].sort(), ['ICE', 'MTW', 'TC', 'TS', 'TURB', 'VA']);
});

test('fetchSigmets gives readable names, without the FIR code twice', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const names = new Set((await fetchSigmets({ fetch })).map((w) => w.name));
  assert.ok(names.has('Mountain waves, SHANNON FIR'));
  assert.ok(names.has('Turbulence, MELBOURNE FIR'));
  assert.ok(names.has('Thunderstorms, BRAZZAVILLE FIR'));
  assert.ok(names.has('Icing, MAGADAN FIR'));
  assert.ok(names.has('Tropical cyclone IN-FA, OAKLAND OCEANIC FIR')); // no FIR code in front of this one
});

test('fetchSigmets keeps a polygon that is not closed (Melbourne V15) with all its corners', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const v15 = (await fetchSigmets({ fetch })).find((w) => w.id.startsWith('YMMM-V15-'));
  assert.equal(v15.shape.coords.length, 6);
  assert.deepEqual(v15.shape.coords[0], [-21.333, 89]);
  assert.deepEqual(v15.shape.coords.at(-1), [-36.833, 111.5]);
});

test('fetchSigmets splits an AREAS warning into one Warning per polygon, and wraps longitudes past 180', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const magadan = (await fetchSigmets({ fetch })).filter((w) => w.id.startsWith('UHMM-M01-'));
  assert.equal(magadan.length, 3);
  assert.deepEqual(
    magadan.map((w) => w.id),
    ['UHMM-M01-1793332800-1', 'UHMM-M01-1793332800-2', 'UHMM-M01-1793332800-3'],
  );
  // The third part is given as 180 to 190.5 east; drawn the usual way, that's -180 to -169.5.
  const lons = magadan[2].shape.coords.map(([, lon]) => lon);
  assert.equal(Math.min(...lons), -180);
  assert.equal(Math.max(...lons), -169.5);
});

test('fetchSigmets leaves out a warning that is a single point, and logs it', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch();
  const warnings = await fetchSigmets({ fetch });
  assert.equal(warnings.find((w) => w.id.startsWith('RJJJ-R02-')), undefined);
  assert.match(readLog(), /INFO  sigmet RJJJ R02 has 1 point, not a polygon: left out/);
});

test('fetchSigmets returns [] for a 204 (no data) and logs it as INFO', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch(204);
  assert.deepEqual(await fetchSigmets({ fetch }), []);
  assert.match(readLog(), /INFO  sigmet feed returned 204/);
});

test('fetchSigmets throws with status 500 and logs a WARN when the feed fails', async (t) => {
  const readLog = captureLog(t);
  const { fetch } = fakeFetch(500, 'Internal Server Error');
  await assert.rejects(fetchSigmets({ fetch }), (err) => err.status === 500);
  assert.match(readLog(), /WARN  sigmet feed returned 500/);
});

test('fetchSigmets keeps one copy of a SIGMET sent twice (Brazzaville A1), so every id is unique', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const warnings = await fetchSigmets({ fetch });
  const ids = warnings.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id.startsWith('FCCC-A1-')).length, 1);
});

test('fetchSigmets says when an area is a forecast, and names the cyclone', async (t) => {
  captureLog(t);
  const { fetch } = fakeFetch();
  const byId = new Map((await fetchSigmets({ fetch })).map((w) => [w.id, w]));
  assert.equal(byId.get('LIRR-1F-1793319000').name, 'Volcanic ash, ROMA FIR (forecast area)');
  assert.equal(byId.get('LIRR-1-1793319000').name, 'Volcanic ash, ROMA FIR');
  assert.equal(byId.get('KZAK-TANGO 31-1793323200').name, 'Tropical cyclone IN-FA, OAKLAND OCEANIC FIR');
});
