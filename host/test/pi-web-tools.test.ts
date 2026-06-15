import assert from 'node:assert/strict';
import test from 'node:test';

import { createWebSearchTool, createWebFetchTool, isPrivateIp, stripHtml } from '../src/runtimes/pi/tools.js';

// ── isPrivateIp unit tests ──────────────────────────────────────────

test('isPrivateIp blocks standard IPv4 private ranges', () => {
  assert.ok(isPrivateIp('127.0.0.1'));
  assert.ok(isPrivateIp('127.255.255.255'));
  assert.ok(isPrivateIp('10.0.0.1'));
  assert.ok(isPrivateIp('10.255.255.255'));
  assert.ok(isPrivateIp('172.16.0.1'));
  assert.ok(isPrivateIp('172.31.255.255'));
  assert.ok(isPrivateIp('192.168.0.1'));
  assert.ok(isPrivateIp('192.168.255.255'));
  assert.ok(isPrivateIp('169.254.1.1'));
  assert.ok(isPrivateIp('0.0.0.0'));
});

test('isPrivateIp allows public IPv4', () => {
  assert.ok(!isPrivateIp('8.8.8.8'));
  assert.ok(!isPrivateIp('1.1.1.1'));
  assert.ok(!isPrivateIp('93.184.216.34'));
  assert.ok(!isPrivateIp('172.15.0.1'));
  assert.ok(!isPrivateIp('172.32.0.1'));
});

test('isPrivateIp blocks IPv6 loopback and private ranges', () => {
  assert.ok(isPrivateIp('::1'));
  assert.ok(isPrivateIp('::'));
  assert.ok(isPrivateIp('fc00::1'));
  assert.ok(isPrivateIp('fd12::1'));
  assert.ok(isPrivateIp('fe80::1'));
  // Full fe80::/10 range: fe80:: through febf::
  assert.ok(isPrivateIp('fe90::1'), 'fe90::1 should be blocked (fe80::/10)');
  assert.ok(isPrivateIp('fea0::1'), 'fea0::1 should be blocked (fe80::/10)');
  assert.ok(isPrivateIp('febf::1'), 'febf::1 should be blocked (fe80::/10)');
  // fec0:: is outside fe80::/10
  assert.ok(!isPrivateIp('fec0::1'), 'fec0::1 should NOT be blocked (outside fe80::/10)');
});

test('isPrivateIp blocks IPv6-mapped IPv4 dotted-decimal form', () => {
  assert.ok(isPrivateIp('::ffff:127.0.0.1'));
  assert.ok(isPrivateIp('::ffff:10.0.0.1'));
  assert.ok(isPrivateIp('::ffff:192.168.1.1'));
  assert.ok(!isPrivateIp('::ffff:8.8.8.8'));
});

test('isPrivateIp blocks IPv6-mapped IPv4 hex form (::ffff:7f00:1)', () => {
  // ::ffff:7f00:1 = 127.0.0.1
  assert.ok(isPrivateIp('::ffff:7f00:1'), '::ffff:7f00:1 should be blocked (127.0.0.1)');
  assert.ok(isPrivateIp('::ffff:7f00:0001'), '::ffff:7f00:0001 should be blocked');
  // ::ffff:0a00:1 = 10.0.0.1
  assert.ok(isPrivateIp('::ffff:0a00:1'), '::ffff:0a00:1 should be blocked (10.0.0.1)');
  // ::ffff:c0a8:101 = 192.168.1.1
  assert.ok(isPrivateIp('::ffff:c0a8:101'), '::ffff:c0a8:101 should be blocked (192.168.1.1)');
  // ::ffff:ac10:1 = 172.16.0.1
  assert.ok(isPrivateIp('::ffff:ac10:1'), '::ffff:ac10:1 should be blocked (172.16.0.1)');
  // Public: ::ffff:0808:0808 = 8.8.8.8
  assert.ok(!isPrivateIp('::ffff:0808:0808'), '::ffff:0808:0808 should be allowed (8.8.8.8)');
});

// ── stripHtml unit tests ────────────────────────────────────────────

test('stripHtml removes script and style elements', () => {
  const html = '<p>Hello</p><script>alert("xss")</script><style>body{}</style><p>World</p>';
  const result = stripHtml(html);
  assert.ok(!result.includes('alert'), 'should strip script content');
  assert.ok(!result.includes('body{}'), 'should strip style content');
  assert.ok(result.includes('Hello'), 'should keep text');
  assert.ok(result.includes('World'), 'should keep text');
});

test('stripHtml decodes HTML entities', () => {
  const html = '&amp; &lt; &gt; &quot; &#39; &nbsp;';
  const result = stripHtml(html);
  assert.ok(result.includes('&'));
  assert.ok(result.includes('<'));
  assert.ok(result.includes('>'));
  assert.ok(result.includes('"'));
  assert.ok(result.includes("'"));
});

test('stripHtml collapses whitespace', () => {
  const html = '<p>Hello</p>   \n\n   <p>World</p>';
  const result = stripHtml(html);
  assert.ok(!result.includes('\n'), 'should not contain newlines');
  assert.ok(!result.includes('  '), 'should not contain double spaces');
});

// ── web_search tool tests ───────────────────────────────────────────

test('web_search falls back to DuckDuckGo without API key (returns results)', async () => {
  const saved = process.env.AGEAF_PI_WEB_SEARCH_API_KEY;
  delete process.env.AGEAF_PI_WEB_SEARCH_API_KEY;

  try {
    const tool = createWebSearchTool();
    assert.equal(tool.name, 'web_search');

    const result = await tool.execute('test-1', { query: 'wikipedia' });
    assert.ok(result.content.length > 0, 'should return content');

    const text = (result.content[0] as any).text;
    // Should get actual results, not a "not configured" message
    assert.ok(!text.includes('not configured'), 'should NOT say not configured (DDG fallback)');
    assert.ok(text.includes('URL:'), 'should contain result URLs');
  } finally {
    if (saved !== undefined) {
      process.env.AGEAF_PI_WEB_SEARCH_API_KEY = saved;
    }
  }
});

test('web_search tool has correct metadata', () => {
  const tool = createWebSearchTool();
  assert.equal(tool.name, 'web_search');
  assert.ok(tool.description.includes('search') || tool.description.includes('Search'));
  assert.ok(typeof tool.execute === 'function');
});

// ── web_fetch tool tests ────────────────────────────────────────────

test('web_fetch rejects non-http schemes', async () => {
  const tool = createWebFetchTool();

  await assert.rejects(
    () => tool.execute('test-2', { url: 'ftp://example.com/file' }),
    /Unsupported protocol/,
    'should reject ftp:// URL',
  );

  await assert.rejects(
    () => tool.execute('test-3', { url: 'file:///etc/passwd' }),
    /Unsupported protocol/,
    'should reject file:// URL',
  );
});

test('web_fetch blocks standard private IPs', async () => {
  const tool = createWebFetchTool();

  await assert.rejects(
    () => tool.execute('test-4', { url: 'http://127.0.0.1/' }),
    /private IP/i,
    'should block 127.0.0.1',
  );

  await assert.rejects(
    () => tool.execute('test-5', { url: 'http://192.168.1.1/' }),
    /private IP/i,
    'should block 192.168.1.1',
  );

  await assert.rejects(
    () => tool.execute('test-6', { url: 'http://10.0.0.1/' }),
    /private IP/i,
    'should block 10.0.0.1',
  );

  await assert.rejects(
    () => tool.execute('test-7', { url: 'http://[::1]/' }),
    /private IP/i,
    'should block ::1',
  );
});

test('web_fetch blocks IPv6-mapped IPv4 hex form SSRF bypass', async () => {
  const tool = createWebFetchTool();

  // ::ffff:7f00:1 = 127.0.0.1 in hex-mapped form
  await assert.rejects(
    () => tool.execute('test-hex-1', { url: 'http://[::ffff:7f00:1]/' }),
    /private IP/i,
    'should block ::ffff:7f00:1 (127.0.0.1 hex-mapped)',
  );
});

test('web_fetch allows private IPs when AGEAF_PI_WEB_FETCH_ALLOW_PRIVATE=true', async () => {
  process.env.AGEAF_PI_WEB_FETCH_ALLOW_PRIVATE = 'true';
  const tool = createWebFetchTool();
  try {
    await assert.rejects(
      () => tool.execute('test-8', { url: 'http://127.0.0.1:19999/' }),
      (err: Error) => {
        assert.ok(!err.message.includes('private IP'), 'should not be a private IP error');
        return true;
      },
    );
  } finally {
    delete process.env.AGEAF_PI_WEB_FETCH_ALLOW_PRIVATE;
  }
});

test('web_fetch tool has correct metadata', () => {
  const tool = createWebFetchTool();
  assert.equal(tool.name, 'web_fetch');
  assert.ok(tool.description.includes('http'), 'description should mention http');
  assert.ok(typeof tool.execute === 'function');
});
