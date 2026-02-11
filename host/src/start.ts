#!/usr/bin/env node
import 'dotenv/config';
import { buildServer } from './server.js';
import { shutdownToolRuntime } from './runtimes/pi/toolRuntime.js';

// HTTP server entrypoint for development mode
const server = buildServer();
const port = Number(process.env.PORT ?? 3210);
const host = process.env.HOST ?? '127.0.0.1';

server
  .listen({ port, host })
  .then((address) => {
    console.log(`Ageaf host listening on ${address}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Graceful shutdown: close HTTP + tool runtime
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received — shutting down…`);
  await Promise.allSettled([
    server.close(),
    shutdownToolRuntime(),
  ]);
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
