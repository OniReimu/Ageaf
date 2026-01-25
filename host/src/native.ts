#!/usr/bin/env node
import { buildServer } from './server.js';
import { runNativeMessagingHost } from './nativeMessaging.js';

// Prevent HTTP server auto-start
process.env.AGEAF_START_SERVER = 'false';

const server = buildServer();
runNativeMessagingHost({ server });
