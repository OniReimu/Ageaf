#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist-native"
HOST_OUT="$OUT_DIR/ageaf-host"

mkdir -p "$OUT_DIR"

# Build the host JS
pushd "$ROOT_DIR/host" >/dev/null
npm run build
popd >/dev/null

# Package with pkg (requires pkg installed)
# pkg host/dist/native.js --targets node20-macos-x64 --output "$HOST_OUT"

echo "Host JS built at $ROOT_DIR/host/dist/native.js"
echo "To build a standalone binary at $HOST_OUT, install pkg and uncomment the pkg line above."
