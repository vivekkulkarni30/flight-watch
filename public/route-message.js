// What to say about the warnings we have (issue #23). No Leaflet and no page, so node can test it.
//
// The server tells us, per warning feed, whether it actually has data:
//   feeds: { sigmets: { status: 'ok' | 'no-data', fetchedAt }, volcanoes: { status, fetchedAt } }
// An empty list only means "nothing on your route" when every feed is 'ok'. If a feed has no data,
// we don't know, and the page has to say so.

// Every warning feed we expect, with the words for it and where its data comes from.
export const WARNING_FEEDS = {
  sigmets: { label: 'SIGMETs', source: 'aviationweather.gov' },
  volcanoes: { label: 'Volcano alerts', source: 'USGS' },
};

export const UNAVAILABLE_TITLE = 'Warning data unavailable';
export const ALL_CLEAR = 'Nothing on your route right now';

// One line for each feed we have no data from, e.g.
// "SIGMETs: no data from aviationweather.gov right now". Empty when every feed is ok.
// Anything other than 'ok' counts as no data: a feed missing from the answer, or no feeds at all,
// is "we don't know", not "all clear".
export function feedProblems(feeds) {
  return Object.entries(WARNING_FEEDS)
    .filter(([name]) => feeds?.[name]?.status !== 'ok')
    .map(([, feed]) => `${feed.label}: no data from ${feed.source} right now`);
}

// What the "On your route" panel shows:
//   unavailable: null when every feed is ok, otherwise { title, lines } for the warning box at the top
//   items:       the warnings on the route, always listed (they came from a feed that is working)
//   allClear:    true only when every feed is ok and nothing is on the route
export function routeMessage(onRoute, feeds) {
  const items = onRoute ?? [];
  const lines = feedProblems(feeds);
  return {
    unavailable: lines.length > 0 ? { title: UNAVAILABLE_TITLE, lines } : null,
    items,
    allClear: lines.length === 0 && items.length === 0,
  };
}
