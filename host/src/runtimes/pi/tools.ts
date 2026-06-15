import dns from 'node:dns';
import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * Check whether an IPv4 address (as 4 octets) belongs to a private/reserved range.
 */
/** @internal Exported for testing only. */
export function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 127) return true;                         // 127.0.0.0/8
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16
  if (a === 0) return true;                           // 0.0.0.0/8
  return false;
}

/**
 * Check whether an IP address belongs to a private/reserved range.
 * Handles IPv4, IPv6, and all IPv6-mapped IPv4 forms:
 *   - dotted-decimal: ::ffff:127.0.0.1
 *   - hex:            ::ffff:7f00:1
 */
/** @internal Exported for testing only. */
export function isPrivateIp(ip: string): boolean {
  // IPv6-mapped IPv4, dotted-decimal form: ::ffff:127.0.0.1
  const mappedDotted = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedDotted) return isPrivateIp(mappedDotted[1]!);

  // IPv6-mapped IPv4, hex form: ::ffff:7f00:0001 or ::ffff:7f00:1
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16);
    const lo = parseInt(mappedHex[2]!, 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    return isPrivateIpv4(a, b);
  }

  // IPv4 checks
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts as [number, number, number, number];
    return isPrivateIpv4(a, b);
  }

  // IPv6 checks
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;                // loopback
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;  // fc00::/7
  if (/^fe[89ab]/i.test(normalized)) return true;        // fe80::/10 link-local (fe80–febf)
  if (normalized === '::') return true;                 // unspecified

  return false;
}

/**
 * Resolve all A and AAAA records for a hostname.
 * Returns at least one address or throws.
 */
async function resolveAllAddresses(hostname: string): Promise<string[]> {
  const [v4Result, v6Result] = await Promise.allSettled([
    dns.promises.resolve4(hostname),
    dns.promises.resolve6(hostname),
  ]);

  const addresses: string[] = [];

  if (v4Result.status === 'fulfilled') {
    addresses.push(...v4Result.value);
  } else {
    const code = (v4Result.reason as NodeJS.ErrnoException)?.code;
    if (code !== 'ENODATA' && code !== 'ENOTFOUND' && code !== 'ENOENT') {
      throw v4Result.reason;
    }
  }

  if (v6Result.status === 'fulfilled') {
    addresses.push(...v6Result.value);
  } else {
    const code = (v6Result.reason as NodeJS.ErrnoException)?.code;
    if (code !== 'ENODATA' && code !== 'ENOTFOUND' && code !== 'ENOENT') {
      throw v6Result.reason;
    }
  }

  if (addresses.length === 0) {
    throw new Error(`Could not resolve any addresses for ${hostname}`);
  }

  return addresses;
}

/**
 * Validate a URL for safe fetching: scheme allowlist, DNS resolution, private IP blocking.
 * Note on TOCTOU: DNS can change between our check and Node's actual connect.
 * Full mitigation requires a custom `lookup` option on the HTTP agent.
 * For a localhost-only tool, the DNS pre-check is a reasonable defense-in-depth layer.
 */
async function validateUrlForFetch(url: string, allowPrivate: boolean): Promise<void> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol} — only http and https are allowed`);
  }

  if (allowPrivate) return;

  const hostname = parsed.hostname;

  // Handle bare IP literals (no DNS needed)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith('[') || hostname.includes(':')) {
    const bareIp = hostname.replace(/^\[|\]$/g, '');
    if (isPrivateIp(bareIp)) {
      throw new Error(`Access to private IP ${hostname} is blocked`);
    }
    return;
  }

  // Resolve DNS and check all addresses
  const addresses = await resolveAllAddresses(hostname);
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`DNS for ${hostname} resolved to private IP ${addr} — blocked`);
    }
  }
}

/**
 * Strip HTML tags and clean up whitespace. Simple but effective for content extraction.
 */
/** @internal Exported for testing only. */
export function stripHtml(html: string): string {
  let text = html;
  // Remove script and style elements
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

const WebSearchParams = Type.Object({
  query: Type.String({ description: 'Search query' }),
  count: Type.Optional(Type.Number({
    description: 'Number of results (1-20, default 5)',
    minimum: 1,
    maximum: 20,
  })),
});

const WebFetchParams = Type.Object({
  url: Type.String({ description: 'URL to fetch (http/https only)' }),
  maxLength: Type.Optional(Type.Number({
    description: 'Maximum character length of extracted text (default 100000)',
  })),
});

/**
 * Search via Brave Search API (requires AGEAF_PI_WEB_SEARCH_API_KEY).
 */
async function searchViaBrave(
  query: string,
  count: number,
  apiKey: string,
): Promise<{ title: string; url: string; snippet: string }[]> {
  const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('count', String(count));

  const response = await fetch(searchUrl.toString(), {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? 'Untitled',
    url: r.url ?? '',
    snippet: r.description ?? '',
  }));
}

/**
 * Search via DuckDuckGo HTML (no API key needed, free fallback).
 */
async function searchViaDuckDuckGo(
  query: string,
  count: number,
): Promise<{ title: string; url: string; snippet: string }[]> {
  const ddgUrl = new URL('https://html.duckduckgo.com/html/');
  ddgUrl.searchParams.set('q', query);

  const response = await fetch(ddgUrl.toString(), {
    method: 'POST',
    headers: {
      'User-Agent': 'Ageaf-WebSearch/1.0',
      'Accept': 'text/html',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search error: ${response.status}`);
  }

  const html = await response.text();
  const results: { title: string; url: string; snippet: string }[] = [];

  // Parse DuckDuckGo HTML results — each result is in a <div class="result">
  // with <a class="result__a"> for title/url and <a class="result__snippet"> for snippet
  const resultBlocks = html.split(/class="result\s/);
  for (let i = 1; i < resultBlocks.length && results.length < count; i++) {
    const block = resultBlocks[i]!;

    // Extract URL from result__a href
    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    let url = urlMatch?.[1] ?? '';

    // DuckDuckGo wraps URLs in a redirect; extract the actual URL
    const uddgMatch = url.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]!);
    }

    // Extract title text from result__a
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch?.[1]?.trim() ?? 'Untitled';

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    let snippet = snippetMatch?.[1] ?? '';
    // Strip inline HTML tags from snippet
    snippet = snippet.replace(/<[^>]+>/g, '').trim();

    if (url && !url.startsWith('//duckduckgo.com')) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

export function createWebSearchTool(): AgentTool<typeof WebSearchParams> {
  return {
    name: 'web_search',
    label: 'Web Search',
    description: 'Search the web for information. Returns titles, URLs, and snippets.',
    parameters: WebSearchParams,
    async execute(_toolCallId, params) {
      const apiKey = process.env.AGEAF_PI_WEB_SEARCH_API_KEY?.trim();
      const count = Math.min(Math.max(params.count ?? 5, 1), 20);

      let results: { title: string; url: string; snippet: string }[];

      if (apiKey) {
        results = await searchViaBrave(params.query, count, apiKey);
      } else {
        // Free fallback: DuckDuckGo HTML search
        results = await searchViaDuckDuckGo(params.query, count);
      }

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No results found for: ${params.query}` }],
          details: {},
        };
      }

      const formatted = results.map((r, i) =>
        `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`,
      ).join('\n\n');

      return {
        content: [{ type: 'text', text: formatted }],
        details: {},
      };
    },
  };
}

const MAX_RESPONSE_BYTES = 1_048_576; // 1MB
const MAX_REDIRECTS = 5;

export function createWebFetchTool(): AgentTool<typeof WebFetchParams> {
  return {
    name: 'web_fetch',
    label: 'Fetch Web Page',
    description: 'Fetch a web page URL and extract its text content. Supports http/https only. Blocks access to private/internal networks.',
    parameters: WebFetchParams,
    async execute(_toolCallId, params) {
      const allowPrivate = process.env.AGEAF_PI_WEB_FETCH_ALLOW_PRIVATE === 'true';
      const maxLength = params.maxLength ?? 100_000;
      let currentUrl = params.url;

      // Validate initial URL
      await validateUrlForFetch(currentUrl, allowPrivate);

      // Follow redirects manually to validate each hop
      let response: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'User-Agent': 'Ageaf-WebFetch/1.0',
            'Accept': 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
          },
        });

        // Not a redirect — done
        if (!response.status.toString().startsWith('3') || !response.headers.get('location')) {
          break;
        }

        // Follow redirect
        const location = response.headers.get('location')!;
        const nextUrl = new URL(location, currentUrl).toString();

        // Validate redirect target
        await validateUrlForFetch(nextUrl, allowPrivate);
        currentUrl = nextUrl;

        if (hop === MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
        }
      }

      if (!response || !response.ok) {
        const status = response?.status ?? 0;
        throw new Error(`Fetch failed: HTTP ${status} for ${currentUrl}`);
      }

      // Stream body with byte cap
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          reader.cancel();
          chunks.push(value.slice(0, value.byteLength - (totalBytes - MAX_RESPONSE_BYTES)));
          break;
        }
        chunks.push(value);
      }

      const bodyBuffer = new Uint8Array(Math.min(totalBytes, MAX_RESPONSE_BYTES));
      let offset = 0;
      for (const chunk of chunks) {
        bodyBuffer.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const rawText = new TextDecoder().decode(bodyBuffer);

      // Determine content type
      const contentType = response.headers.get('content-type') ?? '';
      let extracted: string;
      if (contentType.includes('html')) {
        extracted = stripHtml(rawText);
      } else {
        extracted = rawText;
      }

      // Truncate to maxLength
      if (extracted.length > maxLength) {
        extracted = extracted.slice(0, maxLength) + '\n\n[Content truncated]';
      }

      return {
        content: [{ type: 'text', text: extracted }],
        details: {},
      };
    },
  };
}
