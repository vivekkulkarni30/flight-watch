import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsvLine } from '../server/feeds/csv.js';

test('parseCsv reads plain and quoted fields', () => {
  const rows = parseCsv('a,b,c\n1,"two, with comma",\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'two, with comma', '']]);
});

test('parseCsv turns doubled quotes inside a quoted field into one quote', () => {
  const rows = parseCsv('"Kefalonia ""Anna Pollatou"""\n');
  assert.deepEqual(rows, [['Kefalonia "Anna Pollatou"']]);
});

test('parseCsv handles Windows line endings and no newline at the end', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('toCsvLine quotes only the fields that need it', () => {
  assert.equal(toCsvLine(['SYD', 'Sydney, NSW', 'say "hi"', -33.9]), 'SYD,"Sydney, NSW","say ""hi""",-33.9');
});
