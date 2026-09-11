// Builds data/airports.csv from the OurAirports airports file.
//
// 1. Download https://davidmegginson.github.io/ourairports-data/airports.csv
// 2. Run: node scripts/build-airports.js path/to/downloaded/airports.csv
//
// Keeps only large and medium airports that have an IATA code (the three-letter code on
// boarding passes, like SYD). Then update the date in data/README.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsvLine } from '../server/feeds/csv.js';

const KEEP_TYPES = new Set(['large_airport', 'medium_airport']);
export const COLUMNS = ['iata', 'name', 'lat', 'lon', 'type', 'country'];

// 6 decimal places is about 10 cm, plenty for a map. Some rows in the source have 14 or more.
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// Takes the text of the OurAirports file and returns the rows we keep, in the source's order.
export function buildAirportRows(text) {
  const [header, ...rows] = parseCsv(text);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`OurAirports file has no "${name}" column`);
    return i;
  };
  const type = col('type');
  const name = col('name');
  const lat = col('latitude_deg');
  const lon = col('longitude_deg');
  const country = col('iso_country');
  const iata = col('iata_code');

  return rows
    .filter((r) => KEEP_TYPES.has(r[type]) && /^[A-Z0-9]{3}$/.test(r[iata]))
    .map((r) => ({
      iata: r[iata],
      name: r[name],
      lat: round6(Number(r[lat])),
      lon: round6(Number(r[lon])),
      type: r[type],
      country: r[country],
    }));
}

// Only run when called from the command line, not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: node scripts/build-airports.js path/to/ourairports/airports.csv');
    process.exit(1);
  }
  const airports = buildAirportRows(readFileSync(source, 'utf8'));
  const lines = [COLUMNS.join(','), ...airports.map((a) => toCsvLine(COLUMNS.map((c) => a[c])))];
  const out = fileURLToPath(new URL('../data/airports.csv', import.meta.url));
  writeFileSync(out, lines.join('\n') + '\n');
  const large = airports.filter((a) => a.type === 'large_airport').length;
  console.log(`Wrote ${airports.length} airports (${large} large) to data/airports.csv`);
}
