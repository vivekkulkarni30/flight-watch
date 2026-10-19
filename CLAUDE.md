# Flight Watch

A web app: type a flight number, see its path on a world map and the aviation warnings near it (storms,
turbulence, icing, volcanic ash, volcano alerts). For learning only, not for flight planning.

Stack: Node 22, Fastify 5, plain JavaScript (ES modules), Leaflet on the front end, tests with `node:test`.
Keep dependencies to a minimum; add one only with a reason in the pull request.

## Run and test

- `npm install`, then `npm start` and open http://localhost:3000 (`PORT` changes the port).
- `npm test` runs everything in `test/`.

## Layout

| Path | What's there |
|---|---|
| `server/` | The Fastify server (`server.js`) and its helpers |
| `server/feeds/` | One file per outside data source (flight positions, airlines, airports, warnings, volcanoes) |
| `core/` | Plain logic with no web or network code, e.g. `route-check.js` (is a warning near the path?) |
| `public/` | The page the browser loads: HTML, CSS, front-end JavaScript |
| `data/` | Saved data files used by the feeds and tests |
| `replay/` | Saved feed answers for replay mode (`REPLAY=<name> npm start`), one folder per scenario |
| `test/` | Tests, one file per module (`<name>.test.js`) |

## Team rules

- Every change starts from an issue, goes on its own branch and comes in through a pull request.
- Never push to `main` directly.
- A bug fix comes with a test that failed before the fix.
- All logging goes through `server/log.js` (being added this week), not `console.log`.
- Plain English in commit messages, comments and docs. Say what changed and why.
- `buildServer()` in `server/server.js` returns the app without listening; tests use `app.inject()`.
