import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAirportRows } from '../scripts/build-airports.js';

const sample = readFileSync(new URL('./fixtures/ourairports-sample.csv', import.meta.url), 'utf8');

test('keeps only large and medium airports that have an IATA code', () => {
  const rows = buildAirportRows(sample);
  assert.deepEqual(rows.map((r) => r.iata), ['EFL', 'AKL', 'SYD', 'TUO']);
});

test('each row has iata, name, lat, lon, type and country', () => {
  const syd = buildAirportRows(sample).find((r) => r.iata === 'SYD');
  assert.deepEqual(syd, {
    iata: 'SYD',
    name: 'Sydney Kingsford Smith International Airport',
    lat: -33.946098,
    lon: 151.177002,
    type: 'large_airport',
    country: 'AU',
  });
});

test('rounds coordinates to 6 decimal places (about 10 cm)', () => {
  const taupo = buildAirportRows(sample).find((r) => r.iata === 'TUO');
  assert.equal(taupo.lat, -38.7397);
  assert.equal(taupo.lon, 176.084);
});

test('keeps quotes inside names', () => {
  const efl = buildAirportRows(sample).find((r) => r.iata === 'EFL');
  assert.equal(efl.name, 'Kefalonia International Airport "Anna Pollatou"');
});
