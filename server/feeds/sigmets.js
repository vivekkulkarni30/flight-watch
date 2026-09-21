// SIGMETs: official warnings to pilots about storms, turbulence, icing, volcanic ash and other hazards,
// for the whole world, from the Aviation Weather Center (https://aviationweather.gov/data/api/).
// See data/README.md for the shape of its answers and their quirks.

import { log } from '../log.js';

const FEED_URL = 'https://aviationweather.gov/api/data/isigmet?format=json';

// The API asks every app to say who it is. It allows 100 requests a minute and no calls from a browser,
// so only the server fetches it.
const HEADERS = { 'User-Agent': 'flight-watch (teaching project)' };

const HAZARD_NAMES = {
  TS: 'Thunderstorms',
  TURB: 'Turbulence',
  ICE: 'Icing',
  VA: 'Volcanic ash',
  TC: 'Tropical cyclone',
  MTW: 'Mountain waves',
};

// Fetch all current SIGMETs and return them as Warnings:
//   { id, kind: 'sigmet', hazard, level: null, name, validFrom, validTo, shape: { type: 'polygon', coords } }
// coords are [lat, lon] pairs, each corner once. Returns [] if the feed answers 204 (no data).
// Throws an Error with .status for any other answer but 200.
// Pass your own fetch to test without the network.
export async function fetchSigmets({ fetch = globalThis.fetch } = {}) {
  const res = await fetch(FEED_URL, { headers: HEADERS });
  if (res.status === 204) {
    log.info('sigmet feed returned 204 (no data)');
    return [];
  }
  if (res.status !== 200) {
    log.warn(`sigmet feed returned ${res.status}`);
    const err = new Error(`aviationweather.gov returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (await res.json()).flatMap(toWarnings);
}

// One SIGMET from the feed becomes one Warning per polygon: usually one, several for geom "AREAS".
function toWarnings(s) {
  const id = `${s.firId}-${s.seriesId}-${s.validTimeFrom}`;
  const polygons = (s.geom === 'AREAS' ? s.coords : [s.coords]).map(toPolygon);

  const warnings = [];
  polygons.forEach((coords, i) => {
    // Some warnings are only a point (a volcano's ash cloud, say). There's no area to draw.
    if (coords.length < 3) {
      log.info(`sigmet ${s.firId} ${s.seriesId} has ${coords.length} point${coords.length === 1 ? '' : 's'}, not a polygon: left out`);
      return;
    }
    warnings.push({
      id: polygons.length > 1 ? `${id}-${i + 1}` : id,
      kind: 'sigmet',
      hazard: s.hazard,
      level: null,
      name: `${HAZARD_NAMES[s.hazard] ?? s.hazard}, ${firName(s)} FIR`,
      validFrom: new Date(s.validTimeFrom * 1000).toISOString(), // the feed gives Unix seconds
      validTo: new Date(s.validTimeTo * 1000).toISOString(),
      shape: { type: 'polygon', coords },
    });
  });
  return warnings;
}

// The feed's points are { lon, lat }. Turn them into [lat, lon] pairs, each corner once:
// drop a point that repeats the one before it, and the copy of the first point at the end.
// Longitudes past 180 (the feed uses them for areas across the date line) are moved back into -180..180.
function toPolygon(points) {
  const shift = points.some((p) => p.lon > 180) ? -360 : 0;
  const coords = [];
  for (const { lat, lon } of points) {
    const prev = coords.at(-1);
    if (prev && prev[0] === lat && prev[1] === lon + shift) continue;
    coords.push([lat, lon + shift]);
  }
  const [first, last] = [coords[0], coords.at(-1)];
  if (coords.length > 1 && first[0] === last[0] && first[1] === last[1]) coords.pop();
  return coords;
}

// "LIRR ROMA" becomes "ROMA". Some names have no code in front ("OAKLAND OCEANIC"); keep those as they are.
function firName(s) {
  const prefix = `${s.firId} `;
  return s.firName.startsWith(prefix) ? s.firName.slice(prefix.length) : s.firName;
}
