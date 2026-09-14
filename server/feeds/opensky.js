// Live flights from the OpenSky Network (https://opensky-network.org/), asked anonymously (no account).
// See data/README.md for the shape of its answers and their quirks.

const API = 'https://opensky-network.org/api';

// Find the aircraft broadcasting this callsign (e.g. 'QFA144') and return its path so far:
//   { callsign, icao24, points: [{ t, lat, lon, altM }] }
// t is Unix seconds, altM the barometric altitude in metres. Returns null if no aircraft has that callsign.
// Pass your own fetch to test without the network.
export async function lookupFlight(callsign, { fetch = globalThis.fetch } = {}) {
  const { states } = await (await fetch(`${API}/states/all`)).json();

  // Each state is an array: [0] is the icao24, [1] the callsign padded with spaces (or null).
  const state = (states ?? []).find((s) => s[1]?.trim() === callsign);
  if (!state) return null;
  const icao24 = state[0];

  // Each track point is [time, lat, lon, baroAltitudeM, trueTrack, onGround]; we keep the first four.
  const track = await (await fetch(`${API}/tracks/all?icao24=${icao24}&time=0`)).json();
  const points = track.path.map(([t, lat, lon, altM]) => ({ t, lat, lon, altM }));

  return { callsign, icao24, points };
}
