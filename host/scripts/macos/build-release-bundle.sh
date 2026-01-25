#!/usr/bin/env bash
set -euo pipefail

# Build a distributable .tar.gz bundle that installs the Ageaf host
# without requiring a compiled binary (Node runtime required on the target machine).
#
# Bundle contents:
# - dist/src/**                         (compiled host JS + node_modules)
# - dist/build-native-manifest.mjs      (manifest generator - optional)
# - native-messaging/manifest.template.json (optional)
# - package.json                        (type=module marker for installed runtime)
# - install.sh                          (installs HTTP server wrapper + runtime files)
#
# The host runs as an HTTP server by default. Native messaging is experimental.
#
# Output:
#   dist-native/ageaf-host-macos-node-bundle.tar.gz

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOST_DIR="$ROOT_DIR/host"
OUT_DIR="$ROOT_DIR/dist-native"
BUNDLE_DIR="$OUT_DIR/ageaf-host-bundle"
ARCHIVE_PATH="$OUT_DIR/ageaf-host-macos-node-bundle.tar.gz"
NPM_PROD_DIR="$OUT_DIR/npm-prod-bundle"

mkdir -p "$OUT_DIR"
rm -rf "$BUNDLE_DIR"
rm -rf "$NPM_PROD_DIR"
mkdir -p "$BUNDLE_DIR/dist/src"
mkdir -p "$BUNDLE_DIR/node_modules"
mkdir -p "$BUNDLE_DIR/native-messaging"

pushd "$HOST_DIR" >/dev/null
npm run build
popd >/dev/null

# Copy runtime JS (preserve dist/src layout for relative imports)
cp -R "$HOST_DIR/dist/src/." "$BUNDLE_DIR/dist/src/"

# Include production node_modules so the runtime can resolve dependencies (fastify, zod, etc).
mkdir -p "$NPM_PROD_DIR"
cp "$HOST_DIR/package.json" "$HOST_DIR/package-lock.json" "$NPM_PROD_DIR/"
pushd "$NPM_PROD_DIR" >/dev/null
npm ci --omit=dev --ignore-scripts
popd >/dev/null
cp -R "$NPM_PROD_DIR/node_modules/." "$BUNDLE_DIR/node_modules/"

# Install-time ESM marker (so Node treats installed .js files as ES modules)
cat > "$BUNDLE_DIR/package.json" <<'EOF'
{
  "name": "ageaf-host-runtime",
  "private": true,
  "type": "module"
}
EOF

# Copy manifest tooling inputs
cp "$HOST_DIR/scripts/build-native-manifest.mjs" "$BUNDLE_DIR/dist/build-native-manifest.mjs"
cp "$HOST_DIR/native-messaging/manifest.template.json" "$BUNDLE_DIR/native-messaging/manifest.template.json"

# Installer script (run on target machine)
cat > "$BUNDLE_DIR/install.sh" <<'EOF'
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

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on PATH." >&2
  echo "Install Node 20+ and retry." >&2
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

if ! command -v node >/dev/null 2>&1; then
  echo "ageaf-host: Node.js is required but was not found on PATH." >&2
  echo "Install Node 20+ and retry." >&2
  exit 127
fi

cd /usr/local/share/ageaf-host

# If stdin is NOT a TTY (piped by Chrome), run native messaging mode
# Otherwise (manual launch), run HTTP server mode
if [[ ! -t 0 ]]; then
  exec node dist/src/native.js
else
  exec node dist/src/start.js "$@"
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

node "/usr/local/share/ageaf-host/dist/build-native-manifest.mjs" \
  "$EXTENSION_ID" \
  "/usr/local/bin/ageaf-host" \
  "$MANIFEST_PATH"

echo "Wrote native messaging manifest to: $MANIFEST_PATH"
HELPER
sudo chmod 0755 "$BIN_DIR/ageaf-host-install-manifest"

echo "Installed. Next:"
echo "  1) Find your extension ID in chrome://extensions"
echo "  2) Run: ageaf-host-install-manifest <EXTENSION_ID>"

if [[ -n "$EXTENSION_ID" ]]; then
  echo ""
  echo "Registering manifest for extension ID: $EXTENSION_ID"
  "$BIN_DIR/ageaf-host-install-manifest" "$EXTENSION_ID"
fi
EOF
chmod 0755 "$BUNDLE_DIR/install.sh"

tar -czf "$ARCHIVE_PATH" -C "$OUT_DIR" "$(basename "$BUNDLE_DIR")"

echo "Built bundle: $ARCHIVE_PATH"


