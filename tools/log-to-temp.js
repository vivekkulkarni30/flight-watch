// Loaded before every test file (see the test script in package.json): unless a test says otherwise,
// log lines go to a temporary file, so running the tests never adds lines to the real logs/app.log.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOG_FILE ??= join(tmpdir(), `flight-watch-test-${process.pid}.log`);
