<div align="center">
  <h1><img src="public/icons/icon_48.png" alt="Ageaf" width="45"> Ageaf: AI Agent for Overleaf</h1>
  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
    <img src="https://img.shields.io/badge/Chrome-Extension-blue" alt="Chrome Extension">
    <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3">
  </p>
</div>

https://github.com/user-attachments/assets/8360eb0e-4285-407b-96ff-268df143e074

Ageaf is an Chrome Plugin that adds an agent panel specifically to Overleaf, enabling Claude Code and Codex CLI features.

## News

- **2026-02-25**: Light mode enabled — use Ageaf comfortably in bright environments
- **2026-02-24**: Smarter slash commands — type `/` for suggestions that actually match what you're looking for
- **2026-02-23**: Work with longer papers without slowdowns — better memory management for big documents
- **2026-02-22**: Automatic notation checker — Ageaf now helps keep your abbreviations and symbols consistent
- **2026-02-20**: Check all your citations at once — find missing or incorrect references in seconds

## Features

Ageaf supercharges your academic writing workflow — right inside Overleaf, where your papers already live.

- **Powered by Claude Code CLI & Codex CLI** — Ageaf stands on the shoulders of the two most powerful coding CLIs available today. That means full access to **agent skills, MCP servers, and plugins** out of the box — the most capable, most extensible AI toolchain ever brought to academic writing.
- **AI Agent Panel, Built Into Overleaf** — No tab-switching, no copy-pasting. Chat with a powerful AI assistant that sees your LaTeX source in real time and proposes inline edits you can accept or reject with one click.
- **Instant Prose Refinement** — Select any paragraph and let Ageaf rewrite it for clarity, conciseness, or tone. Tighten an abstract, sharpen a related-work discussion, or polish camera-ready text in seconds.
- **One-Click Compile Error Fixes** — Cryptic LaTeX errors become a thing of the past. Ageaf reads the log, pinpoints the issue, and generates a ready-to-apply patch so you can get back to writing instead of debugging.
- **Smart Citation Management** — Audit your bibliography in bulk: detect missing references, flag inconsistent entries, and discover related work — all without leaving your editor.
- **Multi-File Paper Support** — Working on a 50-page thesis split across dozens of `.tex` files? Ageaf navigates your full project tree and applies targeted edits to the right file, every time.
- **Notation & Consistency Checker** — Automatically catch inconsistent abbreviations, variable names, and notation across sections before your reviewers do.
- **Bring Your Own Model** — Use Claude, GPT, Gemini, DeepSeek, Qwen, Grok, and 1,000+ more models. Plug in any API key and start writing — your choice, your data.

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
DEEPSEEK_API_KEY=...              # DeepSeek (V3, R1)
DASHSCOPE_API_KEY=...             # Alibaba (Qwen Max/Plus/Turbo)
```

Start the host (`npm run dev`), then select **BYOK** from the provider dropdown in the Ageaf panel. Use the model picker to choose your provider and model.

**We strongly encourage using official subscriptions** (Claude Code or Codex CLI) for better cost-efficiency, higher token limits, and a seamless experience with Ageaf.

### Supported Models

BYOK supports **1,000+ models** across 20+ providers. Here is a highlight of supported model families:

| Provider | Models | API Key |
| --- | --- | --- |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.5, Claude Haiku 4.5, Claude 3.7/3.5 series | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-5.2, GPT-5.1, GPT-5, GPT-4.1, GPT-4o, o4-mini, o3, o3-pro, Codex | `OPENAI_API_KEY` |
| **Google** | Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro/Flash, Gemini 2.0 Flash | `GEMINI_API_KEY` |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | `DEEPSEEK_API_KEY` |
| **Alibaba Qwen** | Qwen Max, Qwen Plus, Qwen Turbo (via DashScope) | `DASHSCOPE_API_KEY` |
| **xAI** | Grok 4, Grok 3, Grok 2 | `XAI_API_KEY` |
| **Mistral** | Mistral Large, Devstral, Codestral, Magistral, Pixtral | `MISTRAL_API_KEY` |
| **Groq** | Llama 4, Llama 3.3, DeepSeek R1, Qwen, Kimi K2 | `GROQ_API_KEY` |
| **OpenRouter** | 180+ models from all major providers in one API | `OPENROUTER_API_KEY` |
| **Amazon Bedrock** | 70+ models including Nova, Claude, Llama, Mistral | Bedrock credentials |
| **Azure OpenAI** | Full GPT and o-series lineup | Azure credentials |
| **Google Vertex** | Gemini models via Google Cloud | Vertex credentials |
| **Cerebras** | Ultra-fast inference for GPT-OSS, Qwen, GLM | `CEREBRAS_API_KEY` |
| **HuggingFace** | DeepSeek, Kimi K2, Qwen, MiniMax, MiMo | `HF_TOKEN` |
| **MiniMax** | MiniMax M2, M2.1 | `MINIMAX_API_KEY` |
| **Z.AI (Zhipu)** | GLM-4.7, GLM-4.6, GLM-4.5 | `ZAI_API_KEY` |

> Add just one API key and Ageaf auto-detects the available models. Mix and match as many providers as you like.

## Quick Start

### Local Development (Strongly recommended)
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

## How to Update Ageaf

### If you run Ageaf from source (this repo)
Use **two terminals** for updates:

**Terminal 1 (extension):**
```bash
git pull
npm install
npm run watch
```

**Terminal 2 (host, separate terminal):**
```bash
cd host
npm install
npm run dev
```

Keep both terminals running during the update so extension rebuilds and host runtime stay in sync.

Then in Chrome:
- Open `chrome://extensions`
- Click **Reload** on Ageaf
- Refresh your Overleaf tab

### If you installed the host with Homebrew
```bash
brew update
brew upgrade --cask ageaf-host
```

## Native Messaging on macOS (Homebrew)

For production-style local usage, install the native companion host with Homebrew:

```bash
brew install --cask ageaf-host
```

If Gatekeeper blocks launch because the app is **unsigned**, open:
**System Settings → Privacy & Security** and allow Ageaf Host to run.

More details are in [`docs/native-messaging.md`](docs/native-messaging.md).


## License

MIT License. See [LICENSE](LICENSE) for details.
