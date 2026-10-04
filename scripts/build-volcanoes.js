// Builds data/us-volcanoes.csv: where each US volcano is, so the volcano feed can put alerts on the map.
// USGS's list of elevated volcanoes gives each volcano's number (vnum) but not its position.
//
// 1. Download https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes (JSON, about 170 KB)
// 2. Run: node scripts/build-volcanoes.js path/to/getUSVolcanoes.json
//
// Then update the date in data/README.md. Volcanoes don't move, so this only needs doing if USGS adds one.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toCsvLine } from '../server/feeds/csv.js';

export const COLUMNS = ['vnum', 'name', 'lat', 'lon', 'region'];

// Takes the text of the getUSVolcanoes answer and returns one row per volcano, sorted by vnum.
// A volcano with no number or no position is left out: the feed can't match it or place it.
export function buildVolcanoRows(text) {
  return JSON.parse(text)
    .filter((v) => v.vnum && v.latitude != null && v.longitude != null)
    .map((v) => ({
      vnum: v.vnum,
      name: v.volcano_name,
      lat: Number(v.latitude),
      lon: Number(v.longitude),
      region: v.region,
    }))
    .sort((a, b) => a.vnum.localeCompare(b.vnum));
}

// Only run when called from the command line, not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: node scripts/build-volcanoes.js path/to/getUSVolcanoes.json');
    process.exit(1);
  }
  const volcanoes = buildVolcanoRows(readFileSync(source, 'utf8'));
  const lines = [COLUMNS.join(','), ...volcanoes.map((v) => toCsvLine(COLUMNS.map((c) => v[c])))];
  const out = fileURLToPath(new URL('../data/us-volcanoes.csv', import.meta.url));
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`Wrote ${volcanoes.length} volcanoes to data/us-volcanoes.csv`);
}
