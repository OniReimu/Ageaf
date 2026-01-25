# Native Messaging Migration - Findings

## Architecture Insights

### Current State
- **Host:** Fastify HTTP server on port 3210
- **Extension:** Fetch-based API calls + SSE for job events
- **Transport:** HTTP only (localhost)

### Target State
- **Dual-mode:** HTTP (dev) + Native Messaging (prod)
- **Host:** Reuses Fastify via `server.inject()` for native messaging
- **Extension:** Background service worker bridges native host
- **Transport abstraction:** Single API, mode-switched via options

### Native Messaging Protocol
- **Format:** Length-prefixed JSON over stdin/stdout
- **Frame:** 4-byte little-endian length + JSON payload
- **Streaming:** Job events use chrome.runtime.Port for long-lived connections

## Technical Decisions

### Why Dual-Mode?
- **Dev:** HTTP server enables fast iteration with hot reload
- **Prod:** Native messaging provides auto-launch, no CORS, better security
- **Flexibility:** Users can choose mode via settings

### Why Reuse Fastify Server?
- **DRY:** All route logic already exists
- **Testing:** Single codebase to test
- **Maintenance:** Changes propagate to both modes

## Key Dependencies

- **Chrome API:** `chrome.runtime.connectNative()`, `chrome.runtime.Port`
- **Node.js:** `process.stdin`, `process.stdout`, Buffer APIs
- **Fastify:** `server.inject()` for request simulation

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Native host crashes | Background script reconnects on disconnect |
| Message size limits (1MB) | Already using chunked SSE for large responses |
| Extension ID changes | Template manifest with placeholder |
| Host path varies | Build script takes path as parameter |

## Research Notes

### Chrome Native Messaging Manifest
- **Location (macOS):** `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- **Required fields:** name, description, path, type, allowed_origins
- **Path must be absolute:** No tilde expansion, no relative paths

### Message Framing
```typescript
// Encode
const json = JSON.stringify(msg);
const body = Buffer.from(json, 'utf8');
const header = Buffer.alloc(4);
header.writeUInt32LE(body.length, 0);
return Buffer.concat([header, body]);

// Decode
const length = buffer.readUInt32LE(0);
const payload = buffer.subarray(4, 4 + length).toString('utf8');
return JSON.parse(payload);
```

## Outstanding Questions

None yet - plan is comprehensive.

## Post-Batch 2 Insights

### Critical: Native Host Disconnect Handling

**Discovery:** When a native messaging host disconnects (crashes, exits, not installed), Chrome calls `onDisconnect` but doesn't automatically reject pending messages or close active ports.

**Impact:** Without explicit cleanup, pending requests hang forever and stream ports never receive error notifications.

**Solution:**
```typescript
nativePort.onDisconnect.addListener(() => {
  const errorMessage = chrome.runtime.lastError?.message || 'Native host disconnected';
  
  // Drain pending requests
  for (const [id, handler] of pending.entries()) {
    handler({ id, kind: 'error', message: errorMessage });
  }
  pending.clear();
  
  // Drain stream ports
  for (const [id, port] of streamPorts.entries()) {
    port.postMessage({ id, kind: 'error', message: errorMessage });
  }
  streamPorts.clear();
  
  nativePort = null;
});
```

**References:**
- Chrome Native Messaging: Disconnect handling
- Background service worker lifecycle
