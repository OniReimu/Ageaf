# <img src="public/icons/icon_48.png" width="45" align="left"> Ageaf

A browser extension for the Overleaf website with a Cursor-like agent panel.

## Features

- In-page agent chat panel
- Rewrite selection
- Fix compile errors
- Bib cleanup and related content discovery

## Quick Start

### Local Development

1. Install dependencies:
   ```bash
   npm install
   cd host && npm install
   ```

2. Start the host:
   ```bash
   cd host
   npm run dev
   ```

3. Build and load the extension:
   ```bash
   npm run watch
   ```
   
   Then load the unpacked extension from `build/` in `chrome://extensions`

### Distribution (macOS)

See [docs/macos-distribution.md](docs/macos-distribution.md) for building and distributing the `.pkg` installer.

---

This project was bootstrapped with [Chrome Extension CLI](https://github.com/dutiyesh/chrome-extension-cli)
