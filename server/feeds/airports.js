// Airports from data/airports.csv (built from OurAirports, see data/README.md).

import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.js';

const FILE = new URL('../../data/airports.csv', import.meta.url);
const NEAREST_LIMIT_KM = 300;
const EARTH_RADIUS_KM = 6371;

let airports = null;

// Returns [{ iata, name, lat, lon, type, country }]. Reads the file the first time only.
export function loadAirports() {
  if (airports) return airports;
  const [header, ...rows] = parseCsv(readFileSync(FILE, 'utf8'));
  airports = rows.map((r) => {
    const a = Object.fromEntries(header.map((name, i) => [name, r[i]]));
    return { iata: a.iata, name: a.name, lat: Number(a.lat), lon: Number(a.lon), type: a.type, country: a.country };
  });
  return airports;
}

// Great-circle distance in km between two points (the haversine formula).
// Works across the date line, since it uses the difference in angle, not in degrees on a flat map.
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The closest airport within 300 km as { iata, name }, or null if there's none (e.g. over an ocean).
// Checks every airport: about 4,600 distance sums, well under a millisecond.
export function nearestAirport(lat, lon) {
  let best = null;
  let bestKm = NEAREST_LIMIT_KM;
  for (const a of loadAirports()) {
    const km = distanceKm(lat, lon, a.lat, a.lon);
    if (km <= bestKm) {
      best = a;
      bestKm = km;
    }
  }
  return best && { iata: best.iata, name: best.name };
}
