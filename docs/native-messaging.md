# Native Messaging Setup

This document describes how to build and install the Ageaf native messaging host for production use.

## Overview

Native messaging allows the Ageaf extension to communicate with a local companion app via
Chrome’s `chrome.runtime.connectNative()` API instead of HTTP.

- **Extension**: connects to the host name `com.ageaf.host`
- **Native Host**: Node.js process that speaks Chrome’s length‑prefixed JSON protocol over stdin/stdout
- **Manifest**: JSON file that tells Chrome where to find the host binary and which extension IDs are allowed

## Build the native host

From the repo root:

```bash
cd host
npm run build
```

This produces:
- `host/dist/native.js` (native messaging stdio entrypoint)
- `host/dist/start.js` (HTTP server entrypoint for development)

### (Optional) package as a standalone binary

Using `pkg` (example for macOS x64):

```bash
npm install -g pkg
cd host
pkg dist/native.js --targets node20-macos-x64 --output ../dist-native/ageaf-host
```

## Install the native host

### macOS

1. Copy the binary to a permanent location:

```bash
sudo cp dist-native/ageaf-host /usr/local/bin/ageaf-host
sudo chmod +x /usr/local/bin/ageaf-host
```

2. Generate the manifest file:

```bash
node host/scripts/build-native-manifest.mjs \
  YOUR_EXTENSION_ID \
  /usr/local/bin/ageaf-host \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
```

### Linux

```bash
node host/scripts/build-native-manifest.mjs \
  YOUR_EXTENSION_ID \
  /usr/local/bin/ageaf-host \
  "$HOME/.config/google-chrome/NativeMessagingHosts/com.ageaf.host.json"
```

### Windows

```bat
node host/scripts/build-native-manifest.mjs ^
  YOUR_EXTENSION_ID ^
  "C:\\Program Files\\Ageaf\\ageaf-host.exe" ^
  "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\NativeMessagingHosts\\com.ageaf.host.json"
```

## Test the installation

1. Load/reload the extension in Chrome
2. Open Ageaf Settings → Connection
3. Select `Native Messaging (prod)`
4. Click **Retry** for “Native host status”

If successful, the status shows `available`.

## Notes / troubleshooting

- Running the HTTP dev server (`cd host && npm run dev`) is a different transport and should not affect native messaging.
- If you run `/usr/local/bin/ageaf-host` directly in a terminal, it exits with a hint because it expects Chrome’s native messaging protocol on stdin/stdout.
- If the extension shows `unavailable`, verify:
  - The host manifest exists at the correct OS-specific path
  - The manifest `allowed_origins` entry matches your extension ID (from `chrome://extensions`)
  - The manifest `path` is absolute and executable
