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
  // Etna's alert is 20 km across the summit, plus the default 50 km buffer: 70 km in all.
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
