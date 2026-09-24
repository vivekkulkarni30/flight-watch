// Remember answers from the outside feeds for a while, so we don't ask them more often than we need to.
//
//   const path = await cached(`flight:${callsign}`, 30, () => lookupFlight(callsign));
//
// - Asked again within ttlSeconds: the stored answer comes back and the feed isn't asked at all.
// - Asked after that: we ask the feed again and store the new answer.
// - The feed fails (429 "too many requests", a 503, no network...) and we have an older answer: we log a WARN
//   and hand back the older answer. Slightly old data beats an error page.
// - The feed fails and we have nothing: the error is passed on to the caller.
//
// Everything is in memory, so a restart starts empty.
import { log } from './log.js';

const store = new Map(); // name -> { value, savedAt (ms) }
let clock = Date.now;

export async function cached(name, ttlSeconds, fetcher) {
  const entry = store.get(name);
  if (entry && clock() - entry.savedAt < ttlSeconds * 1000) return entry.value;

  try {
    const value = await fetcher();
    store.set(name, { value, savedAt: clock() });
    return value;
  } catch (err) {
    if (!entry) throw err;
    const why = err.status === 429 ? 'rate-limited' : `failed with status ${err.status ?? 'unknown'}`;
    log.warn(`${name} ${why}, serving cached data`);
    return entry.value;
  }
}

// For tests: forget everything, and put the real clock back.
export function clearCache() {
  store.clear();
  clock = Date.now;
}

// For tests: use a pretend clock (a function returning milliseconds) instead of waiting for real time to pass.
export function setClock(now) {
  clock = now;
}
