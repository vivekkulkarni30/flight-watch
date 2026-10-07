import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server/server.js';

// A stand-in for the poller: latest(name) answers from a plain object.
const fakePoller = (results) => ({ latest: (name) => results[name] });

const warning = {
  id: 'sigmet-1',
  kind: 'turbulence',
  area: [[-34, 150], [-33, 152], [-35, 152]],
};

test('GET /api/warnings returns the latest SIGMET warnings from the poller', async () => {
  const app = buildServer({ poller: fakePoller({ sigmets: [warning] }) });
  const res = await app.inject({ method: 'GET', url: '/api/warnings' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [warning]);
  await app.close();
});

test('GET /api/warnings returns [] before the first fetch has come back', async () => {
  const app = buildServer({ poller: fakePoller({}) });
  const res = await app.inject({ method: 'GET', url: '/api/warnings' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
  await app.close();
});

test('GET /api/warnings returns [] when there is no poller at all (tests, or polling not started)', async () => {
  const app = buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/warnings' });
  assert.deepEqual(res.json(), []);
  await app.close();
});

const volcano = {
  id: 'volcano-1',
  kind: 'volcano',
  area: [[-6.1, 105.4], [-6.1, 105.5], [-6.2, 105.5]],
};

test('GET /api/warnings returns the SIGMETs and the volcano alerts together', async () => {
  const app = buildServer({ poller: fakePoller({ sigmets: [warning], volcanoes: [volcano] }) });
  const res = await app.inject({ method: 'GET', url: '/api/warnings' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [warning, volcano]);
  await app.close();
});

test('GET /api/warnings returns just the SIGMETs while the volcano alerts are empty or not fetched yet', async () => {
  for (const volcanoes of [[], undefined]) {
    const app = buildServer({ poller: fakePoller({ sigmets: [warning], volcanoes }) });
    const res = await app.inject({ method: 'GET', url: '/api/warnings' });
    assert.deepEqual(res.json(), [warning]);
    await app.close();
  }
});
