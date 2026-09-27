import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, segmentsCross, kmFromSegment } from '../core/route-check.js';

// A thunderstorm area over the Tasman Sea, east of Sydney. Corners are [lat, lon].
const tasmanStorm = [[-32.5, 153.4], [-32.5, 156.4], [-35.5, 156.4], [-35.5, 153.4]];

const sydney = { lat: -33.95, lon: 151.18 };
const auckland = { lat: -37.01, lon: 174.79 };

test('pointInPolygon: a point in the middle of the storm is inside', () => {
  assert.equal(pointInPolygon({ lat: -34, lon: 155 }, tasmanStorm), true);
});

test('pointInPolygon: Sydney is outside the storm', () => {
  assert.equal(pointInPolygon(sydney, tasmanStorm), false);
});

test('segmentsCross: Sydney to Auckland crosses the storm\'s western edge', () => {
  const westEdgeTop = { lat: -32.5, lon: 153.4 };
  const westEdgeBottom = { lat: -35.5, lon: 153.4 };
  assert.equal(segmentsCross(sydney, auckland, westEdgeTop, westEdgeBottom), true);
});

test('segmentsCross: two legs side by side do not cross', () => {
  const a = { lat: -33, lon: 150 };
  const b = { lat: -33, lon: 152 };
  const c = { lat: -34, lon: 150 };
  const d = { lat: -34, lon: 152 };
  assert.equal(segmentsCross(a, b, c, d), false);
});

test('kmFromSegment: a point one degree of latitude north of a leg is about 111 km away', () => {
  const km = kmFromSegment({ lat: -33, lon: 151 }, { lat: -34, lon: 150 }, { lat: -34, lon: 152 });
  assert.ok(Math.abs(km - 111) < 1, `got ${km}`);
});

test('kmFromSegment: past the end of a leg, it measures to the nearest end', () => {
  // Due east of the leg's eastern end, 1 degree of longitude at 34 S is about 92 km.
  const km = kmFromSegment({ lat: -34, lon: 153 }, { lat: -34, lon: 150 }, { lat: -34, lon: 152 });
  assert.ok(Math.abs(km - 92) < 1, `got ${km}`);
});
