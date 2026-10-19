# Flight Watch

Type a flight number and see where it's going: its path on a world map, plus the aviation warnings near it
(storms, turbulence, icing, volcanic ash and volcano alerts).

For learning only, not for flight planning.

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

Tests use Node's built-in test runner and live in `test/`.

## Team

| Who | Looks after |
|---|---|
| Gaurav Gupta | Lead, route check (`core/route-check.js`) |
| Daniel Sutantyo | Tests, logs, CI |
| Mei Lin Tan | Data feeds (`server/feeds/`, `data/`) |
| Josh Okafor | Back end (`server/`) |
| Liam Nguyen | Front end (`public/`) |
