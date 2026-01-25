# macOS Distribution

This document describes how to build and distribute the Ageaf host for macOS users.

## Overview

**Distribution** and **Transport** are separate concerns:

- **Distribution**: How users install the host (`.pkg` installer)
- **Transport**: How the extension communicates with the host (HTTP or Native Messaging)

This doc focuses on **distribution via macOS `.pkg` installer**. Users can choose their preferred transport (HTTP or Native Messaging) in the extension Settings.

## Prerequisites

- Node.js 20+ (recommended)
- npm
- macOS: Xcode Command Line Tools (for `pkgbuild`)

## Building the Installer

### For local development

For local development, skip the installer and run the host directly:

```bash
cd host
npm run dev
```

The extension will connect via HTTP to `http://127.0.0.1:3210` (the default).

### For distribution (.pkg installer)

Build the macOS installer:

```bash
chmod +x host/scripts/macos/build-installer-pkg.sh
./host/scripts/macos/build-installer-pkg.sh
```

This produces: `dist-native/ageaf-host-macos-unsigned.pkg`

**What the installer includes:**
- Host runtime files: `/usr/local/share/ageaf-host/`
- Dependencies: `/usr/local/share/ageaf-host/node_modules/`
- Wrapper executable: `/usr/local/bin/ageaf-host`
- Manifest helper: `/usr/local/bin/ageaf-host-install-manifest` (optional, only needed for native messaging transport)

## Installing the Host

### Install the .pkg

```bash
sudo installer -pkg dist-native/ageaf-host-macos-unsigned.pkg -target /
```

Or users can double-click the `.pkg` file to install via the macOS installer GUI.

### Starting the host

After installation, start the host server:

```bash
ageaf-host
```

This starts the HTTP server on `http://127.0.0.1:3210`.

### Extension configuration

1. Open the extension in Chrome
2. Go to Settings → Connection
3. Ensure **Transport** is set to **HTTP**
4. Ensure **Host URL** is set to `http://127.0.0.1:3210`
5. Click **Save**

## Transport Options

### HTTP (recommended)

- Default transport
- Works for both local dev and production
- Extension connects to `http://127.0.0.1:3210`
- Easier to debug (visible in DevTools)
- No additional setup required

**How to use:**
1. Install the `.pkg` (or run `npm run dev` for local dev)
2. Start the host: `ageaf-host` (or `cd host && npm run dev` for local dev)
3. Extension connects automatically

### Native Messaging (experimental - currently disabled)

**Status:** Native messaging transport is currently experimental and has known bugs. It's disabled in the Settings UI.

**How it works:**
- The `ageaf-host-install-manifest` helper is **only needed for native messaging transport** (not for HTTP)
- It registers a Chrome manifest file that tells Chrome where to find the host executable
- When the extension connects via native messaging, Chrome automatically launches `/usr/local/bin/ageaf-host`
- The wrapper auto-detects it's being launched by Chrome (non-TTY stdin) and runs in native messaging mode
- Users **do not manually run** `ageaf-host` when using native messaging - Chrome launches it automatically

If you need native messaging in the future:
1. Register the Chrome native messaging manifest (one-time setup):
   ```bash
   ageaf-host-install-manifest YOUR_EXTENSION_ID
   ```
   (Find your extension ID in `chrome://extensions` with Developer mode enabled)
2. Select "Native Messaging" in Settings → Connection → Transport
3. Chrome will automatically launch the host when the extension connects

## Distribution

### Option 1: GitHub Releases (recommended)

1. Create a GitHub release
2. Upload `ageaf-host-macos-unsigned.pkg` as an asset
3. Users download and install:
   ```bash
   curl -L https://github.com/yourusername/ageaf/releases/download/v0.1.0/ageaf-host-macos-unsigned.pkg -o ageaf-host.pkg
   sudo installer -pkg ageaf-host.pkg -target /
   ```

### Option 2: Homebrew (future)

Create a Homebrew tap with a formula that:
- Downloads the release tarball
- Runs `npm ci --omit=dev` and `npm run build`
- Installs to `/usr/local/share/ageaf-host`
- Creates wrapper scripts in `/usr/local/bin`

Users install with:
```bash
brew tap yourusername/ageaf
brew install ageaf-host
```

### Option 3: Direct download

Host the `.pkg` on your website and provide a download link.

## Testing the Installation

1. Verify the executable exists:
   ```bash
   ls -la /usr/local/bin/ageaf-host
   ```

2. Start the host:
   ```bash
   ageaf-host
   ```
   
   You should see output indicating the server started (e.g., `Server listening on http://127.0.0.1:3210`)

3. Test with curl:
   ```bash
   curl http://127.0.0.1:3210/v1/health
   ```
   
   Should return: `{"status":"ok","claude":{...}}`

4. Open the extension in Chrome and send a message in the panel

## Troubleshooting

### Host won't start

1. Verify Node is installed:
   ```bash
   node --version
   ```
   
   Should show Node 20+.

2. Check if port 3210 is already in use:
   ```bash
   lsof -i :3210
   ```

3. Try running with debug output:
   ```bash
   cd /usr/local/share/ageaf-host
   node dist/src/start.js
   ```

### Extension can't connect

1. Verify the host is running:
   ```bash
   curl http://127.0.0.1:3210/v1/health
   ```

2. Check extension Settings:
   - Open Settings → Connection
   - Verify Transport is set to **HTTP**
   - Verify Host URL is `http://127.0.0.1:3210`
   - Click **Save**

3. Check browser console for errors (F12 → Console)

## Uninstalling

Since the `.pkg` is unsigned and doesn't include an uninstaller, manually remove files:

```bash
sudo rm -rf /usr/local/share/ageaf-host
sudo rm /usr/local/bin/ageaf-host
sudo rm /usr/local/bin/ageaf-host-install-manifest
rm "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
```

## Security Notes

- The host runs with the same permissions as the user
- The host listens only on `127.0.0.1` (localhost) by default
- Only install the host from trusted sources
- Keep the host updated for security patches

