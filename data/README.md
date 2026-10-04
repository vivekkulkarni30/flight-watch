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

## airlines.csv

Airlines with both their codes, so we can turn a flight number into the callsign a plane broadcasts:

- The **IATA** code is 2 characters and is what's in a flight number on a booking or departures board:
  `QF` in `QF144`.
- The **ICAO** code is 3 letters and is what the plane uses in its callsign over the radio: `QFA` in
  `QFA144`. OpenSky only knows callsigns.

Details:

- **Source:** [OpenFlights](https://openflights.org/data.php), file
  https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat
- **Downloaded:** 2026-09-17
- **Licence:** Open Database License (ODbL) 1.0. Please keep the credit "Airline data from OpenFlights
  (openflights.org)". ODbL also says that if we share a changed version of the data, we share it under the
  same licence; this file is a filtered copy, so it is ODbL too.
- **Columns:** `iata,icao,name,country`, sorted by `iata`
  - `country`: the country name as OpenFlights writes it, e.g. `Australia` (not a two-letter code, unlike
    `airports.csv`)
- **Size:** 781 airlines (out of 6,162 rows in the source, of which 1,255 are marked active).

To refresh it, download the source file and run:

```
node scripts/build-airlines.js path/to/airlines.dat
```

Which airlines we keep: active ones (`Y` in the last column) with a 2-character IATA code and a 3-letter ICAO
code. That leaves out rows with a blank, `-` or `\N` code, and odd ones like `;;` or `^^`.

**When an IATA code is shared.** 17 IATA codes belong to more than one active airline in the source, mostly
because a code was handed to a new airline after the old one closed. We keep one airline per code:

- For 9 codes we know which airline flies under the code today, and the script keeps that one (the `CHOSEN`
  list in `scripts/build-airlines.js`): `1I` NetJets, `5D` Aeromexico Connect, `CC` Air Atlanta Icelandic,
  `G3` Gol, `LH` Lufthansa (not Lufthansa Cargo), `SQ` Singapore Airlines (not its cargo arm), `TL` Airnorth,
  `VY` Vueling, `WA` KLM Cityhopper.
- For the other 8 (`8M C3 CP I9 JL RA ZA ZB`) the script keeps the first one in the source and prints the
  list, so each refresh shows them again. For `JL` and `RA` it makes no difference: both rows have the same
  ICAO code. For most of the rest, as far as I can tell, neither airline still flies under that code. The
  exception is `8M`, Myanmar Airways International: its row has the ICAO code `MMM` and the callsign
  "assignment postponed", which I don't trust, so the first row (Maxair, `MXL`) stays. Worth a look if
  someone searches for an 8M flight.

Quirks worth knowing about the source:

- It has **no header line**. The columns are `id,name,alias,iata,icao,callsign,country,active`, and an empty
  value is written as `\N` (or sometimes `""`).
- **"Active" is out of date** in places: Ansett Australia and Swissair (both closed in 2002) are still marked
  active. We can't tell from the file alone, and an extra row does no harm.
- **ICAO codes can be shared too**: Swiss (`LX`) and Swissair (`SR`) are both `SWR`, Tiger Airways (`TR`) and
  Tiger Airways Australia (`TT`) both `TGW`. Fine for turning IATA into ICAO; going the other way (callsign to
  flight number) would need a choice.
- Some IATA codes contain a digit (`1T`, `5D`, `G3`), so a flight number like `G31234` is `G3` + `1234`.
- **Callsigns don't always match flight numbers.** Some airlines broadcast a callsign whose number (or
  letters) differ from the flight number, so swapping the airline code won't find those flights. This file
  can't help with that.

## OpenFlights sample (test fixture)

`test/fixtures/openflights-airlines-sample.dat`: 17 real rows from the OpenFlights `airlines.dat` above, picked
to test the build script: Qantas, Air New Zealand and 1Time; the rows we leave out ("Unknown" and "Private
flight" with IATA `-`, 135 Airways with no IATA code, Australian Airlines marked inactive, `ZZ` with no ICAO
code); the shared codes `G3`, `JL` and `LH`; and Swiss and Swissair, which share `SWR`.

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

## SIGMET sample (test fixture)

A SIGMET is an official warning to pilots about dangerous weather or volcanic ash in one area for a few hours.
Each country's weather office issues them for its own airspace regions, called FIRs (flight information
regions, e.g. "ROMA FIR" for central and southern Italy).

`test/fixtures/sigmets-sample.json`: 9 real SIGMETs from the aviationweather.gov international SIGMET feed,
trimmed from 133. Fetched 2026-10-30 15:18 AEDT (04:18 UTC).

- **Source:** https://aviationweather.gov/api/data/isigmet?format=json (the
  [Aviation Weather Center](https://aviationweather.gov/data/api/), part of the US National Weather Service).
- **Licence:** US government work, free to use. We credit it as "Warnings from aviationweather.gov".
- **Kept:** volcanic ash from Etna over Rome (the observed area `1` and the forecast area `1F`), mountain waves
  over Ireland (Shannon), turbulence over Western Australia (Melbourne, its polygon isn't closed), tropical
  cyclone In-Fa near Guam (Oakland Oceanic), thunderstorms over Brazzaville (sent twice), volcanic ash from
  Sakurajima given as a single point, and icing over Magadan, which crosses the date line.

Each SIGMET is an object. The fields we use:

| Field | Example | Notes |
|---|---|---|
| `firId`, `firName` | `LIRR`, `LIRR ROMA` | `firName` usually starts with the FIR code, but not always (`OAKLAND OCEANIC`) |
| `seriesId` | `1`, `1F`, `TANGO 31` | The SIGMET's number within its FIR. Not unique on its own |
| `hazard` | `VA` | `TS` thunderstorms, `TURB` turbulence, `ICE` icing, `VA` volcanic ash, `TC` tropical cyclone, `MTW` mountain waves |
| `qualifier` | `ERUPTION MT ETNA`, `SEV`, `IN-FA` | Severity (`SEV`, `EMBD`...), the volcano, or the cyclone's name. Can be `null` |
| `validTimeFrom`, `validTimeTo` | `1793319000` | **Unix seconds**, not ISO strings |
| `geom` | `AREA` | `AREA` (one shape) or `AREAS` (several) |
| `coords` | `[{ "lon": 15.45, "lat": 37.367 }, ...]` | See the quirks below |
| `base`, `top` | `0`, `13000` | Feet. Either can be `null` |
| `rawSigmet` | | The original text message, as pilots read it |

Quirks worth knowing about the source:

- **Longitude comes first** in each point (`{ "lon": ..., "lat": ... }`), while Leaflet and the rest of our
  code use `[lat, lon]`. The feed module swaps them.
- **Most polygons repeat their first point at the end** (117 of 133), but not all: Melbourne's `V15` stops
  one corner short. Leaflet closes a polygon by itself, so the feed module drops the repeated point.
- **`geom: "AREAS"` gives a list of polygons**, not a list of points. 3 of 133 used it.
- **The date line:** Magadan's `AREAS` warnings are cut at 180°. Part of the area is given with longitudes
  above 180 (up to 190.5, which is -169.5 the usual way), so longitudes have to be brought back into
  -180 to 180.
- **Some warnings are a single point**, not an area: the Sakurajima ash cloud (`RJJJ` `R02`) has one point
  in `coords`, even though `geom` says `AREA`. There's nothing to draw as a polygon.
- **A forecast area has its own entry.** When a SIGMET gives both where the hazard is now and where it's
  expected to be, the feed sends two entries with the same `rawSigmet`: `1` (now) and `1F` (forecast).
- **The same SIGMET can come twice.** Brazzaville's `A1` arrived twice, four minutes apart (`receiptTime`),
  the first with a mistake in its header. Same FIR, number and valid time, so we keep the later one.
- A **204** (No Content) means there are no SIGMETs to give, with an empty body (so don't read it as JSON).
- **Limits:** the API asks for at most 100 requests a minute and a User-Agent naming the app. It doesn't allow
  calls from a browser, so we fetch it from the server.

## us-volcanoes.csv

Where each US volcano is. The volcano alert feed (below) names a volcano and its USGS number but doesn't say
where it is, so `server/feeds/volcanoes.js` looks the position up here.

- **Source:** the USGS Hazard Notification System (HANS), list of US volcanoes:
  https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes
- **Downloaded:** 2026-10-30 04:55 UTC
- **Licence:** US government work, free to use. We credit it as "Volcano alerts from the USGS".
- **Columns:** `vnum,name,lat,lon,region`, sorted by `vnum`
  - `vnum`: the volcano's number in the Smithsonian's Global Volcanism Program list, e.g. `311120` for Great
    Sitkin. The alert feed uses the same number.
  - `lat`, `lon`: degrees, as USGS gives them (up to 5 decimal places)
  - `region`: as USGS writes it, e.g. `Alaska - Aleutians`, `Northern Mariana Islands`
- **Size:** 170 volcanoes: Alaska, the Cascades, California, Hawaii, Yellowstone and other western states,
  American Samoa and the Northern Mariana Islands.

To refresh it, download the source file and run:

```
node scripts/build-volcanoes.js path/to/getUSVolcanoes.json
```

Volcanoes don't move, so this only needs doing when USGS adds one.

Quirks worth knowing about the source:

- **"US" includes territories:** American Samoa and the Northern Mariana Islands (near Guam) are in the list.
- **Some longitudes are east (positive):** the western Aleutians cross the date line (Semisopochnoi is at
  179.6, Great Sitkin next to it at -176.1), and the Mariana volcanoes are around 145.
- **One vnum is `0`:** Ungulungwak Hill-Ingrichuak Hill in southwest Alaska has no proper number. It's kept,
  and it's still unique.
- Each volcano also comes with a long description (`boilerplate`, in HTML), a photo link and an ICAO-style
  position (`N5205 W17607`). We don't keep those.

`test/fixtures/usgs-us-volcanoes-sample.json`: 6 real volcanoes from the same download (the 4 with alerts on
2026-10-30, plus Akutan and Semisopochnoi), with the long `boilerplate` text emptied to keep the file small.
