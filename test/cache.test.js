import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cached, clearCache, setClock } from '../server/cache.js';

// A clock we move by hand, so the tests don't have to wait 30 real seconds.
let now = 0;
beforeEach(() => {
  clearCache();
  now = 1_000_000;
  setClock(() => now);
});

// A fetcher that counts its calls and hands back the next answer each time.
function counter(...answers) {
  const fetcher = async () => {
    fetcher.calls++;
    const answer = answers[Math.min(fetcher.calls, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  fetcher.calls = 0;
  return fetcher;
}

function httpError(status) {
  const err = new Error(`OpenSky returned ${status}`);
  err.status = status;
  return err;
}

// Send the log to a temporary file so a test can read the lines back.
function captureLog(t) {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-cache-'));
  const file = join(folder, 'test.log');
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = file;
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });
  return () => readFileSync(file, 'utf8');
}

test('within the TTL the stored value comes back without calling the fetcher again', async () => {
  const fetcher = counter('first', 'second');
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'first');
  now += 29_000;
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'first');
  assert.equal(fetcher.calls, 1);
});

test('after the TTL it calls the fetcher again and keeps the new value', async () => {
  const fetcher = counter('first', 'second');
  await cached('flight:QFA1', 30, fetcher);
  now += 31_000;
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'second');
  assert.equal(fetcher.calls, 2);
  now += 1_000;
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'second'); // fresh again
  assert.equal(fetcher.calls, 2);
});

test('names are kept apart', async () => {
  assert.equal(await cached('flight:QFA1', 30, counter('one')), 'one');
  assert.equal(await cached('flight:QFA2', 30, counter('two')), 'two');
});

test('a null answer ("no such flight") is cached too', async () => {
  const fetcher = counter(null);
  assert.equal(await cached('flight:QFA999', 30, fetcher), null);
  assert.equal(await cached('flight:QFA999', 30, fetcher), null);
  assert.equal(fetcher.calls, 1);
});

test('a 429 after the TTL serves the older value and logs a WARN', async (t) => {
  const readLog = captureLog(t);
  const fetcher = counter('first', httpError(429));
  await cached('flight:QFA1', 30, fetcher);
  now += 31_000;
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'first');
  assert.equal(fetcher.calls, 2);
  assert.match(readLog(), /WARN  flight:QFA1 rate-limited, serving cached data/);
});

test('any other failure after the TTL also serves the older value and logs its status', async (t) => {
  const readLog = captureLog(t);
  const fetcher = counter('first', httpError(503));
  await cached('flight:QFA1', 30, fetcher);
  now += 31_000;
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'first');
  assert.match(readLog(), /WARN  flight:QFA1 failed with status 503, serving cached data/);
});

test('a failure with no older value is passed on', async () => {
  const fetcher = counter(httpError(429));
  await assert.rejects(cached('flight:QFA1', 30, fetcher), (err) => err.status === 429);
});

test('a failure is not stored: the next call tries again', async (t) => {
  captureLog(t);
  const fetcher = counter(httpError(429), 'later');
  await assert.rejects(cached('flight:QFA1', 30, fetcher));
  assert.equal(await cached('flight:QFA1', 30, fetcher), 'later');
  assert.equal(fetcher.calls, 2);
});
