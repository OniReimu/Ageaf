const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Claude context API helper supports conversationId query parameter', () => {
  const clientPath = path.join(__dirname, '..', 'src', 'iso', 'api', 'httpClient.ts');
  const contents = fs.readFileSync(clientPath, 'utf8');

  assert.match(
    contents,
    /fetchClaudeRuntimeContextUsage\(\s*options: Options,\s*conversationId\?: string \| null\s*\)/s,
    'expected Claude context helper to accept conversationId'
  );
  assert.match(
    contents,
    /if \(conversationId\) \{\s*url\.searchParams\.set\('conversationId', conversationId\);/s,
    'expected Claude context helper to forward conversationId to the host'
  );
});

test('Claude context facade and transports forward conversationId through the client stack', () => {
  const apiClientPath = path.join(__dirname, '..', 'src', 'iso', 'api', 'client.ts');
  const apiClient = fs.readFileSync(apiClientPath, 'utf8');
  assert.match(
    apiClient,
    /fetchClaudeRuntimeContextUsage\(\s*options: Options,\s*conversationId\?: string \| null\s*\)/s,
    'expected api client facade to accept conversationId'
  );
  assert.match(
    apiClient,
    /createTransport\(options\)\.fetchClaudeRuntimeContextUsage\(conversationId\)/s,
    'expected api client facade to pass conversationId to the transport'
  );

  const transportPath = path.join(__dirname, '..', 'src', 'iso', 'messaging', 'transport.ts');
  const transport = fs.readFileSync(transportPath, 'utf8');
  assert.match(
    transport,
    /fetchClaudeRuntimeContextUsage: \(conversationId\?: string \| null\) => Promise<ClaudeContextUsageResponse>/s,
    'expected transport interface to accept conversationId'
  );

  const httpTransportPath = path.join(__dirname, '..', 'src', 'iso', 'messaging', 'httpTransport.ts');
  const httpTransport = fs.readFileSync(httpTransportPath, 'utf8');
  assert.match(
    httpTransport,
    /fetchClaudeRuntimeContextUsage:\s*\(\s*conversationId\?: string \| null\s*\)\s*=>\s*httpFetchClaudeRuntimeContextUsage\(options,\s*conversationId\)/s,
    'expected HTTP transport to forward conversationId'
  );

  const nativeTransportPath = path.join(__dirname, '..', 'src', 'iso', 'messaging', 'nativeTransport.ts');
  const nativeTransport = fs.readFileSync(nativeTransportPath, 'utf8');
  assert.match(
    nativeTransport,
    /async fetchClaudeRuntimeContextUsage\(conversationId\?: string \| null\)/s,
    'expected native transport to accept conversationId'
  );
  assert.match(
    nativeTransport,
    /path: `\/v1\/runtime\/claude\/context\?sessionScope=project\$\{conversationId \? `&conversationId=\$\{encodeURIComponent\(conversationId\)\}` : ''\}`/s,
    'expected native transport to append conversationId to the context path'
  );
});
