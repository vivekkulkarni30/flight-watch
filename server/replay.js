// Replay mode: run the app on saved answers instead of the live feeds, for demos and testing when the feeds are
// quiet or the network is bad. Start the server with REPLAY=<name> and it reads the scenario folder
// replay/<name>/. Each feed is replayed only if its file is there; any feed without a file stays live.
//
//   flight-<CALLSIGN>.json   an OpenSky track (as from tracks/all), served for that callsign, e.g. flight-QFA145.json
//   sigmets.json             the raw answer from aviationweather.gov's isigmet feed
//   volcanoes.json           the raw answer from USGS's getElevatedVolcanoes
//
// The saved answers go through the same parsing as live ones (parseTrack, parseSigmets, parseVolcanoes), so
// replayed data looks exactly like live data to the rest of the app.
//
//   const replay = applyReplay('tasman', { lookupFlight, sources });
//   startPolling({ log, sources: replay.sources });
//   buildServer({ lookupFlight: replay.lookupFlight, poller });

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';
import { parseTrack } from './feeds/opensky.js';
import { parseSigmets } from './feeds/sigmets.js';
import { parseVolcanoes } from './feeds/volcanoes.js';

const REPLAY_FOLDER = fileURLToPath(new URL('../replay/', import.meta.url));

// The warning feeds we can replay: the file to look for, and the parser that turns it into Warnings.
const FEED_FILES = {
  sigmets: { file: 'sigmets.json', parse: parseSigmets },
  volcanoes: { file: 'volcanoes.json', parse: parseVolcanoes },
};

// Read scenario <name> and swap in its saved answers.
// lookupFlight and sources are the live ones (as server.js sets them up). The result has the same shape,
// { lookupFlight, sources }, with the replayed parts swapped in.
// root is the folder that holds the scenarios (replay/ by default; tests use a temporary one).
// Throws if there's no such scenario: better to stop than to quietly run on live data during a demo.
export function applyReplay(name, { lookupFlight, sources, root = REPLAY_FOLDER }) {
  const folder = join(root, name);
  if (!existsSync(folder)) throw new Error(`replay scenario "${name}" not found (looked in ${folder})`);
  const files = readdirSync(folder);
  const readJson = (file) => JSON.parse(readFileSync(join(folder, file), 'utf8'));

  // Saved flights, by callsign. The callsign comes from the file name: the one inside is padded with spaces.
  const flights = new Map();
  for (const file of files) {
    const match = /^flight-([A-Z0-9]+)\.json$/.exec(file);
    if (!match) continue;
    const callsign = match[1];
    const track = readJson(file);
    flights.set(callsign, parseTrack(callsign, track.icao24, track));
  }

  // fetchedAt is when we loaded the scenario: the page reads it as "when this answer arrived".
  const loadedAt = new Date().toISOString();
  const replayed = [];
  const live = [];
  const replaySources = sources.map((source) => {
    const feed = FEED_FILES[source.name];
    if (!feed || !files.includes(feed.file)) {
      live.push(source.name);
      return source;
    }
    replayed.push(source.name);
    const result = { status: 'ok', fetchedAt: loadedAt, items: feed.parse(readJson(feed.file)) };
    // Still goes through the poller like a live feed; it just gets the same answer every time.
    return { ...source, fetch: async () => result };
  });

  const replayedNames = [...[...flights.keys()].map((callsign) => `flight-${callsign}`), ...replayed];
  log.info(
    `replay "${name}": replaying ${replayedNames.join(', ') || 'nothing'}; live: ${[...live, 'other flights'].join(', ')}`,
  );

  return {
    // A saved flight comes from the scenario; any other flight goes to OpenSky as usual.
    lookupFlight: async (callsign) => flights.get(callsign) ?? lookupFlight(callsign),
    sources: replaySources,
  };
}
