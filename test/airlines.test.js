import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAirlines, toCallsign } from '../server/feeds/airlines.js';

test('loadAirlines reads data/airlines.csv, one airline per IATA code', () => {
  const airlines = loadAirlines();
  assert.ok(airlines.size > 700);
  assert.deepEqual(airlines.get('QF'), { iata: 'QF', icao: 'QFA', name: 'Qantas', country: 'Australia' });
});

test('toCallsign turns a flight number into a callsign: QF144 is QFA144', () => {
  assert.equal(toCallsign('QF144'), 'QFA144');
});

test('toCallsign ignores spaces and case, as typed in the search box', () => {
  assert.equal(toCallsign(' qf 144 '), 'QFA144');
  assert.equal(toCallsign(' qf144'), 'QFA144');
});

test('toCallsign leaves a callsign that already has an ICAO code alone', () => {
  assert.equal(toCallsign('QFA144'), 'QFA144');
  assert.equal(toCallsign('qfa144'), 'QFA144');
});

test('toCallsign works for other airlines: NZ1 is ANZ1', () => {
  assert.equal(toCallsign('NZ1'), 'ANZ1');
});

test('toCallsign keeps a letter at the end of a flight number: QF1A is QFA1A', () => {
  assert.equal(toCallsign('QF1A'), 'QFA1A');
});

test('toCallsign handles IATA codes with a digit in them: G31234 is GLO1234 (Gol)', () => {
  assert.equal(toCallsign('G31234'), 'GLO1234');
});

test('toCallsign returns null for an airline code we do not know', () => {
  // ZZ is in OpenFlights, but with no ICAO code, so it's not in our list.
  assert.equal(loadAirlines().has('ZZ'), false);
  assert.equal(toCallsign('ZZ1'), null);
});

test('toCallsign returns null for things that are not flight numbers', () => {
  assert.equal(toCallsign(''), null);
  assert.equal(toCallsign('   '), null);
  assert.equal(toCallsign('QF'), null); // no number
  assert.equal(toCallsign('QFA'), null); // no number
  assert.equal(toCallsign('QF-144'), null);
  assert.equal(toCallsign('Qantas'), null);
});
