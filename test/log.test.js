import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatLine, log } from '../server/log.js';

test('formatLine gives date, time, padded level and message', () => {
  const date = new Date(2026, 8, 8, 10, 5, 7); // 8 September 2026, 10:05:07 local time
  assert.equal(
    formatLine(date, 'WARN', 'sigmet feed returned 204'),
    '2026-09-08 10:05:07 WARN  sigmet feed returned 204',
  );
});

test('log appends a line to the file named in LOG_FILE', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'flight-watch-log-'));
  const file = join(folder, 'nested', 'test.log'); // the folder doesn't exist yet
  const before = process.env.LOG_FILE;
  process.env.LOG_FILE = file;
  t.mock.method(console, 'log', () => {}); // keep test output clean
  t.after(() => {
    if (before === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = before;
    rmSync(folder, { recursive: true, force: true });
  });

  log.info('first line');
  log.error('second line');

  const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} INFO  first line$/);
  assert.match(lines[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ERROR second line$/);
});
