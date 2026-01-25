#!/usr/bin/env node
import { buildServer } from './server.js';
import { runNativeMessagingHost } from './nativeMessaging.js';

if (process.stdin.isTTY) {
  console.error('Ageaf native host expects a native-messaging client (Chrome) on stdin/stdout.');
  console.error('Install the native messaging manifest and retry from the extension settings.');
  process.exit(0);
}

// Native messaging entrypoint - uses stdin/stdout instead of HTTP
const server = buildServer();
runNativeMessagingHost({ server });
