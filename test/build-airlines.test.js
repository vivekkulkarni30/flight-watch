import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAirlineRows } from '../scripts/build-airlines.js';

const sample = readFileSync(new URL('./fixtures/openflights-airlines-sample.dat', import.meta.url), 'utf8');

test('keeps only active airlines that have both an IATA and an ICAO code', () => {
  const codes = buildAirlineRows(sample).map((r) => r.iata);
  // Left out: "Unknown" and "Private flight" (IATA "-"), 135 Airways (no IATA), Australian Airlines
  // (not active) and Zz (no ICAO code).
  assert.deepEqual(codes, ['1T', 'G3', 'JL', 'LH', 'LX', 'NZ', 'QF', 'SR']);
});

test('each row has iata, icao, name and country', () => {
  const qantas = buildAirlineRows(sample).find((r) => r.iata === 'QF');
  assert.deepEqual(qantas, { iata: 'QF', icao: 'QFA', name: 'Qantas', country: 'Australia' });
});

test('keeps one airline per IATA code, using the chosen one where a code is shared', () => {
  const rows = buildAirlineRows(sample);
  const icao = (iata) => rows.filter((r) => r.iata === iata).map((r) => r.icao);
  assert.deepEqual(icao('G3'), ['GLO']); // Gol, not City Connexion or Sky Express
  assert.deepEqual(icao('LH'), ['DLH']); // Lufthansa, not Lufthansa Cargo
  // Nobody chose for JL, so the first one in the source wins (both are JAL anyway).
  assert.deepEqual(rows.filter((r) => r.iata === 'JL').map((r) => r.name), ['Japan Airlines']);
});
