import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, segmentsCross, kmFromSegment, warningsOnRoute } from '../core/route-check.js';

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

// warningsOnRoute ---------------------------------------------------------------------------------

// A Warning as the SIGMET feed gives it, around the given corners.
const sigmet = (id, coords) => ({
  id,
  kind: 'sigmet',
  hazard: 'TS',
  level: null,
  name: 'Thunderstorms, test FIR',
  validFrom: '2026-09-28T00:00:00.000Z',
  validTo: '2026-09-28T04:00:00.000Z',
  shape: { type: 'polygon', coords },
});

// A path in the shape /api/flight gives, through the given places.
let time = 1790000000;
const path = (...places) => ({
  callsign: 'TEST1',
  icao24: 'abc123',
  points: places.map(({ lat, lon }) => ({ t: (time += 60), lat, lon, altM: 10670 })),
});

const storm = sigmet('YBBB-1-1790000000', tasmanStorm);
const melbourne = { lat: -37.67, lon: 144.84 };
const singapore = { lat: 1.35, lon: 103.99 };
const jakarta = { lat: -6.13, lon: 106.66 };
// Thunderstorms over the Java Sea, between Singapore and Jakarta.
const javaSeaStorm = sigmet('WIIF-2-1790000000', [[-3, 105], [-3, 107], [-5, 107], [-5, 105]]);

test('warningsOnRoute: Sydney to Auckland flies straight through the Tasman storm', () => {
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), [storm]), [storm]);
});

test('warningsOnRoute: Singapore to Jakarta flies through the Java Sea storm, not the Tasman one', () => {
  assert.deepEqual(warningsOnRoute(path(singapore, jakarta), [storm, javaSeaStorm]), [javaSeaStorm]);
});

test('warningsOnRoute: Sydney to Melbourne, about 200 km from the storm, is clear', () => {
  assert.deepEqual(warningsOnRoute(path(sydney, melbourne), [storm]), []);
});

test('warningsOnRoute: passing 30 km north of the storm counts with the default 50 km, not with 10 km', () => {
  // Flying due east along 32.23 S; the storm's northern edge is at 32.5 S, 0.27 degrees (about 30 km) away.
  const nearMiss = path({ lat: -32.23, lon: 151 }, { lat: -32.23, lon: 158 });
  assert.deepEqual(warningsOnRoute(nearMiss, [storm]), [storm]);
  assert.deepEqual(warningsOnRoute(nearMiss, [storm], { bufferKm: 10 }), []);
});

test('warningsOnRoute: a path entirely inside the storm counts', () => {
  const inside = path({ lat: -33.5, lon: 154 }, { lat: -34.5, lon: 155.5 });
  assert.deepEqual(warningsOnRoute(inside, [storm]), [storm]);
});

test('warningsOnRoute: a path with a single point inside the storm counts', () => {
  assert.deepEqual(warningsOnRoute(path({ lat: -34, lon: 155 }), [storm]), [storm]);
});

test('warningsOnRoute: no warnings gives []', () => {
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), []), []);
});

test('warningsOnRoute: a path with no points gives []', () => {
  assert.deepEqual(warningsOnRoute(path(), [storm]), []);
});

test('warningsOnRoute: skips shapes it does not know how to check', () => {
  const circle = { ...storm, id: 'circle', shape: { type: 'circle', centre: [-34, 155], radiusKm: 100 } };
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), [circle, storm]), [storm]);
});

// Shapes as real feeds draw them ----------------------------------------------------------------

test('warningsOnRoute: a polygon whose last corner repeats the first works the same as one without', () => {
  // Many feeds close their polygons this way. Ours drops the repeat, but the check shouldn't depend on that.
  const closedStorm = sigmet('YBBB-1-closed', [...tasmanStorm, tasmanStorm[0]]);
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), [closedStorm]), [closedStorm]);
  assert.deepEqual(warningsOnRoute(path(sydney, melbourne), [closedStorm]), []);
  assert.deepEqual(warningsOnRoute(path({ lat: -34, lon: 155 }), [closedStorm]), [closedStorm]);
});

// An L-shaped storm over the South China Sea: one arm runs north along the coast of Vietnam
// (lon 108 to 111), the other east along the north of Borneo (lat 2 to 5). The open corner between
// the arms, north-east of them, is clear sky.
const lShapedStorm = sigmet('WMFC-3-1790000000', [[2, 108], [2, 118], [5, 118], [5, 111], [12, 111], [12, 108]]);
const manila = { lat: 14.51, lon: 121.02 };
const kotaKinabalu = { lat: 5.94, lon: 116.05 };
const hoChiMinhCity = { lat: 10.82, lon: 106.65 };

test('warningsOnRoute: Manila to Kota Kinabalu flies through the open corner of an L-shaped storm, so it is clear', () => {
  // Inside the box around the L, but about 100 km from the nearest arm. A check that only looked at the
  // box would wrongly count it.
  assert.deepEqual(warningsOnRoute(path(manila, kotaKinabalu), [lShapedStorm]), []);
});

test('warningsOnRoute: Ho Chi Minh City to Manila crosses the western arm of the L-shaped storm', () => {
  assert.deepEqual(warningsOnRoute(path(hoChiMinhCity, manila), [lShapedStorm]), [lShapedStorm]);
});

test('warningsOnRoute: a leg that only touches a corner of the storm counts, even with no buffer', () => {
  // Heading north-east, it passes exactly through the storm's north-west corner (32.5 S, 153.4 E):
  // west of the storm before it, north of it after.
  const grazing = path({ lat: -33.5, lon: 152.4 }, { lat: -31.5, lon: 154.4 });
  assert.deepEqual(warningsOnRoute(grazing, [storm]), [storm]);
  assert.deepEqual(warningsOnRoute(grazing, [storm], { bufferKm: 0 }), [storm]);
});

test('warningsOnRoute: a path that ends exactly on a corner of the storm counts, even with no buffer', () => {
  const toCorner = path(sydney, { lat: -32.5, lon: 153.4 });
  assert.deepEqual(warningsOnRoute(toCorner, [storm], { bufferKm: 0 }), [storm]);
});
