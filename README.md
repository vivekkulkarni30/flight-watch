# Flight Watch

Type a flight number and see where it's going: its path on a world map, plus the aviation warnings near it
(storms, turbulence, icing, volcanic ash and volcano alerts).

**For learning only, not for flight planning.**

## What it does

- **Search by flight number**, as it appears on a booking (`QF1`). The server turns it into the callsign the
  plane broadcasts (`QFA1`) and asks OpenSky where that plane has been.
- **Draws the path** on the map, with large airports shown as dots.
- **Draws the warnings**: SIGMETs (official warnings to pilots about storms, turbulence, icing, volcanic ash and
  more) as shapes, and US volcano alerts as circles sized by their colour code.
- **"On your route"** lists the warnings the path passes through or comes within 50 km of.
- **Says when it doesn't know.** If a warning feed has no data, the map and the route panel say
  "Warning data unavailable" and name the feed, instead of "Nothing on your route right now".

## Run it

You need Node 22 or later.

```
npm install
npm start
```

Then open http://localhost:3000. Set `PORT` to use a different port.

## Replay mode

To run on saved data instead of the live feeds (for a demo, or when the feeds are quiet or the network is bad):

```
REPLAY=tasman npm start
```

(in PowerShell: `$env:REPLAY = "tasman"; npm start`), then search for `QF145`. This reads the folder
`replay/tasman/`. Each feed is replayed only if its file is in the folder (`flight-<CALLSIGN>.json`,
`sigmets.json`, `volcanoes.json`); the others stay live, and the log says which is which when the server
starts. See `replay/tasman/README.md` for what's in that scenario.

## Test it

```
npm test
```

Tests use Node's built-in test runner and live in `test/`. They read saved samples from `test/fixtures/`, so
they don't need the network.

## Logs

The server writes one plain line per event, to the screen and to `logs/app.log` (set `LOG_FILE` to use another
file):

```
2026-10-12 07:40:12 WARN  sigmet feed returned 204 (no data), we have no SIGMETs right now
```

## Data sources

| What | From | Licence |
|---|---|---|
| Flight positions and paths | [OpenSky Network](https://opensky-network.org) | Free for non-commercial use |
| Airports | [OurAirports](https://ourairports.com) | Public domain |
| Airline codes | [OpenFlights](https://openflights.org) | Open Database License (ODbL) 1.0 |
| SIGMET warnings | [aviationweather.gov](https://aviationweather.gov) | US government work |
| Volcano alerts | [USGS](https://volcanoes.usgs.gov/hans-public/) | US government work |

Thanks to all of them. The saved files, and how to refresh them, are described in
[`data/README.md`](data/README.md).

## More

The project wiki has the rest: getting started, who owns what, each data source's limits and quirks, how the
map layers work, what to do when a feed goes quiet, and how to read the logs.
