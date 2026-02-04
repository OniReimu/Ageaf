#!/usr/bin/env bash
set -euo pipefail

# Builds an unsigned macOS .pkg that installs:
# - /usr/local/share/ageaf-host/dist/src/*   (compiled host JS + node_modules)
# - /usr/local/bin/ageaf-host               (wrapper: HTTP when interactive, native messaging when piped by Chrome)
# - /usr/local/bin/ageaf-host-install-manifest (helper for native messaging manifest - optional)
# - /Library/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json (system-wide native messaging manifest)
#
# NOTE: This installer does NOT bundle Node. Users must have Node installed (Node 20+ recommended).
# The host runs as an HTTP server on http://127.0.0.1:3210 by default when launched manually.
# When launched by Chrome via native messaging, it speaks the stdio protocol instead.
#
# Usage:
#   ./host/scripts/macos/build-installer-pkg.sh
#
# Output:
#   dist-native/ageaf-host-macos-unsigned.pkg

usage() {
  cat <<USAGE
Usage:
  ./host/scripts/macos/build-installer-pkg.sh --extension-id <chrome-extension-id>

Notes:
  - Use the Web Store extension ID (stable), not an unpacked dev ID.
  - This builds an unsigned .pkg and embeds the native messaging manifest for that ID.
USAGE
}

EXTENSION_ID="${AGEAF_EXTENSION_ID:-}"
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

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Missing required --extension-id (or set AGEAF_EXTENSION_ID)." >&2
  usage
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOST_DIR="$ROOT_DIR/host"
OUT_DIR="$ROOT_DIR/dist-native"
PKG_ROOT="$OUT_DIR/pkg-root"
SCRIPTS_DIR="$OUT_DIR/pkg-scripts"
PKG_OUT="$OUT_DIR/ageaf-host-macos-unsigned.pkg"
NPM_PROD_DIR="$OUT_DIR/npm-prod"

mkdir -p "$OUT_DIR"
rm -rf "$PKG_ROOT" "$SCRIPTS_DIR"
rm -rf "$NPM_PROD_DIR"
mkdir -p "$PKG_ROOT/usr/local/share/ageaf-host/dist/src"
mkdir -p "$PKG_ROOT/usr/local/share/ageaf-host/node_modules"
mkdir -p "$PKG_ROOT/usr/local/bin"
mkdir -p "$PKG_ROOT/Library/Google/Chrome/NativeMessagingHosts"
mkdir -p "$SCRIPTS_DIR"

pushd "$HOST_DIR" >/dev/null
npm run build
HOST_VERSION="$(node --input-type=module -e "import fs from 'node:fs'; console.log(JSON.parse(fs.readFileSync('package.json','utf8')).version)")"
popd >/dev/null

# Copy compiled JS (must preserve the dist/src layout for relative imports)
cp -R "$HOST_DIR/dist/src/." "$PKG_ROOT/usr/local/share/ageaf-host/dist/src/"

# Install production dependencies (node_modules) without bundling devDependencies.
# We do this in a clean staging directory to avoid mutating the repo's host/node_modules.
mkdir -p "$NPM_PROD_DIR"
cp "$HOST_DIR/package.json" "$HOST_DIR/package-lock.json" "$NPM_PROD_DIR/"
pushd "$NPM_PROD_DIR" >/dev/null
npm ci --omit=dev --ignore-scripts
popd >/dev/null
cp -R "$NPM_PROD_DIR/node_modules/." "$PKG_ROOT/usr/local/share/ageaf-host/node_modules/"

# Ensure Node treats the installed JS as ESM (since the compiled output uses `import`).
cat > "$PKG_ROOT/usr/local/share/ageaf-host/package.json" <<'EOF'
{
  "name": "ageaf-host-runtime",
  "private": true,
  "type": "module"
}
EOF

# Install wrapper executable (auto-detects mode: HTTP for manual launch, native messaging for Chrome launch)
cat > "$PKG_ROOT/usr/local/bin/ageaf-host" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Ageaf host wrapper - auto-detects mode based on stdin
# Requires Node to be installed. Chrome may launch native hosts with a minimal PATH,
# so we also check common install locations.
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
EOF
chmod 0755 "$PKG_ROOT/usr/local/bin/ageaf-host"

# Install helper to write the manifest for a given extension ID
cat > "$PKG_ROOT/usr/local/bin/ageaf-host-install-manifest" <<'EOF'
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
EOF
chmod 0755 "$PKG_ROOT/usr/local/bin/ageaf-host-install-manifest"

# Also install the manifest builder script so the helper works.
mkdir -p "$PKG_ROOT/usr/local/share/ageaf-host/dist"
cp "$HOST_DIR/scripts/build-native-manifest.mjs" "$PKG_ROOT/usr/local/share/ageaf-host/dist/build-native-manifest.mjs"
mkdir -p "$PKG_ROOT/usr/local/share/ageaf-host/native-messaging"
cp "$HOST_DIR/native-messaging/manifest.template.json" "$PKG_ROOT/usr/local/share/ageaf-host/native-messaging/manifest.template.json"

# Install system-wide native messaging manifest for the (stable) Web Store extension ID.
node "$HOST_DIR/scripts/build-native-manifest.mjs" \
  "$EXTENSION_ID" \
  "/usr/local/bin/ageaf-host" \
  "$PKG_ROOT/Library/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"

# Postinstall: remove quarantine xattr from installed files so Gatekeeper doesn't block
# transitive native modules (.node) inside node_modules when the .pkg is downloaded from the internet.
cat > "$SCRIPTS_DIR/postinstall" <<'EOF'
#!/bin/bash
set -euo pipefail

if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine /usr/local/share/ageaf-host 2>/dev/null || true
  xattr -d com.apple.quarantine /usr/local/bin/ageaf-host 2>/dev/null || true
  xattr -d com.apple.quarantine /usr/local/bin/ageaf-host-install-manifest 2>/dev/null || true
  xattr -d com.apple.quarantine /Library/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json 2>/dev/null || true
fi

exit 0
EOF
chmod 0755 "$SCRIPTS_DIR/postinstall"

# Build the .pkg
pkgbuild \
  --root "$PKG_ROOT" \
  --scripts "$SCRIPTS_DIR" \
  --identifier "com.ageaf.host" \
  --version "$HOST_VERSION" \
  --install-location "/" \
  "$PKG_OUT"

echo "Built installer: $PKG_OUT"
