# Native Messaging Migration - Progress Log

## Session Start: 2026-01-25

### Plan Review

**Canonical Plan:** `docs/plans/2026-01-24-native-messaging-migration.md`

**Plan Quality:** Excellent - comprehensive, test-driven, includes all components:
- ✅ Native messaging protocol with tests
- ✅ Host-side implementation with Fastify reuse
- ✅ Extension-side background bridge
- ✅ Transport abstraction for mode switching
- ✅ UI for transport selection and host detection
- ✅ Packaging scripts for macOS distribution
- ✅ E2E verification checklist

**Execution Strategy:**
- Follow TDD approach (test first, implement, verify)
- Execute in batches of 3 tasks
- Report after each batch for feedback
- Track deviations in task_plan.md

**Assumptions:**
1. Extension ID will be obtained during build/packaging phase
2. HTTP mode will remain default for development
3. Native mode will be opt-in via settings
4. Tests use node:test (built into Node.js)

**Concerns:**
- None - plan is well-structured and accounts for edge cases

**First Batch (Tasks 0-2):**
1. Task 0: Repo hygiene (git status, branch)
2. Task 1: Native messaging protocol helpers + tests
3. Task 2: Job subscription helpers + tests

---

## Activity Log

### Task 0: Repo Hygiene

**Starting:** Pre-flight checks before implementation

**Step 1:** Checked git status - on branch `OniReimu/medan-v4`

**Step 2:** Created feature branch `OniReimu/native-messaging`

**Step 3:** Baseline recorded:
- Branch: `OniReimu/native-messaging`
- Untracked files: planning files (findings.md, progress.md, task_plan.md)
- Working directory: clean except for planning files

**Step 4:** Reminder noted - will commit only plan-related work

**Status:** ✅ Complete

---

### Task 1: Native Messaging Framing Helpers (Host)

**Starting:** Implementing length-prefixed JSON protocol

**Step 1:** Created test file `host/test/native-messaging-protocol.test.ts` with:
- Round-trip encoding/decoding test
- Partial frame buffering test

**Step 2:** Ran test - confirmed failure (ERR_MODULE_NOT_FOUND)

**Step 3:** Implemented `host/src/nativeMessaging/protocol.ts`:
- `encodeNativeMessage()`: JSON → length-prefixed Buffer
- `decodeNativeMessages()`: Buffer → messages array + carry buffer
- Handles partial frames correctly

**Step 4:** Ran test - all tests passing (2/2)

**Step 5:** Committed changes

**Status:** ✅ Complete (commit 3ca62c4)

---

### Task 2: Job Event Subscription Helpers (Host)

**Starting:** Exposing subscribeToJobEvents for native messaging

**Step 1:** Created test file `host/test/native-messaging-jobs-subscribe.test.ts` with:
- Test for replaying event history
- Test for unsubscribe function

**Step 2:** Ran test - confirmed failure (export not found)

**Step 3:** Implemented subscription helpers in `host/src/routes/jobs.ts`:
- `subscribeToJobEvents()`: Main subscription logic
  - Replays event history
  - Returns unsubscribe function if not done
  - Handles done state
- `createJobForTest()`: Test helper to create job records
- `subscribeToJobEventsForTest()`: Test wrapper for subscription

**Step 4:** Ran test - all tests passing (1/1)

**Step 5:** Committed changes

**Status:** ✅ Complete (commit 1be8ac6)

---

## Batch 1 Report (Tasks 0-2)

**Completed:** 2026-01-25

**Tasks Completed:**
1. ✅ Task 0: Repo hygiene - branch created, baseline recorded
2. ✅ Task 1: Native messaging protocol - encoding/decoding implemented with tests
3. ✅ Task 2: Job subscription helpers - subscription API exposed with tests

**Files Created:**
- `host/src/nativeMessaging/protocol.ts` (30 lines)
- `host/test/native-messaging-protocol.test.ts` (27 lines)
- `host/test/native-messaging-jobs-subscribe.test.ts` (20 lines)

**Files Modified:**
- `host/src/routes/jobs.ts` (+37 lines)

**Tests Added:** 3 test cases, all passing

**Verification:**
```bash
# Protocol tests
✅ native messaging protocol round-trips JSON
✅ native messaging protocol buffers partial frames

# Subscription tests
✅ subscribeToJobEvents replays history and ends when done
```

**Commits:**
- `3ca62c4` - test: add native messaging framing coverage
- `1be8ac6` - test: expose job event subscription helpers

**Plan Deviations:** None

**Issues Encountered:** None - all tests passed on first implementation

**Next Batch (Tasks 3-5):**
1. Task 3: Native host entrypoint (native messaging host logic)
2. Task 4: Runtime script + manifest template
3. Task 5: Background native messaging bridge (extension)

---

## Batch 2: Native Host Implementation

### Task 3: Native Messaging Host Entrypoint

**Starting:** Implementing stdin/stdout message handler with Fastify server.inject()

**Step 1:** Created test file `host/test/native-messaging-host.test.ts` with:
- PassThrough streams for stdin/stdout simulation
- Health endpoint request test

**Step 2:** Ran test - confirmed failure (module not found)

**Step 3:** Implemented `host/src/nativeMessaging.ts`:
- `runNativeMessagingHost()`: Main host function
  - Reads/writes length-prefixed messages from stdin/stdout
  - Routes normal requests via `server.inject()`
  - Handles streaming job events via `subscribeToJobEvents()`
- Type definitions for NativeHostRequest/Response

**Step 4:** Updated `host/src/server.ts`:
- Added comment about dual-mode usage (HTTP and native)

**Step 5:** Ran test with AGEAF_START_SERVER=false - test passing (1/1)

**Step 6:** Committed changes

**Status:** ✅ Complete (commit 1c6c66f)

---

### Task 4: Native Host Runtime Script + Manifest Template

**Starting:** Creating package.json script, manifest template, and build scripts

**Step 1:** Created test file `host/test/native-messaging-manifest.test.ts`
- Tests for manifest template existence

**Step 2:** Ran test - confirmed failure (file not found)

**Step 3:** Created manifest and build infrastructure:
- `host/native-messaging/manifest.template.json`: Template with placeholders
- `host/scripts/build-native-manifest.mjs`: Manifest generator script
- `host/scripts/README-native.md`: Usage instructions for macOS/Linux/Windows
- `host/src/native.ts`: Executable entry point for native host

**Step 4:** Updated `host/package.json`:
- Added `"native": "tsx src/native.ts"` script

**Step 5:** Ran test - test passing (1/1)

**Step 6:** Committed changes

**Status:** ✅ Complete (commit eb8078b)

---

### Task 5: Background Native Messaging Bridge (Extension)

**Starting:** Implementing extension background script to bridge native host

**Step 1:** Created test file `test/native-bridge.test.cjs`
- Tests that background.ts registers native messaging bridge

**Step 2:** Ran test - confirmed failure (no connectNative found)

**Step 3:** Created `src/iso/messaging/nativeProtocol.ts`:
- Type definitions for NativeHostRequest/Response
- Matches host-side protocol types

**Step 4:** Updated `src/background.ts`:
- `ensureNativePort()`: Manages native host connection
- `chrome.runtime.onMessage`: Handles single-request messages
- `chrome.runtime.onConnect`: Handles streaming connections
- Pending request tracking and port management

**Step 5:** Ran test - all tests passing (78/78)

**Step 6:** Committed changes

**Status:** ✅ Complete (commit 3197c36)

---

## Batch 2 Report (Tasks 3-5)

**Completed:** 2026-01-25

**Tasks Completed:**
1. ✅ Task 3: Native host entrypoint - stdin/stdout handler implemented
2. ✅ Task 4: Runtime script + manifest - build infrastructure created
3. ✅ Task 5: Background bridge - extension native messaging bridge

**Files Created:**
- `host/src/nativeMessaging.ts` (104 lines)
- `host/src/native.ts` (9 lines)
- `host/test/native-messaging-host.test.ts` (38 lines)
- `host/native-messaging/manifest.template.json` (7 lines)
- `host/scripts/build-native-manifest.mjs` (21 lines)
- `host/scripts/README-native.md` (44 lines)
- `host/test/native-messaging-manifest.test.ts` (17 lines)
- `src/iso/messaging/nativeProtocol.ts` (16 lines)
- `test/native-bridge.test.cjs` (13 lines)

**Files Modified:**
- `host/src/server.ts` (+2 lines)
- `host/package.json` (+1 script)
- `src/background.ts` (+57 lines)

**Tests Added:** 3 test cases, all passing

**Verification:**
```bash
# Host tests (with AGEAF_START_SERVER=false)
✅ native messaging host answers health requests
✅ native messaging manifest template exists

# Extension tests  
✅ background registers native messaging bridge
```

**Commits:**
- `1c6c66f` - feat: add native messaging host entrypoint
- `eb8078b` - docs: add native messaging manifest template and script
- `3197c36` - feat: add native messaging bridge in background

**Plan Deviations:** None

**Issues Encountered:** 
- env var timing in tests (resolved by setting AGEAF_START_SERVER externally)
- __dirname not available in ESM (resolved using import.meta.url)

**Next Batch (Tasks 6-8):**
1. Task 6: Transport abstraction (HTTP/Native transport layer)
2. Task 7: Options + UI (Settings and host detection)
3. Task 8: Manifest permission (Add nativeMessaging permission)

---

## Critical Fixes (Post-Batch 2 Review)

### Fix 1: Background Bridge Error Handling (CRITICAL)

**Issue:** Native host disconnect/crash leaves pending requests and stream ports hanging forever

**Starting:** Adding disconnect/error cleanup to background bridge

**Step 1:** Updated `src/background.ts` onDisconnect handler
- Drains all pending requests with error response
- Drains all stream ports with error messages
- Clears both maps before setting port to null

**Step 2:** Tested - all 38 tests passing with AGEAF_START_SERVER=false

**Status:** ✅ Complete

---

### Fix 2: Build Script Path Handling

**Issue:** `build-native-manifest.mjs` uses new URL().pathname which fails with spaces

**Step 1:** Updated to use `fileURLToPath(import.meta.url)`

**Status:** ✅ Complete

---

### Fix 3: Test Assertion Completeness  

**Issue:** Task 2 test doesn't assert that `ended === true` for done jobs

**Step 1:** Added `createDoneJobForTest()` helper to `host/src/routes/jobs.ts`

**Step 2:** Added second test case "ends immediately for completed jobs"
- Creates done job
- Subscribes and verifies `ended === true`
- Verifies `unsubscribe === undefined`

**Step 3:** Renamed first test to clarify it tests active jobs

**Step 4:** Ran tests - both passing (2/2)

**Status:** ✅ Complete

---

**Commit:** bd93a64 - fix: add disconnect error handling and improve tests

**All Fixes Verified:**
- ✅ Critical: Background bridge error handling
- ✅ Important: Build script path handling  
- ✅ Minor: Test assertions complete

**Tests Status:** 40/40 passing (38 extension + 2 host subscription)

---

## Code Review Fixes (Pre-Merge)

### Issue #1-3: Server Auto-Start Side Effect (CRITICAL)

**Problem:** `server.ts` auto-starts HTTP listener on import, breaking tests and server.inject()

**Starting:** Refactoring server auto-start to dedicated entrypoint

**Step 1:** Removed auto-start side effect from `host/src/server.ts`
- Now exports only `buildServer()` function, no side effects

**Step 2:** Created `host/src/start.ts` entrypoint for HTTP mode
- Calls `buildServer()` and starts HTTP listener
- Used by npm run dev/start

**Step 3:** Updated `host/package.json` scripts
- `dev`: `tsx watch src/start.ts` (was server.ts)
- `start`: `node dist/start.js` (was server.js)

**Step 4:** Simplified `host/src/native.ts`
- Removed unnecessary `AGEAF_START_SERVER` env var
- Now just builds server and runs native messaging host

**Status:** ✅ Complete

---

### Issue #5: Streaming Subscription Cleanup

**Problem:** Subscriptions not cleaned up on disconnect, causing subscriber leaks

**Step 1:** Added `activeSubscriptions` Map to track unsubscribe functions

**Step 2:** Updated subscription handler
- Store unsubscribe function when subscription created
- Call unsubscribe when sending end/error
- Remove from map after cleanup

**Step 3:** Added input stream cleanup handlers
- `input.on('end', cleanup)`
- `input.on('close', cleanup)`
- `input.on('error', cleanup)`

**Status:** ✅ Complete

---

### Issue #7: Headers Type Safety

**Problem:** Fastify headers can be `string | string[] | number`, unsafe cast

**Step 1:** Added header normalization before sending response
- `string` → kept as-is
- `string[]` → joined with ', '
- `number` → converted to string
- Others → skipped

**Status:** ✅ Complete

---

**Commit:** 669bbed - fix: remove server auto-start side effects and add cleanup

**All Issues Resolved:**
- ✅ Issue #1-3: Server auto-start side effects (CRITICAL)
- ✅ Issue #4: crypto import (was already correct)
- ✅ Issue #5: Streaming subscription cleanup
- ✅ Issue #6: Background disconnect handling (fixed in bd93a64)
- ✅ Issue #7: Headers type safety
- ✅ Issue #8: Path encoding (fixed in bd93a64)

**Tests Status:** 38/38 host tests passing WITHOUT env vars

---

## Batch 3: Transport Abstraction + Options UI

### Task 6: Transport Abstraction (Extension)

**Starting:** Implementing HTTP and native transport layers with abstraction

**Step 1:** Created test file `test/iso-transport.test.cjs`
- Tests for transport.ts existence with createTransport, native, and http

**Step 2:** Ran test - confirmed failure (module not found)

**Step 3:** Implemented transport abstraction:
- Created `src/iso/api/httpClient.ts`: Moved HTTP implementations from client.ts
  - All job/runtime/tools API functions
  - Added `fetchHostHealth()` function
- Created `src/iso/messaging/httpTransport.ts`: HTTP transport wrapper
  - Wraps httpClient functions with options injection
- Created `src/iso/messaging/nativeTransport.ts`: Native messaging transport
  - `sendNativeRequest()`: Single request handler with timeout
  - Implements all API functions using chrome.runtime.sendMessage
  - Implements streaming with chrome.runtime.connect
- Created `src/iso/messaging/transport.ts`: Transport factory
  - `createTransport()`: Selects HTTP or native based on options.transport
- Updated `src/iso/api/client.ts`: Delegates to transport layer
  - Re-exports types from httpClient
  - All functions delegate to createTransport()

**Step 4:** Fixed existing tests to check httpClient.ts:
- Updated `test/iso-api-client-codex-metadata.test.cjs`
- Updated `test/iso-api-client-codex-runtime.test.cjs`
- Updated `test/iso-api-client.test.cjs`

**Step 5:** Ran tests - all tests passing (79/79)

**Status:** ✅ Complete

**Commit:** 439bc34 - feat: add HTTP/native transport abstraction

---

### Task 7: Options + UI for Transport

**Starting:** Adding transport option to settings and UI controls

**Step 1:** Created test files:
- `test/options-transport-default.test.cjs`: Checks for transport defaults in helper.ts
- Updated `test/options-fields.test.cjs`: Added assertion for ageaf-transport-mode

**Step 2:** Ran tests - confirmed failures (missing transport implementation)

**Step 3:** Implemented transport option and UI:
- Updated `src/types.ts`: Added `transport?: 'http' | 'native'` to Options interface
- Updated `src/utils/helper.ts`: Added transport default logic (defaults to 'http')
- Updated `src/iso/panel/Panel.tsx`: Added transport mode selector in Connection tab
  - Select dropdown with "HTTP (dev)" and "Native Messaging (prod)" options
  - Host URL field shown only when transport is not 'native'
  - Hint message shown when native mode is selected

**Step 4:** Ran tests - all tests passing (80/80)

**Status:** ✅ Complete

**Commit:** 33f415f - feat: add transport option and connection UI

---

### Task 8: Manifest Permission for Native Messaging

**Starting:** Adding nativeMessaging permission to manifest

**Step 1:** Created test file `test/manifest-native-messaging.test.cjs`
- Tests that manifest.json includes nativeMessaging permission

**Step 2:** Ran test - confirmed failure (permission missing)

**Step 3:** Updated `public/manifest.json`:
- Added "nativeMessaging" to permissions array

**Step 4:** Ran tests - all tests passing (81/81)

**Status:** ✅ Complete

**Commit:** bdeda66 - feat: request nativeMessaging permission

---

## Batch 3 Report (Tasks 6-8)

**Completed:** 2026-01-25

**Tasks Completed:**
1. ✅ Task 6: Transport abstraction - HTTP and native transport layers
2. ✅ Task 7: Options + UI - Transport mode selector and settings
3. ✅ Task 8: Manifest permission - nativeMessaging permission added

**Files Created:**
- `src/iso/api/httpClient.ts` (332 lines)
- `src/iso/messaging/httpTransport.ts` (55 lines)
- `src/iso/messaging/nativeTransport.ts` (216 lines)
- `src/iso/messaging/transport.ts` (9 lines)
- `test/iso-transport.test.cjs` (13 lines)
- `test/options-transport-default.test.cjs` (12 lines)
- `test/manifest-native-messaging.test.cjs` (11 lines)

**Files Modified:**
- `src/iso/api/client.ts` (refactored to delegate to transport)
- `src/types.ts` (+1 field: transport)
- `src/utils/helper.ts` (+3 lines: transport defaults)
- `src/iso/panel/Panel.tsx` (+24 lines: transport UI)
- `public/manifest.json` (+1 permission)
- `test/iso-api-client-codex-metadata.test.cjs` (updated to check httpClient.ts)
- `test/iso-api-client-codex-runtime.test.cjs` (updated to check httpClient.ts)
- `test/iso-api-client.test.cjs` (updated to check httpClient.ts)
- `test/options-fields.test.cjs` (+1 assertion: transport mode)

**Tests Added:** 3 test cases, all passing

**Verification:**
```bash
# Transport abstraction tests
✅ transport abstraction exists for native messaging

# Options tests
✅ options helper defines transport defaults
✅ Settings modal includes transport mode field

# Manifest tests
✅ manifest requests nativeMessaging permission
```

**Commits:**
- `439bc34` - feat: add HTTP/native transport abstraction
- `33f415f` - feat: add transport option and connection UI
- `bdeda66` - feat: request nativeMessaging permission

**Plan Deviations:** None

**Issues Encountered:** None - all tests passed on first implementation

**Tests Status:** 81/81 passing (78 extension + 3 new)

**Next Batch (Tasks 9-11):**
1. Task 9: Extension-side availability UX + native ping
2. Task 10: Packaging + installer scaffolding (macOS)
3. Task 11: E2E verification checklist (manual testing)

---

## Code Review Fixes (Post-Batch 3)

### Issue #1: Panel Health Check Hardwired to HTTP (CRITICAL)

**Problem:** Connection health uses direct fetch instead of transport-aware API

**Starting:** Making panel health check respect transport mode

**Step 1:** Added `fetchHostHealth` to imports in Panel.tsx

**Step 2:** Replaced direct fetch with `fetchHostHealth(options)`
- Updated condition to only check hostUrl when transport is not native
- Uses transport-aware API that respects options.transport

**Status:** ✅ Complete

---

### Issue #2: hostUrl Always Defaulted

**Problem:** `hostUrl` defaulted even in native mode, removing "not configured" state

**Step 1:** Updated `src/utils/helper.ts`
- Only default hostUrl when `transport !== 'native'`

**Status:** ✅ Complete

---

### Issue #3: Native Request Timeout Leak (CRITICAL)

**Problem:** Background service worker holds pending entries indefinitely on timeout

**Step 1:** Added 'cancel' message type to protocol
- Updated `src/iso/messaging/nativeProtocol.ts`
- Added `kind: 'cancel'` variant to NativeHostRequest

**Step 2:** Added cancel handler in background
- Updated `src/background.ts`
- Handles `ageaf:native-cancel` messages to delete pending entries

**Step 3:** Send cancel on timeout
- Updated `src/iso/messaging/nativeTransport.ts`
- sendNativeRequest sends cancel message on timeout

**Status:** ✅ Complete

---

### Issue #4: Native Transport Ignores Response Status (CRITICAL)

**Problem:** Native transport doesn't check for errors or non-2xx responses

**Step 1:** Created `unwrapNativeResponse()` helper
- Checks for `kind: 'error'` and throws with message
- Checks for non-2xx status codes and throws with error details
- Extracts body for successful responses

**Step 2:** Updated all nativeTransport methods
- All methods now use `unwrapNativeResponse()` instead of manual checks
- Proper error handling with status code verification

**Status:** ✅ Complete

---

### Issue #5: Async Data Handler Race Condition (CRITICAL)

**Problem:** `carry` buffer corruption due to concurrent async data handlers

**Step 1:** Refactored message processing
- Extracted `processMessage()` async function
- Added `processingChain` promise for serialization
- Changed `continue` statements to `return` in processMessage

**Step 2:** Serialize chunk processing
- Data handler now chains processMessage calls via processingChain
- Prevents concurrent access to shared carry buffer

**Status:** ✅ Complete

---

### Issue #6: postMessage Can Throw

**Problem:** Disconnect handler can crash if port.postMessage throws

**Step 1:** Wrapped postMessage in try/catch
- Updated `src/background.ts` disconnect handler
- Gracefully handles already-disconnected ports

**Status:** ✅ Complete

---

### Issue #7: JSON.parse Can Crash Native Host

**Problem:** Malformed frames crash the native host process

**Step 1:** Added try/catch around JSON.parse
- Updated `host/src/nativeMessaging/protocol.ts`
- Logs error and skips malformed frames instead of crashing

**Status:** ✅ Complete

---

**Tests Status:**
- ✅ Extension tests: 81/81 passing
- ✅ Host tests: 38/38 passing

**All Issues Resolved:**
- ✅ Issue #1: Panel health check transport-aware
- ✅ Issue #2: hostUrl only defaulted when needed
- ✅ Issue #3: Native request timeout cleanup
- ✅ Issue #4: Response status and error handling
- ✅ Issue #5: Serialized message processing
- ✅ Issue #6: postMessage error handling
- ✅ Issue #7: JSON.parse error handling

**Ready for next batch**
