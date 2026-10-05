import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVolcanoRows } from '../scripts/build-volcanoes.js';

// 6 real volcanoes from USGS's getUSVolcanoes list, with the long description text emptied (see data/README.md).
const sample = readFileSync(new URL('./fixtures/usgs-us-volcanoes-sample.json', import.meta.url), 'utf8');

test('keeps one row per volcano with vnum, name, lat, lon and region, sorted by vnum', () => {
  const rows = buildVolcanoRows(sample);
  assert.deepEqual(
    rows.map((r) => r.vnum),
    ['284141', '311060', '311120', '311320', '311360', '332010'],
  );
  assert.deepEqual(rows.find((r) => r.vnum === '311120'), {
    vnum: '311120',
    name: 'Great Sitkin',
    lat: 52.0765,
    lon: -176.1109,
    region: 'Alaska - Aleutians',
  });
});

test('keeps east longitudes as they are (Semisopochnoi is just west of the date line, Ahyi near Guam)', () => {
  const rows = buildVolcanoRows(sample);
  assert.equal(rows.find((r) => r.name === 'Semisopochnoi').lon, 179.5977);
  assert.equal(rows.find((r) => r.name === 'Ahyi Seamount').lon, 145.03);
});

test('leaves out a volcano with no vnum or no position', () => {
  const text = JSON.stringify([
    { vnum: null, volcano_name: 'No number', latitude: 1, longitude: 2, region: 'x' },
    { vnum: '1', volcano_name: 'No position', latitude: null, longitude: null, region: 'x' },
    { vnum: '2', volcano_name: 'Fine', latitude: 1, longitude: 2, region: 'x' },
  ]);
  assert.deepEqual(buildVolcanoRows(text).map((r) => r.name), ['Fine']);
});
