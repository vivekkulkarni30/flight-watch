import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, segmentsCross, kmFromSegment, warningsOnRoute, densify } from '../core/route-check.js';

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

// Several warnings at once ----------------------------------------------------------------------

// Turbulence over Bass Strait, between Melbourne and Tasmania: well south of Sydney to Auckland.
const bassStraitStorm = sigmet('YMMM-4-1790000000', [[-39, 144], [-39, 148], [-40.5, 148], [-40.5, 144]]);
// Thunderstorms over the Riau Islands, just south of Singapore.
const riauStorm = sigmet('WSJC-5-1790000000', [[0.5, 104], [0.5, 105], [-0.5, 105], [-0.5, 104]]);

test('warningsOnRoute: of two warnings, only the one on the route comes back', () => {
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), [storm, bassStraitStorm]), [storm]);
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), [bassStraitStorm, storm]), [storm]);
});

test('warningsOnRoute: keeps the order of the warnings list, not the order the flight meets them', () => {
  // Leaving Singapore, the flight meets the Riau storm first, then the Java Sea one.
  const result = warningsOnRoute(path(singapore, jakarta), [javaSeaStorm, bassStraitStorm, riauStorm]);
  assert.deepEqual(result, [javaSeaStorm, riauStorm]);
});

test('warningsOnRoute: a shape it does not know among polygons is skipped, and the polygons after it are still checked', () => {
  const line = { ...riauStorm, id: 'line', shape: { type: 'line', coords: [[1, 104], [-6, 107]] } };
  const point = { ...riauStorm, id: 'point', shape: { type: 'point', coords: [-4, 106] } };
  const noShape = { ...riauStorm, id: 'no-shape', shape: null };
  const warnings = [riauStorm, line, storm, point, noShape, javaSeaStorm];
  assert.deepEqual(warningsOnRoute(path(singapore, jakarta), warnings), [riauStorm, javaSeaStorm]);
});

// Gaps in the path ------------------------------------------------------------------------------

// Out of range of ground receivers over the ocean, a flight's path can jump thousands of km between
// two points. The check has to join them up.
const chennai = { lat: 12.99, lon: 80.17 };
const kualaLumpur = { lat: 2.74, lon: 101.71 };
// Thunderstorms over the middle of the Bay of Bengal, more than 1,000 km from either city.
const bayOfBengalStorm = sigmet('VECF-6-1790000000', [[9, 89], [9, 92], [6, 92], [6, 89]]);

test('warningsOnRoute: Chennai to Kuala Lumpur with no points over the sea still crosses the Bay of Bengal storm', () => {
  assert.deepEqual(warningsOnRoute(path(chennai, kualaLumpur), [bayOfBengalStorm]), [bayOfBengalStorm]);
});

const perth = { lat: -31.94, lon: 115.97 };
const johannesburg = { lat: -26.13, lon: 28.24 };
// A storm over the southern Indian Ocean, right where Perth to Johannesburg flies: the shortest way
// round the Earth between them passes 37.6 S, 70.6 E, halfway along.
const southernOceanStorm = sigmet('FIMM-7-1790000000', [[-36, 68.5], [-36, 72.5], [-39, 72.5], [-39, 68.5]]);

test('warningsOnRoute: Perth to Johannesburg with no points over the ocean crosses a storm on the way the plane flies', () => {
  assert.deepEqual(warningsOnRoute(path(perth, johannesburg), [southernOceanStorm]), [southernOceanStorm]);
});

test('warningsOnRoute: Perth to Johannesburg is clear of a storm on the straight line, 950 km north of the real path', () => {
  // The same storm moved north to where the flat-map straight line runs (about 28.9 S at 70.6 E).
  const offPathStorm = sigmet('FIMM-8-1790000000', [[-27.5, 68.5], [-27.5, 72.5], [-30.5, 72.5], [-30.5, 68.5]]);
  assert.deepEqual(warningsOnRoute(path(perth, johannesburg), [offPathStorm]), []);
});

// densify -------------------------------------------------------------------------------------------

// Distance in km along the Earth's surface (haversine), to check densify independently.
function kmApart(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

test('densify: legs under 500 km are left as they are', () => {
  // About 145 km, then 185 km, off the coast of New South Wales.
  const points = [{ lat: -33, lon: 151 }, { lat: -34, lon: 152 }, { lat: -34, lon: 154 }];
  assert.deepEqual(densify(points), points);
});

test('densify: no points or one point come back unchanged', () => {
  assert.deepEqual(densify([]), []);
  assert.deepEqual(densify([perth]), [perth]);
});

test('densify: Perth to Johannesburg gets points along the great circle, none more than 250 km apart', () => {
  const points = densify([perth, johannesburg]);
  assert.equal(points[0], perth);
  assert.equal(points.at(-1), johannesburg);
  assert.ok(points.length > 30, `got ${points.length} points`);
  for (let i = 1; i < points.length; i++) {
    const km = kmApart(points[i - 1], points[i]);
    assert.ok(km <= 250, `piece ${i} is ${km} km`);
  }
  // On the great circle, the pieces add up to the straight-through distance, about 8,300 km.
  const total = points.slice(1).reduce((sum, p, i) => sum + kmApart(points[i], p), 0);
  assert.ok(Math.abs(total - kmApart(perth, johannesburg)) < 1, `pieces add up to ${total} km`);
  // And one of the new points is the halfway point Daniel worked out in #22: 37.6 S, 70.6 E.
  const nearest = Math.min(...points.map((p) => kmApart(p, { lat: -37.6, lon: 70.6 })));
  assert.ok(nearest < 20, `nearest point is ${nearest} km from 37.6 S, 70.6 E`);
});

test('densify: a smaller maxKm gives more points', () => {
  assert.ok(densify([perth, johannesburg], 100).length > densify([perth, johannesburg]).length);
});

// Volcano alerts -----------------------------------------------------------------------------------

// A volcano alert as the volcano feed gives it: a circle around the summit. Centre is [lat, lon].
const volcano = (id, name, level, center, radiusKm) => ({
  id,
  kind: 'volcano',
  hazard: 'VA',
  level,
  name,
  validFrom: '2026-09-28T00:00:00.000Z',
  validTo: '2026-09-29T00:00:00.000Z',
  shape: { type: 'circle', center, radiusKm },
});

const etna = volcano('volcano-etna', 'Etna', 'ORANGE', [37.75, 14.99], 20);
const sakurajima = volcano('volcano-sakurajima', 'Sakurajima', 'ORANGE', [31.58, 130.66], 30);
const kilauea = volcano('volcano-kilauea', 'Kilauea', 'YELLOW', [19.41, -155.29], 10);
const fukuoka = { lat: 33.58, lon: 130.45 };
const kagoshima = { lat: 31.8, lon: 130.72 }; // the airport, about 25 km from Sakurajima's summit
const naples = { lat: 40.88, lon: 14.29 };
const bari = { lat: 41.14, lon: 16.76 };

test('warningsOnRoute: Fukuoka to Kagoshima lands inside Sakurajima\'s ORANGE alert', () => {
  assert.deepEqual(warningsOnRoute(path(fukuoka, kagoshima), [sakurajima]), [sakurajima]);
});

test('warningsOnRoute: Naples to Bari, about 350 km from Etna, is clear', () => {
  assert.deepEqual(warningsOnRoute(path(naples, bari), [etna]), []);
});

test('warningsOnRoute: a volcano counts within its radius plus the buffer, not past it', () => {
  // Etna's alert reaches 20 km from the summit, plus the default 50 km buffer: 70 km in all.
  // Flying due east 0.6 degrees of latitude north of the summit is about 67 km away; 0.65 degrees is about 72 km.
  const justInside = path({ lat: 38.35, lon: 13 }, { lat: 38.35, lon: 17 });
  const justOutside = path({ lat: 38.4, lon: 13 }, { lat: 38.4, lon: 17 });
  assert.deepEqual(warningsOnRoute(justInside, [etna]), [etna]);
  assert.deepEqual(warningsOnRoute(justOutside, [etna]), []);
  // With no buffer, only the 20 km alert itself counts.
  assert.deepEqual(warningsOnRoute(justInside, [etna], { bufferKm: 0 }), []);
});

test('warningsOnRoute: SIGMETs and volcanoes together, in the order given', () => {
  // A storm over Kyushu, across the Fukuoka to Kagoshima path.
  const kyushuStorm = sigmet('RJJJ-3-1790000000', [[33, 130], [33, 131], [32.5, 131], [32.5, 130]]);
  const warnings = [etna, kyushuStorm, storm, kilauea, sakurajima];
  assert.deepEqual(warningsOnRoute(path(fukuoka, kagoshima), warnings), [kyushuStorm, sakurajima]);
  assert.deepEqual(warningsOnRoute(path(sydney, auckland), warnings), [storm]);
});
