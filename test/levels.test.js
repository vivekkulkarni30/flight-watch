import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_COLOURS, UNKNOWN_LEVEL_COLOUR, levelColour } from '../public/levels.js';

// The volcano levels and their colours are two lists in the same order: GREEN goes with the first
// colour, YELLOW with the second, and so on.
const expected = [
  ['GREEN', 0],
  ['YELLOW', 1],
  ['ORANGE', 2],
  ['RED', 3],
];

for (const [level, position] of expected) {
  test(`levelColour: ${level} gets colour number ${position + 1} in LEVEL_COLOURS`, () => {
    assert.equal(LEVELS[position], level);
    assert.equal(levelColour(level), LEVEL_COLOURS[position]);
  });
}

test('levelColour: a level we do not know gets the grey "unknown" colour', () => {
  assert.equal(levelColour('PURPLE'), UNKNOWN_LEVEL_COLOUR);
});
