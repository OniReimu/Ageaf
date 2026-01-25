#!/usr/bin/env bash
set -euo pipefail

HOST_PATH="/usr/local/bin/ageaf-host"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/com.ageaf.host.json"

mkdir -p "$MANIFEST_DIR"
node "$(dirname "$0")/../build-native-manifest.mjs" "$AGEAF_EXTENSION_ID" "$HOST_PATH" "$MANIFEST_PATH"
