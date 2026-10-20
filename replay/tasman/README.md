# Replay scenario: tasman

Qantas QF145 (callsign `QFA145`) from Sydney to Auckland over the Tasman Sea, with the SIGMETs and volcano
alerts saved around the same time. Run it with:

```
REPLAY=tasman npm start
```

then search for `QF145`. Every feed in this scenario is replayed; only other flights go to OpenSky.

All three files are copies of the test fixtures in `test/fixtures/`; see `data/README.md` for their quirks.

| File | Copy of | Where it came from | Captured |
|---|---|---|---|
| `flight-QFA145.json` | `opensky-track-sample.json` | https://opensky-network.org/api/tracks/all?icao24=7c5324&time=0 (QFA145's aircraft), fetched anonymously, trimmed from 75 points to 20, keeping the first and last | 2026-10-30 04:27 UTC |
| `sigmets.json` | `sigmets-sample.json` | https://aviationweather.gov/api/data/isigmet?format=json, 9 real SIGMETs trimmed from 133 | 2026-10-30 15:18 AEDT (04:18 UTC) |
| `volcanoes.json` | `volcanoes-sample.json` | https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes, the whole list of elevated US volcanoes as USGS gave it | 2026-10-30 15:18 AEDT (04:18 UTC); still the same at 04:55 UTC |

What you'll see:

- **The flight:** 20 points, from the runway at Sydney to just off New Zealand's west coast (the last point is
  at -37.19, 172.53, still at cruising height). The full track has a 95-minute gap over the Tasman Sea where no
  receiver heard the plane; in this trimmed copy the longest jump is about 100 minutes, so the line goes
  straight across.
- **Warnings:** 9 SIGMET areas (Etna's ash over Rome, now and forecast; mountain waves over Ireland;
  turbulence over Western Australia; tropical cyclone In-Fa near Guam; thunderstorms over Brazzaville, sent
  twice and kept once; icing over Magadan in 3 pieces, as it crosses the date line. The Sakurajima ash cloud is
  a single point, so it's left out) and 4 volcano alerts (Great Sitkin, Shishaldin, Kilauea, Ahyi Seamount).
- **On your route:** none of these warnings are near QF145's path, so the panel says "Nothing on your route
  right now", with every feed ok. To demo a warning on the route, a scenario needs a SIGMET over the Tasman.

Licences and credits are as in `data/README.md`: OpenSky Network, "Warnings from aviationweather.gov",
"Volcano alerts from the USGS".
