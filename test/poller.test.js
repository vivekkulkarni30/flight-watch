import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPolling } from '../server/poller.js';

// A stand-in for server/log.js that keeps the lines instead of printing them.
function fakeLog() {
  const lines = [];
  return {
    lines,
    info: (message) => lines.push(`INFO ${message}`),
    warn: (message) => lines.push(`WARN ${message}`),
    error: (message) => lines.push(`ERROR ${message}`),
  };
}

// What a feed hands the poller: a status, when it arrived, and the items (see server/feeds/sigmets.js).
const ok = (items) => ({ status: 'ok', fetchedAt: '2026-10-12T00:00:00.000Z', items });
const noData = () => ({ status: 'no-data', fetchedAt: null, items: [] });

// Wait until check() is true, giving the timers a chance to run. Fails after a second.
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('gave up waiting');
}

test('latest() is no-data before the first fetch (not "no warnings"), then the fetched result', async (t) => {
  const log = fakeLog();
  const poller = startPolling({
    log,
    sources: [{ name: 'sigmets', everySeconds: 60, fetch: async () => ok(['storm', 'ash']) }],
  });
  t.after(() => poller.stopPolling());

  assert.deepEqual(poller.latest('sigmets'), noData());
  await waitFor(() => poller.latest('sigmets').status === 'ok');
  assert.deepEqual(poller.latest('sigmets'), ok(['storm', 'ash']));
  assert.match(log.lines[0], /^INFO sigmets: fetched 2 items$/);
});

test('fetches again every everySeconds and keeps the newest result', async (t) => {
  let calls = 0;
  const poller = startPolling({
    log: fakeLog(),
    sources: [{ name: 'counter', everySeconds: 0.01, fetch: async () => ok([++calls]) }],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => calls >= 3);
  assert.ok(poller.latest('counter').items[0] >= 2);
});

test('logs an INFO line only when the number of items changes, to keep the log readable', async (t) => {
  const log = fakeLog();
  const answers = [['storm', 'ash'], ['storm', 'ash'], ['storm', 'ash'], ['storm']];
  let calls = 0;
  const poller = startPolling({
    log,
    sources: [{ name: 'sigmets', everySeconds: 0.01, fetch: async () => ok(answers[Math.min(calls++, answers.length - 1)]) }],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => calls >= 6);
  assert.deepEqual(log.lines, ['INFO sigmets: fetched 2 items', 'INFO sigmets: fetched 1 items']);
});

test('a failing fetch keeps the previous data and logs a WARN with the status', async (t) => {
  const log = fakeLog();
  let calls = 0;
  const poller = startPolling({
    log,
    sources: [
      {
        name: 'sigmets',
        everySeconds: 0.01,
        fetch: async () => {
          calls++;
          if (calls === 1) return ok(['storm']);
          const err = new Error('aviationweather.gov returned 503');
          err.status = 503;
          throw err;
        },
      },
    ],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => log.lines.some((line) => line.startsWith('WARN')));
  assert.deepEqual(poller.latest('sigmets'), ok(['storm']));
  const warn = log.lines.find((line) => line.startsWith('WARN'));
  assert.match(warn, /^WARN sigmets: fetch failed with status 503, keeping previous data/);
});

test('a no-data answer replaces the list, and is not logged as "fetched 0 items" (issue #23)', async (t) => {
  const log = fakeLog();
  // The feed answers with whatever `answer` is at the time: a list, then a 204 (no data), then a list again.
  let answer = ok(['storm', 'ash']);
  const poller = startPolling({ log, sources: [{ name: 'sigmets', everySeconds: 0.01, fetch: async () => answer }] });
  t.after(() => poller.stopPolling());

  await waitFor(() => poller.latest('sigmets').status === 'ok');
  answer = noData();
  // The poller says so, instead of keeping the old list or reporting an empty one as good news.
  await waitFor(() => poller.latest('sigmets').status === 'no-data');
  assert.deepEqual(poller.latest('sigmets'), noData());
  answer = ok(['storm', 'ash']);
  await waitFor(() => poller.latest('sigmets').status === 'ok');

  // The feed logs the 204s itself (as WARN). The poller logs the first fetch, and again when the feed comes back.
  assert.deepEqual(log.lines, ['INFO sigmets: fetched 2 items', 'INFO sigmets: fetched 2 items']);
});

test('sources are kept apart by name', async (t) => {
  const poller = startPolling({
    log: fakeLog(),
    sources: [
      { name: 'a', everySeconds: 60, fetch: async () => ok(['from a']) },
      { name: 'b', everySeconds: 60, fetch: async () => ok(['from b']) },
    ],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => poller.latest('a').status === 'ok' && poller.latest('b').status === 'ok');
  assert.deepEqual(poller.latest('a'), ok(['from a']));
  assert.deepEqual(poller.latest('b'), ok(['from b']));
  assert.deepEqual(poller.latest('nobody'), noData());
});

test('stopPolling() stops any more fetches', async () => {
  let calls = 0;
  const poller = startPolling({
    log: fakeLog(),
    sources: [{ name: 'counter', everySeconds: 0.01, fetch: async () => ok([++calls]) }],
  });
  await waitFor(() => calls >= 1);
  poller.stopPolling();
  const after = calls;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(calls <= after + 1); // one fetch may already have been on its way
});
