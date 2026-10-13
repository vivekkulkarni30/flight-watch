import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeMessage, feedProblems, ALL_CLEAR, UNAVAILABLE_TITLE } from '../public/route-message.js';

// Issue #23: "Nothing on your route right now" only when every feed has data. If a feed has none,
// say "Warning data unavailable" and which feed, and still list what we do have.

const ok = { status: 'ok', fetchedAt: '2026-10-11T20:39:12.000Z' };
const noData = { status: 'no-data', fetchedAt: null };
const etna = { id: 'volcano-1', kind: 'volcano', level: 'ORANGE', name: 'Etna' };

test('all feeds ok and nothing on the route: all clear', () => {
  const message = routeMessage([], { sigmets: ok, volcanoes: ok });
  assert.equal(message.unavailable, null);
  assert.deepEqual(message.items, []);
  assert.equal(message.allClear, true);
  assert.equal(ALL_CLEAR, 'Nothing on your route right now');
});

test('all feeds ok with warnings on the route: list them, no warning box', () => {
  const message = routeMessage([etna], { sigmets: ok, volcanoes: ok });
  assert.equal(message.unavailable, null);
  assert.deepEqual(message.items, [etna]);
  assert.equal(message.allClear, false);
});

test('SIGMETs have no data and nothing on the route: warning box, never all clear', () => {
  const message = routeMessage([], { sigmets: noData, volcanoes: ok });
  assert.deepEqual(message.unavailable, {
    title: UNAVAILABLE_TITLE,
    lines: ['SIGMETs: no data from aviationweather.gov right now'],
  });
  assert.equal(UNAVAILABLE_TITLE, 'Warning data unavailable');
  assert.equal(message.allClear, false);
});

test('SIGMETs have no data but a volcano is on the route: warning box and the volcano', () => {
  const message = routeMessage([etna], { sigmets: noData, volcanoes: ok });
  assert.deepEqual(message.unavailable.lines, ['SIGMETs: no data from aviationweather.gov right now']);
  assert.deepEqual(message.items, [etna]);
  assert.equal(message.allClear, false);
});

test('both feeds have no data: one line for each', () => {
  assert.deepEqual(feedProblems({ sigmets: noData, volcanoes: noData }), [
    'SIGMETs: no data from aviationweather.gov right now',
    'Volcano alerts: no data from USGS right now',
  ]);
});

test('no feeds in the answer at all counts as no data, not all clear', () => {
  const message = routeMessage([], undefined);
  assert.equal(message.unavailable.lines.length, 2);
  assert.equal(message.allClear, false);
});

test('a feed missing from the answer counts as no data', () => {
  assert.deepEqual(feedProblems({ sigmets: ok }), ['Volcano alerts: no data from USGS right now']);
});

test('no onRoute at all is treated as an empty list', () => {
  const message = routeMessage(undefined, { sigmets: ok, volcanoes: ok });
  assert.deepEqual(message.items, []);
  assert.equal(message.allClear, true);
});
