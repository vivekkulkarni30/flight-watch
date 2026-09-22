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

// Wait until check() is true, giving the timers a chance to run. Fails after a second.
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('gave up waiting');
}

test('latest() is undefined before the first fetch, then the fetched data', async (t) => {
  const log = fakeLog();
  const poller = startPolling({
    log,
    sources: [{ name: 'sigmets', everySeconds: 60, fetch: async () => ['storm', 'ash'] }],
  });
  t.after(() => poller.stopPolling());

  assert.equal(poller.latest('sigmets'), undefined);
  await waitFor(() => poller.latest('sigmets'));
  assert.deepEqual(poller.latest('sigmets'), ['storm', 'ash']);
  assert.match(log.lines[0], /^INFO sigmets: fetched 2 items$/);
});

test('fetches again every everySeconds and keeps the newest result', async (t) => {
  let calls = 0;
  const poller = startPolling({
    log: fakeLog(),
    sources: [{ name: 'counter', everySeconds: 0.01, fetch: async () => [++calls] }],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => calls >= 3);
  assert.ok(poller.latest('counter')[0] >= 2);
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
          if (calls === 1) return ['storm'];
          const err = new Error('aviationweather.gov returned 503');
          err.status = 503;
          throw err;
        },
      },
    ],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => log.lines.some((line) => line.startsWith('WARN')));
  assert.deepEqual(poller.latest('sigmets'), ['storm']);
  const warn = log.lines.find((line) => line.startsWith('WARN'));
  assert.match(warn, /^WARN sigmets: fetch failed with status 503, keeping previous data/);
});

test('sources are kept apart by name', async (t) => {
  const poller = startPolling({
    log: fakeLog(),
    sources: [
      { name: 'a', everySeconds: 60, fetch: async () => ['from a'] },
      { name: 'b', everySeconds: 60, fetch: async () => ['from b'] },
    ],
  });
  t.after(() => poller.stopPolling());

  await waitFor(() => poller.latest('a') && poller.latest('b'));
  assert.deepEqual(poller.latest('a'), ['from a']);
  assert.deepEqual(poller.latest('b'), ['from b']);
  assert.equal(poller.latest('nobody'), undefined);
});

test('stopPolling() stops any more fetches', async () => {
  let calls = 0;
  const poller = startPolling({
    log: fakeLog(),
    sources: [{ name: 'counter', everySeconds: 0.01, fetch: async () => [++calls] }],
  });
  await waitFor(() => calls >= 1);
  poller.stopPolling();
  const after = calls;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(calls <= after + 1); // one fetch may already have been on its way
});
