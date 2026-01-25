#!/usr/bin/env bash
set -euo pipefail

# Builds an unsigned macOS .pkg that installs:
# - /usr/local/share/ageaf-host/dist/src/*   (compiled host JS + node_modules)
# - /usr/local/bin/ageaf-host               (wrapper that starts HTTP server)
# - /usr/local/bin/ageaf-host-install-manifest (helper for native messaging manifest - optional)
#
# NOTE: This installer does NOT bundle Node. Users must have Node installed (Node 20+ recommended).
# The host runs as an HTTP server on http://127.0.0.1:3210 by default.
# Native messaging is experimental and currently disabled in the extension.
#
# Usage:
#   ./host/scripts/macos/build-installer-pkg.sh
#
# Output:
#   dist-native/ageaf-host-macos-unsigned.pkg

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
# Requires Node to be installed and available on PATH.
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

node "/usr/local/share/ageaf-host/dist/build-native-manifest.mjs" \
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

# Build the .pkg
pkgbuild \
  --root "$PKG_ROOT" \
  --identifier "com.ageaf.host" \
  --version "$HOST_VERSION" \
  --install-location "/" \
  "$PKG_OUT"

echo "Built installer: $PKG_OUT"


