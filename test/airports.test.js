import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAirports, nearestAirport, distanceKm } from '../server/feeds/airports.js';

test('loadAirports reads every row with numbers for lat and lon', () => {
  const airports = loadAirports();
  assert.ok(airports.length > 4000);
  const syd = airports.find((a) => a.iata === 'SYD');
  assert.deepEqual(syd, {
    iata: 'SYD',
    name: 'Sydney Kingsford Smith International Airport',
    lat: -33.946098,
    lon: 151.177002,
    type: 'large_airport',
    country: 'AU',
  });
});

test('loadAirports reads the file once and returns the same list after that', () => {
  assert.equal(loadAirports(), loadAirports());
});

test('distanceKm: Sydney to Auckland is about 2,160 km', () => {
  const km = distanceKm(-33.946098, 151.177002, -37.01199, 174.786331);
  assert.ok(km > 2140 && km < 2180, `got ${km}`);
});

test('nearestAirport finds Sydney from a point next to it', () => {
  assert.equal(nearestAirport(-33.95, 151.18).iata, 'SYD');
});

test('nearestAirport finds Auckland from a point next to it', () => {
  assert.deepEqual(nearestAirport(-37.01, 174.79), { iata: 'AKL', name: 'Auckland International Airport' });
});

test('nearestAirport returns null in the middle of the Pacific (nothing within 300 km)', () => {
  assert.equal(nearestAirport(0, -140), null);
});

test('nearestAirport works across the date line', () => {
  // Just east of 180 degrees, about 90 km from Labasa in Fiji (LBS at 179.34 E).
  assert.equal(nearestAirport(-16.5, -179.8)?.iata, 'LBS');
});
