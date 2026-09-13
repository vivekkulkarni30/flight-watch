# Data files

Saved data the feeds and tests read. Each file says where it came from and how to refresh it.

## airports.csv

Large and medium airports that have an IATA code (the three-letter code on a boarding pass, like SYD).

- **Source:** [OurAirports](https://ourairports.com/data/), file
  https://davidmegginson.github.io/ourairports-data/airports.csv
- **Downloaded:** 2026-09-08
- **Licence:** public domain. OurAirports asks for credit, so please keep this note: "Airport data from
  OurAirports (ourairports.com)".
- **Columns:** `iata,name,lat,lon,type,country`
  - `lat`, `lon`: degrees, rounded to 6 decimal places (about 10 cm)
  - `type`: `large_airport` or `medium_airport`, as OurAirports labels them
  - `country`: two-letter ISO code, e.g. `AU`
- **Size:** 4,569 airports, of which 1,173 are large (out of 86,311 rows in the source, most of them small
  airfields, heliports and closed airports).

To refresh it, download the source file and run:

```
node scripts/build-airports.js path/to/airports.csv
```

Quirks worth knowing about the source:

- Some names contain quotes, e.g. `Kefalonia International Airport "Anna Pollatou"`, so read the file with a
  proper CSV reader (`server/feeds/csv.js`), not by splitting on commas.
- IATA codes are not unique across the whole source: a small airstrip in Papua New Guinea also has `WLG`
  (Wellington's code). Keeping only large and medium airports leaves no duplicates in this file.
- Some small airfields have a three-letter `local_code` that looks like an IATA code. We only use the
  `iata_code` column.
- "Large" and "medium" are OurAirports' own labels, roughly based on traffic, not an official category.

## OpenSky samples (test fixtures)

Two small real responses from the [OpenSky Network](https://opensky-network.org/) REST API, saved under
`test/fixtures/` so the OpenSky tests run without the network. Both were fetched anonymously (no account) at
2026-10-30 04:27 UTC.

- `opensky-states-sample.json`: from https://opensky-network.org/api/states/all, trimmed from 5,705 aircraft to
  5. Kept: `QFA145` (Qantas, Sydney to Auckland, airborne over the Tasman), `QFA1` and `QFA10` (to check that
  looking up `QFA1` doesn't pick up `QFA10` or `QFA145`), `ANZ122` (Air New Zealand) and one aircraft with an
  empty callsign.
- `opensky-track-sample.json`: from https://opensky-network.org/api/tracks/all?icao24=7c5324&time=0 (QFA145's
  aircraft), trimmed from 75 points to 20, keeping the first and last.

Quirks worth knowing about the source:

- Each aircraft in `states/all` is an array, not an object: `[0]` is the `icao24` (the aircraft's own radio
  address, e.g. `7c5324`) and `[1]` the callsign padded with spaces to 8 characters (`"QFA145  "`). Some
  aircraft send an empty callsign, and many fields can be `null`.
- Each track point is `[time, lat, lon, baroAltitudeM, trueTrack, onGround]`, with `time` in Unix seconds.
- Track altitudes come in steps of about 305 m (1,000 ft), and can be negative on the ground: QFA145's first
  point at Sydney is -304 m.
- Tracks have gaps where no receiver hears the plane. QFA145 has none for 95 minutes over the Tasman Sea, so a
  line drawn through its points jumps straight across.
- Anonymous requests are rate limited. When OpenSky says no, it answers 429 (Too Many Requests).
