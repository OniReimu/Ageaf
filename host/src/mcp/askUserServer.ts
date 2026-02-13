import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { ASK_USER_SERVER_NAME, ASK_USER_SERVER_VERSION, getAskUserSdkTools } from './askUserToolDefs.js';

export const askUserMcpServer = createSdkMcpServer({
  name: ASK_USER_SERVER_NAME,
  version: ASK_USER_SERVER_VERSION,
  tools: getAskUserSdkTools(tool),
});
