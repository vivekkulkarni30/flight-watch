// Airlines from data/airlines.csv (built from OpenFlights, see data/README.md), and turning the flight
// number people type into the callsign the plane broadcasts.
//
// A flight number uses the airline's 2-character IATA code (QF144, as on a booking). The plane's callsign
// uses its 3-letter ICAO code instead (QFA144), and that's all OpenSky knows.

import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.js';

const FILE = new URL('../../data/airlines.csv', import.meta.url);

// After the airline code, a flight number is 1 to 4 digits, sometimes with a letter at the end (QF1A).
const FLIGHT_NUMBER = /^\d{1,4}[A-Z]?$/;
// A callsign is at most 8 characters: the 3-letter ICAO code, then a digit, then digits or letters
// (QFA144, BAW12AB).
const CALLSIGN_REST = /^\d[0-9A-Z]{0,4}$/;

let byIata = null;
let icaoCodes = null;

// Returns a Map from IATA code to { iata, icao, name, country }. Reads the file the first time only.
export function loadAirlines() {
  if (byIata) return byIata;
  const [header, ...rows] = parseCsv(readFileSync(FILE, 'utf8'));
  byIata = new Map();
  for (const r of rows) {
    const a = Object.fromEntries(header.map((name, i) => [name, r[i]]));
    byIata.set(a.iata, { iata: a.iata, icao: a.icao, name: a.name, country: a.country });
  }
  icaoCodes = new Set([...byIata.values()].map((a) => a.icao));
  return byIata;
}

// Turn what someone typed into a callsign to look up, or null if it isn't one we can make sense of.
//   'QF144'    -> 'QFA144'  (IATA flight number: swap in the ICAO code)
//   ' qf 144 ' -> 'QFA144'  (spaces and case don't matter)
//   'QFA144'   -> 'QFA144'  (already a callsign)
//   'ZZ1'      -> null      (no airline we know)
export function toCallsign(input) {
  const text = String(input).replace(/\s+/g, '').toUpperCase();
  const airlines = loadAirlines();

  // Check the IATA form first. The two can't be mixed up: after an IATA code comes a digit, and an ICAO code
  // is three letters.
  const iata = airlines.get(text.slice(0, 2));
  if (iata && FLIGHT_NUMBER.test(text.slice(2))) return iata.icao + text.slice(2);

  if (icaoCodes.has(text.slice(0, 3)) && CALLSIGN_REST.test(text.slice(3))) return text;

  return null;
}
