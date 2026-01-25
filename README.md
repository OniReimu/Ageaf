# <img src="public/icons/icon_48.png" width="45" align="left"> Ageaf

![Ageaf](assets/screenshot.png)

Ageaf is an Chrome Plugin that adds an agent panel specifically to Overleaf, enabling Claude Code and Codex CLI features.

## Features

- In-page agent panel
- Rewrite selection
- Fix compile errors
- Bib cleanup and related content discovery

## Authentication & Requirements

Ageaf integrates with [Claude Code](https://code.claude.com/docs/en/overview) and [Codex CLI](https://developers.openai.com/codex/cli) agents. Per the terms of service of Anthropic and OpenAI, authentication and subscription management are handled through their official entrypoints:

- **Claude Code**: [https://code.claude.com/docs/en/overview](https://code.claude.com/docs/en/overview)
- **Codex CLI**: [https://developers.openai.com/codex/cli](https://developers.openai.com/codex/cli)

You must have either:
- An official subscription (Claude Pro/Max/Teams/Enterprise or ChatGPT Plus/Pro/Business/Enterprise), or
- Valid API keys

**We strongly encourage using official subscriptions** for better cost-efficiency, higher token limits, and a seamless experience with Ageaf.

## Quick Start

### Local Development
0. Under the project directory.

1. Install dependencies and build and load the extension:
   ```bash
   npm install
   npm run watch
   ```

2. (A separate terminal) Install dependencies for the host and start the host:
   ```bash
   cd host && npm install
   npm run dev
   ```
   
   Then load the unpacked extension:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked"
   - Select the `build/` directory from this repository
   - After making changes, click the reload icon on the extension card in `chrome://extensions`, then refresh your Overleaf tab

### Distribution (macOS)

See [docs/macos-distribution.md](docs/macos-distribution.md) for building and distributing the `.pkg` installer.

## License

MIT License. See [LICENSE](LICENSE) for details.