import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookupFlight } from '../server/feeds/opensky.js';

// Real OpenSky responses, trimmed (see data/README.md).
const states = JSON.parse(readFileSync(new URL('./fixtures/opensky-states-sample.json', import.meta.url)));
const track = JSON.parse(readFileSync(new URL('./fixtures/opensky-track-sample.json', import.meta.url)));

// A stand-in for fetch that answers from the fixtures and remembers which URLs were asked for.
function fakeFetch({ statesStatus = 200 } = {}) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/states/all')) {
      return new Response(statesStatus === 200 ? JSON.stringify(states) : 'Too many requests', { status: statesStatus });
    }
    if (String(url).includes('/tracks/all')) return new Response(JSON.stringify(track), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  return { fetch, urls };
}

test('lookupFlight finds QFA145 and returns its track as a Path', async () => {
  const { fetch, urls } = fakeFetch();
  const path = await lookupFlight('QFA145', { fetch });

  assert.equal(path.callsign, 'QFA145');
  assert.equal(path.icao24, '7c5324');
  assert.equal(path.points.length, 20);
  // First point: on the ground at Sydney (OpenSky gives -304 m there). Last: over the sea west of Auckland.
  assert.deepEqual(path.points[0], { t: 1793326573, lat: -33.9598, lon: 151.191, altM: -304 });
  assert.deepEqual(path.points.at(-1), { t: 1793334468, lat: -37.1917, lon: 172.5282, altM: 8839 });
  assert.equal(urls[1], 'https://opensky-network.org/api/tracks/all?icao24=7c5324&time=0');
});

test('lookupFlight matches the whole callsign: QFA1 is not QFA10 or QFA145', async () => {
  const { fetch, urls } = fakeFetch();
  const path = await lookupFlight('QFA1', { fetch });
  assert.equal(path.icao24, '7c4928');
  assert.match(urls[1], /icao24=7c4928&/);
});

test('lookupFlight returns null for a callsign nobody is broadcasting', async () => {
  const { fetch, urls } = fakeFetch();
  assert.equal(await lookupFlight('QFA999', { fetch }), null);
  assert.equal(urls.length, 1); // no track request when there's no aircraft
});
