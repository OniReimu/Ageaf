#!/usr/bin/env node
import { buildServer } from './server.js';
import { runNativeMessagingHost } from './nativeMessaging.js';

// Native messaging entrypoint - uses stdin/stdout instead of HTTP
const server = buildServer();
runNativeMessagingHost({ server });
