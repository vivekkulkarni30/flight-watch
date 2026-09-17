// Builds data/airlines.csv from the OpenFlights airline list.
//
// 1. Download https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat
// 2. Run: node scripts/build-airlines.js path/to/downloaded/airlines.dat
//
// Keeps only active airlines that have both an IATA code (2 characters, used in flight numbers like QF144)
// and an ICAO code (3 letters, used in the callsign the plane broadcasts, like QFA144).
// Then update the date in data/README.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsvLine } from '../server/feeds/csv.js';

export const COLUMNS = ['iata', 'icao', 'name', 'country'];

// Some IATA codes belong to more than one active airline in the source (codes get reused when an airline
// closes, and OpenFlights doesn't always mark the old one inactive). For these we know which airline flies
// under the code today, so we keep that one. Any other shared code keeps the first airline in the source and
// is printed when the script runs, so a refresh shows what still needs a decision.
export const CHOSEN = {
  '1I': 'EJA', // NetJets, not Novair (which flies as N9)
  '5D': 'SLI', // Aeromexico Connect (listed under its old name Aerolitoral), not DonbassAero
  CC: 'ABD', // Air Atlanta Icelandic, not Macair
  G3: 'GLO', // Gol, not City Connexion or Sky Express
  LH: 'DLH', // Lufthansa, not Lufthansa Cargo
  SQ: 'SIA', // Singapore Airlines, not Singapore Airlines Cargo
  TL: 'ANO', // Airnorth, not Trans Mediterranean
  VY: 'VLG', // Vueling, not Formosa Airlines
  WA: 'KLC', // KLM Cityhopper, not Western Airlines
};

// The source columns. It has no header line, and an empty value is written as \N.
const ID = 0;
const NAME = 1;
const IATA = 3;
const ICAO = 4;
const COUNTRY = 6;
const ACTIVE = 7;

// Takes the text of the OpenFlights airlines.dat file and returns
// { rows: [{ iata, icao, name, country }] sorted by IATA code, unchosen: ['JL', ...] }.
// unchosen lists the shared codes that fell back to the first airline in the source.
export function buildAirlines(text) {
  const byIata = new Map();
  for (const r of parseCsv(text)) {
    if (r.length < 8) throw new Error(`OpenFlights row ${r[ID]} has ${r.length} columns, expected 8`);
    if (r[ACTIVE] !== 'Y' || !/^[A-Z0-9]{2}$/.test(r[IATA]) || !/^[A-Z]{3}$/.test(r[ICAO])) continue;
    const airline = { iata: r[IATA], icao: r[ICAO], name: r[NAME].trim(), country: r[COUNTRY] };
    if (!byIata.has(airline.iata)) byIata.set(airline.iata, []);
    byIata.get(airline.iata).push(airline);
  }

  const rows = [];
  const unchosen = [];
  for (const [iata, airlines] of byIata) {
    let keep = airlines[0];
    if (airlines.length > 1) {
      const chosen = airlines.find((a) => a.icao === CHOSEN[iata]);
      if (chosen) keep = chosen;
      else unchosen.push(iata);
    }
    rows.push(keep);
  }
  rows.sort((a, b) => a.iata.localeCompare(b.iata));
  return { rows, unchosen: unchosen.sort() };
}

export const buildAirlineRows = (text) => buildAirlines(text).rows;

// Only run when called from the command line, not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: node scripts/build-airlines.js path/to/openflights/airlines.dat');
    process.exit(1);
  }
  const { rows, unchosen } = buildAirlines(readFileSync(source, 'utf8'));
  const lines = [COLUMNS.join(','), ...rows.map((a) => toCsvLine(COLUMNS.map((c) => a[c])))];
  const out = fileURLToPath(new URL('../data/airlines.csv', import.meta.url));
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`Wrote ${rows.length} airlines to data/airlines.csv`);
  if (unchosen.length > 0) {
    console.log(`Shared IATA codes with no chosen airline, kept the first in the source: ${unchosen.join(' ')}`);
  }
}
