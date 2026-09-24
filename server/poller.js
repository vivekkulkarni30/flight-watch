// Fetch each feed on its own timer and keep the latest answer in memory, so routes can answer straight away
// instead of asking the feed on every request.
//
//   const poller = startPolling({ log, sources: [{ name: 'sigmets', everySeconds: 60, fetch: fetchSigmets }] });
//   poller.latest('sigmets')   // the last good answer, or undefined before the first one arrives
//   poller.stopPolling()       // stop all the timers
//
// If a fetch fails we log a WARN and keep the previous data: slightly old warnings beat no warnings.
// A good fetch is logged (INFO) only when the number of items changes, so the log isn't one line a minute
// saying the same thing.

// How many things came back, for the log line (an array's length, a Map's size).
const countOf = (data) => data?.length ?? data?.size ?? '?';

export function startPolling({ sources, log }) {
  const results = new Map();
  const timers = new Map();
  let stopped = false;

  async function poll(source) {
    try {
      const data = await source.fetch();
      const changed = !results.has(source.name) || countOf(results.get(source.name)) !== countOf(data);
      results.set(source.name, data);
      if (changed) log.info(`${source.name}: fetched ${countOf(data)} items`);
    } catch (err) {
      const kept = results.has(source.name) ? `keeping previous data (${countOf(results.get(source.name))} items)` : 'no data yet';
      log.warn(`${source.name}: fetch failed with status ${err.status ?? 'unknown'}, ${kept} (${err.message})`);
    }
    // Schedule the next fetch only once this one is done, so a slow feed never has two fetches running.
    if (stopped) return;
    const timer = setTimeout(() => poll(source), source.everySeconds * 1000);
    timer.unref(); // don't keep the process (or a test run) alive just for this timer
    timers.set(source.name, timer);
  }

  for (const source of sources) poll(source);

  return {
    latest: (name) => results.get(name),
    stopPolling() {
      stopped = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
