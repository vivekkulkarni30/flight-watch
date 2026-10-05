// Volcano alerts: US volcanoes that USGS has raised above normal, from its Hazard Notification System (HANS).
// US volcanoes only (Alaska, the Cascades, Hawaii, the Northern Mariana Islands...): there's no world-wide
// list like this. Volcanic ash elsewhere still reaches us as SIGMETs (see sigmets.js).
// See data/README.md for the shape of its answers and their quirks.

import { readFileSync } from 'node:fs';
import { log } from '../log.js';
import { parseCsv } from './csv.js';

const FEED_URL = 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes';
const HEADERS = { 'User-Agent': 'flight-watch (teaching project)' };
const POSITIONS_FILE = new URL('../../data/us-volcanoes.csv', import.meta.url);

// How big an area to mark around a volcano for each aviation colour code. This is our own choice, not USGS's:
// the higher the alert, the bigger the area to stay clear of. GREEN (normal) isn't shown at all.
const RADIUS_KM = { YELLOW: 50, ORANGE: 100, RED: 200 };

// Fetch the elevated US volcanoes and return them as Warnings:
//   { id, kind: 'volcano', hazard: 'VA', level, name, validFrom, validTo: null,
//     shape: { type: 'circle', center: [lat, lon], radiusKm } }
// level is the aviation colour code: YELLOW, ORANGE or RED. Returns [] for a 204 or an empty answer.
// Throws an Error with .status for any other answer but 200.
// Pass your own fetch to test without the network.
export async function fetchVolcanoes({ fetch = globalThis.fetch } = {}) {
  const res = await fetch(FEED_URL, { headers: HEADERS });
  if (res.status === 204) {
    log.info('volcano feed returned 204 (no data)');
    return [];
  }
  if (res.status !== 200) {
    log.warn(`volcano feed returned ${res.status}`);
    const err = new Error(`volcanoes.usgs.gov returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  if (!text.trim()) return [];
  return JSON.parse(text).flatMap(toWarning);
}

// One volcano from the feed becomes one Warning, or none if it's GREEN or we can't place it.
function toWarning(v) {
  const radiusKm = RADIUS_KM[v.color_code];
  if (!radiusKm) return [];

  const position = findPosition(v);
  if (!position) {
    log.warn(`volcano ${v.volcano_name} (vnum ${v.vnum}) is not in data/us-volcanoes.csv: left out`);
    return [];
  }

  return [
    {
      id: `volcano-${v.vnum ?? v.volcano_name}`,
      kind: 'volcano',
      hazard: 'VA',
      level: v.color_code,
      name: `${v.volcano_name} (${v.alert_level}, aviation code ${v.color_code})`,
      // When USGS sent the notice that set this level. The feed gives Unix seconds.
      validFrom: v.sent_unixtime ? new Date(v.sent_unixtime * 1000).toISOString() : null,
      validTo: null, // an alert stays until USGS sends a new notice, so there's no end time
      shape: { type: 'circle', center: [position.lat, position.lon], radiusKm },
    },
  ];
}

// The feed doesn't say where a volcano is, so look it up in data/us-volcanoes.csv: by vnum, or by name if
// the vnum is missing.
let positions = null;

function findPosition(v) {
  if (!positions) positions = loadPositions();
  return v.vnum ? positions.byVnum.get(v.vnum) : positions.byName.get(v.volcano_name);
}

function loadPositions() {
  const [header, ...rows] = parseCsv(readFileSync(POSITIONS_FILE, 'utf8'));
  const byVnum = new Map();
  const byName = new Map();
  for (const r of rows) {
    const row = Object.fromEntries(header.map((name, i) => [name, r[i]]));
    const position = { lat: Number(row.lat), lon: Number(row.lon) };
    byVnum.set(row.vnum, position);
    byName.set(row.name, position);
  }
  return { byVnum, byName };
}
