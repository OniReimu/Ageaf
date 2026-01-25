# Native Messaging Setup

This document describes how to build and install the Ageaf native messaging host for production use.

## Overview

The native messaging host allows the Ageaf extension to communicate with the local host process via Chrome's native messaging API instead of HTTP. This is the recommended setup for production use.

## Architecture

- **Extension**: Uses `chrome.runtime.connectNative()` to establish a connection
- **Native Host**: Node.js process that communicates via stdin/stdout using length-prefixed JSON frames
- **Manifest**: JSON file that tells Chrome where to find the native host binary

## Building the Native Host

### Prerequisites

- Node.js 20+
- npm
- (Optional) `pkg` for creating standalone binaries

### Build Steps

1. Build the TypeScript source:
   ```bash
   cd host
   npm run build
   ```

2. The compiled output will be in `host/dist/native.js`

3. (Optional) Package as a standalone binary:
   ```bash
   npm install -g pkg
   cd host
   pkg dist/native.js --targets node20-macos-x64 --output ../dist-native/ageaf-host
   ```

## Installing the Native Host

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

3. The extension ID can be found in `chrome://extensions` when you load the unpacked extension

### Linux

1. Copy the binary:
   ```bash
   sudo cp dist-native/ageaf-host /usr/local/bin/ageaf-host
   sudo chmod +x /usr/local/bin/ageaf-host
   ```

2. Generate the manifest:
   ```bash
   node host/scripts/build-native-manifest.mjs \
     YOUR_EXTENSION_ID \
     /usr/local/bin/ageaf-host \
     "$HOME/.config/google-chrome/NativeMessagingHosts/com.ageaf.host.json"
   ```

### Windows

1. Copy the binary to a permanent location (e.g., `C:\Program Files\Ageaf\ageaf-host.exe`)

2. Generate the manifest:
   ```bash
   node host/scripts/build-native-manifest.mjs ^
     YOUR_EXTENSION_ID ^
     "C:\Program Files\Ageaf\ageaf-host.exe" ^
     "%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts\com.ageaf.host.json"
   ```

## Testing the Installation

1. Open the extension in Chrome
2. Go to Settings → Connection
3. Select "Native Messaging (prod)" from the Transport dropdown
4. Click "Retry" to check the native host status
5. If successful, the status should show "available"

## Troubleshooting

### Native host status shows "unavailable"

1. Check that the binary exists and is executable:
   ```bash
   ls -la /usr/local/bin/ageaf-host
   ```

2. Test the binary manually:
   ```bash
   /usr/local/bin/ageaf-host
   # Should start without errors
   ```

3. Check the manifest file:
   ```bash
   cat "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
   ```

4. Verify the extension ID in the manifest matches your actual extension ID

### Chrome errors

Check Chrome's native messaging logs:
- macOS/Linux: `chrome://extensions` → Developer mode → Errors
- Look for messages about "Native messaging host" connection failures

## Security Notes

- The native host runs with the same permissions as the user
- The manifest restricts which extensions can connect (via `allowed_origins`)
- Only install the native host from trusted sources
- Keep the host binary updated for security patches
