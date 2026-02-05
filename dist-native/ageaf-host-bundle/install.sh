#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  ./install.sh [--extension-id EXT_ID]

Installs Ageaf native messaging host files to:
  /usr/local/share/ageaf-host
and installs executables:
  /usr/local/bin/ageaf-host
  /usr/local/bin/ageaf-host-install-manifest

Node.js is required (Node 20+ recommended).
USAGE
}

EXTENSION_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id)
      EXTENSION_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$NODE_BIN" && -n "${HOME:-}" ]]; then
  shopt -s nullglob
  for candidate in "$HOME/.nvm/versions/node"/*/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
    fi
  done
  shopt -u nullglob
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required but was not found." >&2
  echo "Install Node 20+ (Homebrew recommended) and retry." >&2
  exit 127
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_SRC="$SCRIPT_DIR"

INSTALL_ROOT="/usr/local/share/ageaf-host"
BIN_DIR="/usr/local/bin"

echo "Installing runtime to: $INSTALL_ROOT"
sudo mkdir -p "$INSTALL_ROOT"
sudo rsync -a --delete "$RUNTIME_SRC/dist/" "$INSTALL_ROOT/dist/"
sudo rsync -a --delete "$RUNTIME_SRC/node_modules/" "$INSTALL_ROOT/node_modules/"
sudo rsync -a --delete "$RUNTIME_SRC/native-messaging/" "$INSTALL_ROOT/native-messaging/"
sudo cp "$RUNTIME_SRC/package.json" "$INSTALL_ROOT/package.json"

echo "Installing executables to: $BIN_DIR"

sudo tee "$BIN_DIR/ageaf-host" > /dev/null <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$NODE_BIN" && -n "${HOME:-}" ]]; then
  shopt -s nullglob
  for candidate in "$HOME/.nvm/versions/node"/*/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
    fi
  done
  shopt -u nullglob
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "ageaf-host: Node.js is required but was not found." >&2
  echo "Install Node 20+ (Homebrew recommended) and retry." >&2
  exit 127
fi

cd /usr/local/share/ageaf-host

# If stdin is NOT a TTY (piped by Chrome), run native messaging mode
# Otherwise (manual launch), run HTTP server mode
if [[ ! -t 0 ]]; then
  exec "$NODE_BIN" dist/src/native.js
else
  exec "$NODE_BIN" dist/src/start.js "$@"
fi
WRAP
sudo chmod 0755 "$BIN_DIR/ageaf-host"

sudo tee "$BIN_DIR/ageaf-host-install-manifest" > /dev/null <<'HELPER'
#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ID="${1:-}"
if [[ -z "$EXTENSION_ID" ]]; then
  echo "Usage: ageaf-host-install-manifest <extension-id>" >&2
  echo "Find the extension ID in chrome://extensions (Developer mode)." >&2
  exit 2
fi

MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/com.ageaf.host.json"

mkdir -p "$MANIFEST_DIR"

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$NODE_BIN" && -n "${HOME:-}" ]]; then
  shopt -s nullglob
  for candidate in "$HOME/.nvm/versions/node"/*/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
    fi
  done
  shopt -u nullglob
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required but was not found." >&2
  echo "Install Node 20+ (Homebrew recommended) and retry." >&2
  exit 127
fi

"$NODE_BIN" "/usr/local/share/ageaf-host/dist/build-native-manifest.mjs" \
  "$EXTENSION_ID" \
  "/usr/local/bin/ageaf-host" \
  "$MANIFEST_PATH"

echo "Wrote native messaging manifest to: $MANIFEST_PATH"
HELPER
sudo chmod 0755 "$BIN_DIR/ageaf-host-install-manifest"

if command -v xattr >/dev/null 2>&1; then
  sudo xattr -dr com.apple.quarantine "$INSTALL_ROOT" 2>/dev/null || true
  sudo xattr -d com.apple.quarantine "$BIN_DIR/ageaf-host" 2>/dev/null || true
  sudo xattr -d com.apple.quarantine "$BIN_DIR/ageaf-host-install-manifest" 2>/dev/null || true
fi

echo "Installed. Next:"
echo "  1) Find your extension ID in chrome://extensions"
echo "  2) Run: ageaf-host-install-manifest <EXTENSION_ID>"

if [[ -n "$EXTENSION_ID" ]]; then
  echo ""
  echo "Registering manifest for extension ID: $EXTENSION_ID"
  "$BIN_DIR/ageaf-host-install-manifest" "$EXTENSION_ID"
fi
