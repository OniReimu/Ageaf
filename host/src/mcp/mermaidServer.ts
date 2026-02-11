import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import {
  MERMAID_SERVER_NAME,
  MERMAID_SERVER_VERSION,
  getMermaidSdkTools,
} from './mermaidToolDefs.js';

export const mermaidMcpServer = createSdkMcpServer({
  name: MERMAID_SERVER_NAME,
  version: MERMAID_SERVER_VERSION,
  tools: getMermaidSdkTools(tool),
});
