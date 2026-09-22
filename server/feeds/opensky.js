// Live flights from the OpenSky Network (https://opensky-network.org/), asked anonymously (no account).
// See data/README.md for the shape of its answers and their quirks.

import { log } from '../log.js';

const API = 'https://opensky-network.org/api';

// Fetch one OpenSky URL and read its JSON. Anything but 200 is an error with .status set, so the caller can
// tell "OpenSky is rate limiting us" (429, common without an account) from "no such flight" (null).
async function getJson(url, fetch) {
  const res = await fetch(url);
  if (res.status !== 200) {
    log.warn(`opensky feed returned ${res.status} for ${url}`);
    const err = new Error(`OpenSky returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Every aircraft OpenSky can see right now: the states array from states/all (one array per aircraft, see above).
// The server keeps these in memory (see server.js) so a flight search doesn't have to ask for them each time.
export async function fetchStates({ fetch = globalThis.fetch } = {}) {
  const { states } = await getJson(`${API}/states/all`, fetch);
  return states ?? [];
}

// Find the aircraft broadcasting this callsign (e.g. 'QFA144') and return its path so far:
//   { callsign, icao24, points: [{ t, lat, lon, altM }] }
// t is Unix seconds, altM the barometric altitude in metres. Returns null if no aircraft has that callsign.
// Throws an Error with .status (e.g. 429) if OpenSky answers with anything but 200.
// Pass your own fetch to test without the network. If you already know the aircraft's icao24 (from states
// kept in memory), pass it too and we skip the states/all request.
export async function lookupFlight(callsign, { fetch = globalThis.fetch, icao24 } = {}) {
  if (!icao24) {
    const states = await fetchStates({ fetch });
    // Each state is an array: [0] is the icao24, [1] the callsign padded with spaces (or null).
    const state = states.find((s) => s[1]?.trim() === callsign);
    if (!state) return null;
    icao24 = state[0];
  }

  // Each track point is [time, lat, lon, baroAltitudeM, trueTrack, onGround]; we keep the first four.
  const track = await getJson(`${API}/tracks/all?icao24=${icao24}&time=0`, fetch);
  const points = track.path.map(([t, lat, lon, altM]) => ({ t, lat, lon, altM }));

  return { callsign, icao24, points };
}
