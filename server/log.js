// One place for all logging. Each call writes one plain line, like
//   2026-09-08 10:05:07 WARN  sigmet feed returned 204
// to the screen and to a log file (logs/app.log, or the file named in LOG_FILE).
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const two = (n) => String(n).padStart(2, '0');

// Turn a date, level and message into one log line (local time).
export function formatLine(date, level, message) {
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  return `${day} ${time} ${level.padEnd(5)} ${message}`;
}

function write(level, message) {
  const line = formatLine(new Date(), level, message);
  console.log(line);
  // Read LOG_FILE on every write, so it can be changed without restarting (tests rely on this).
  const file = process.env.LOG_FILE || 'logs/app.log';
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, line + '\n');
}

export const log = {
  info: (message) => write('INFO', message),
  warn: (message) => write('WARN', message),
  error: (message) => write('ERROR', message),
};
