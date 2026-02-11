# <img src="public/icons/icon_48.png" width="45" align="left"> Ageaf

![Ageaf](assets/screenshot.png)

Ageaf is an Chrome Plugin that adds an agent panel specifically to Overleaf, enabling Claude Code and Codex CLI features.

## Features

- In-page agent panel
- Rewrite selection
- Fix compile errors
- Bib cleanup and related content discovery

## Authentication & Requirements

Ageaf supports three runtime providers. You only need **one** to get started.

### Claude Code (Anthropic)

Uses [Claude Code](https://code.claude.com/docs/en/overview) via the official CLI/SDK. Requires either an official subscription (Claude Pro/Max/Teams/Enterprise) or a valid Anthropic API key.

### Codex CLI (OpenAI)

Uses [Codex CLI](https://developers.openai.com/codex/cli). Requires either an official subscription (ChatGPT Plus/Pro/Business/Enterprise) or a valid OpenAI API key.

### BYOK — Bring Your Own Key

BYOK lets you use **any supported LLM provider** by setting API keys in a `.env` file. The host auto-detects which providers are available on startup.

```bash
cd host
cp .env.example .env
```

Edit `host/.env` and uncomment the keys you need:

```env
ANTHROPIC_API_KEY=sk-ant-...      # Anthropic (Claude)
OPENAI_API_KEY=sk-...             # OpenAI (GPT-4o, o3, etc.)
GEMINI_API_KEY=...                # Google (Gemini)
XAI_API_KEY=...                   # xAI (Grok)
GROQ_API_KEY=...                  # Groq
MISTRAL_API_KEY=...               # Mistral
OPENROUTER_API_KEY=...            # OpenRouter (multi-provider)
```

Start the host (`npm run dev`), then select **BYOK** from the provider dropdown in the Ageaf panel. Use the model picker to choose your provider and model.

**We strongly encourage using official subscriptions** (Claude Code or Codex CLI) for better cost-efficiency, higher token limits, and a seamless experience with Ageaf.

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


## License

MIT License. See [LICENSE](LICENSE) for details.
