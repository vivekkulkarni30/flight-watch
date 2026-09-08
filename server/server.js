import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { log } from './log.js';

const here = dirname(fileURLToPath(import.meta.url));

// Build the app without starting it, so tests can call app.inject().
export function buildServer() {
  const app = Fastify();
  app.register(fastifyStatic, { root: join(here, '..', 'public') });
  return app;
}

// Only listen when this file is run directly (npm start), not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const app = buildServer();
  await app.listen({ port, host: '0.0.0.0' });
  log.info(`Flight Watch running at http://localhost:${port}`);
}
