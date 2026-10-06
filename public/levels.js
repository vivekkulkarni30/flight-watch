// The aviation colour code for volcanoes: how worried pilots should be about an eruption.
// GREEN is quiet, RED is erupting with ash in the air. Kept in its own file (no Leaflet, no page)
// so it can be loaded by the map and by node for tests.

// The levels from least to most serious, and their colours in the same order.
export const LEVELS = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
export const LEVEL_COLOURS = ['#2f9e44', '#fab005', '#f76707', '#e03131'];

// For a level we don't know (a typo in the feed, say), so it still shows up on the map.
export const UNKNOWN_LEVEL_COLOUR = '#868e96';

// The colour for a level, e.g. levelColour('ORANGE') is orange.
export function levelColour(level) {
  const position = LEVELS.indexOf(level);
  if (position === -1) return UNKNOWN_LEVEL_COLOUR;
  return LEVEL_COLOURS[position - 1];
}
