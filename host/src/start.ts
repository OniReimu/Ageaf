#!/usr/bin/env node
import { buildServer } from './server.js';

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
