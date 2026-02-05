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
# The host runs as an HTTP server when launched manually. When launched by Chrome via native
# messaging, it speaks the stdio protocol instead.
#
# Output:
#   dist-native/ageaf-host-macos-node-bundle.tar.gz
#
# Distribution options:
#   1. GitHub Releases (recommended):
#      - Upload the .tar.gz as a release asset
#      - URL format: https://github.com/OWNER/REPO/releases/download/vVERSION/ageaf-host-macos-node-bundle.tar.gz
#
#   2. Separate distribution repository:
#      - Use --prepare-dist-repo to create a repo structure
#      - Push to a separate repo and tag it
#      - URL format: https://github.com/OWNER/ageaf-host/archive/refs/tags/vVERSION.tar.gz
#      - Note: The archive will contain the bundle directory, so adjust Homebrew formula accordingly

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HOST_DIR="$ROOT_DIR/host"
OUT_DIR="$ROOT_DIR/dist-native"
BUNDLE_DIR="$OUT_DIR/ageaf-host-bundle"
ARCHIVE_PATH="$OUT_DIR/ageaf-host-macos-node-bundle.tar.gz"
NPM_PROD_DIR="$OUT_DIR/npm-prod-bundle"

# Parse arguments
PREPARE_DIST_REPO=false
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prepare-dist-repo)
      PREPARE_DIST_REPO=true
      shift
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    -h|--help)
      cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --prepare-dist-repo    Create a distribution repository structure
  --version VERSION      Specify version for distribution repo (required with --prepare-dist-repo)
  -h, --help            Show this help message

Examples:
  # Build bundle for GitHub Releases
  $0

  # Prepare for distribution repository
  $0 --prepare-dist-repo --version 1.2.3
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$PREPARE_DIST_REPO" == true && -z "$VERSION" ]]; then
  echo "Error: --version is required when using --prepare-dist-repo" >&2
  exit 1
fi

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
EOF
chmod 0755 "$BUNDLE_DIR/install.sh"

tar -czf "$ARCHIVE_PATH" -C "$OUT_DIR" "$(basename "$BUNDLE_DIR")"

# Calculate SHA256 checksum
SHA256=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')

echo ""
echo "✓ Built bundle: $ARCHIVE_PATH"
echo "✓ SHA256: $SHA256"
echo ""

if [[ "$PREPARE_DIST_REPO" == true ]]; then
  DIST_REPO_DIR="$OUT_DIR/ageaf-host-dist"
  rm -rf "$DIST_REPO_DIR"
  mkdir -p "$DIST_REPO_DIR"
  
  # Copy bundle contents to distribution repo root
  cp -R "$BUNDLE_DIR/." "$DIST_REPO_DIR/"
  
  # Create a README for the distribution repo
  cat > "$DIST_REPO_DIR/README.md" <<EOF
# Ageaf Host Distribution

This repository contains pre-built bundles for the Ageaf host.

## Installation

Extract this archive and run \`./install.sh\` from the extracted directory.

## For Homebrew

This repository is structured for use with Homebrew formulas that reference GitHub archive URLs:

\`\`\`
url "https://github.com/OWNER/ageaf-host/archive/refs/tags/v${VERSION}.tar.gz"
\`\`\`

Note: The archive will contain this directory structure, so adjust the Homebrew formula's
\`install\` method to reference the correct paths within the extracted archive.
EOF
  
  # Create .gitignore
  echo "# This repo only contains the bundle" > "$DIST_REPO_DIR/.gitignore"
  
  echo "✓ Prepared distribution repository structure in: $DIST_REPO_DIR"
  echo ""
  echo "Next steps:"
  echo "  1. cd $DIST_REPO_DIR"
  echo "  2. git init"
  echo "  3. git add ."
  echo "  4. git commit -m \"Release v${VERSION}\""
  echo "  5. git remote add origin <YOUR_DIST_REPO_URL>"
  echo "  6. git push -u origin main"
  echo "  7. git tag v${VERSION}"
  echo "  8. git push origin v${VERSION}"
  echo ""
  echo "Then use this URL in your Homebrew formula:"
  echo "  https://github.com/OWNER/ageaf-host/archive/refs/tags/v${VERSION}.tar.gz"
  echo ""
else
  echo "Distribution options:"
  echo ""
  echo "1. GitHub Releases (recommended):"
  echo "   - Create a release on GitHub"
  echo "   - Upload: $ARCHIVE_PATH"
  echo "   - Use URL: https://github.com/OWNER/REPO/releases/download/vVERSION/ageaf-host-macos-node-bundle.tar.gz"
  echo ""
  echo "2. Distribution repository:"
  echo "   - Run: $0 --prepare-dist-repo --version VERSION"
  echo "   - Follow the instructions to create a separate distribution repo"
  echo ""
fi
