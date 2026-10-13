// Fetch each feed on its own timer and keep the latest answer in memory, so routes can answer straight away
// instead of asking the feed on every request.
//
//   const poller = startPolling({ log, sources: [{ name: 'sigmets', everySeconds: 60, fetch: fetchSigmets }] });
//   poller.latest('sigmets')   // the last result: { status: 'ok' | 'no-data', fetchedAt, items }
//   poller.stopPolling()       // stop all the timers
//
// Each fetch returns a feed result (see feeds/sigmets.js). Before the first one arrives, latest() gives
// { status: 'no-data', fetchedAt: null, items: [] }: "we don't know yet", never "there are no warnings" (issue #23).
//
// If a fetch fails (throws) we log a WARN and keep the previous result: slightly old warnings beat no warnings.
// A good fetch is logged (INFO) only when the number of items changes, so the log isn't one line a minute
// saying the same thing. A no-data answer isn't logged here: the feed already logs it as a WARN, every time.

const noDataYet = () => ({ status: 'no-data', fetchedAt: null, items: [] });

export function startPolling({ sources, log }) {
  const results = new Map();
  const timers = new Map();
  let stopped = false;

  async function poll(source) {
    try {
      const result = await source.fetch();
      const before = results.get(source.name);
      results.set(source.name, result);
      // Also log the first good fetch after a no-data spell, so the log shows when the feed came back.
      const changed = !before || before.status !== 'ok' || before.items.length !== result.items.length;
      if (result.status === 'ok' && changed) log.info(`${source.name}: fetched ${result.items.length} items`);
    } catch (err) {
      const before = results.get(source.name);
      const kept = before ? `keeping previous data (${before.status}, ${before.items.length} items)` : 'no data yet';
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
    latest: (name) => results.get(name) ?? noDataYet(),
    stopPolling() {
      stopped = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
