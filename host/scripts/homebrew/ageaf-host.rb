class AgeafHost < Formula
  desc "Ageaf companion host for Chrome native messaging (macOS)"
  homepage "https://github.com/OniReimu/Ageaf"
  license "MIT"

  # Web Store extension ID (used as the default for manifest registration).
  DEFAULT_EXTENSION_ID = "gafkbigpgbpcbmkdllomaoogcbebonlj".freeze

  # This formula installs the prebuilt Node runtime bundle produced by:
  #   ./host/scripts/macos/build-release-bundle.sh
  #
  # Maintainers: upload the generated .tar.gz to a release/personal page and update url/sha256.
  #
  # Example (preferred): GitHub Releases asset URL
  #   url "https://github.com/OniReimu/Ageaf/releases/download/v0.1.0/ageaf-host-macos-node-bundle.tar.gz"
url "https://github.com/OniReimu/Ageaf/tree/main/releases/download/v0.1.0/ageaf-host-macos-node-bundle.tar.gz"  # Placeholder checksum (must be replaced for real distribution)
  sha256 "7aa3760a630a38abdc9c880cc59d4452e963e14292121ae272dadcb380eb6088"
  version "0.1.0"

  depends_on "node"

  def install
    bundle_root = (buildpath/"ageaf-host-bundle").directory? ? (buildpath/"ageaf-host-bundle") : buildpath

    libexec.install bundle_root/"dist"
    libexec.install bundle_root/"node_modules"
    libexec.install bundle_root/"native-messaging"
    libexec.install bundle_root/"package.json"

    node_bin = Formula["node"].opt_bin/"node"

    (bin/"ageaf-host").write <<~SH
      #!/usr/bin/env bash
      set -euo pipefail

      NODE_BIN="#{node_bin}"
      cd "#{libexec}"

      # If stdin is NOT a TTY (piped by Chrome), run native messaging mode.
      # Otherwise (manual launch), run HTTP server mode.
      if [[ ! -t 0 ]]; then
        exec "$NODE_BIN" dist/src/native.js
      else
        exec "$NODE_BIN" dist/src/start.js "$@"
      fi
    SH
    chmod 0755, bin/"ageaf-host"

    (bin/"ageaf-host-install-manifest").write <<~SH
      #!/usr/bin/env bash
      set -euo pipefail

      DEFAULT_EXTENSION_ID="#{DEFAULT_EXTENSION_ID}"
      EXTENSION_ID="${1:-$DEFAULT_EXTENSION_ID}"

      MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      MANIFEST_PATH="$MANIFEST_DIR/com.ageaf.host.json"

      mkdir -p "$MANIFEST_DIR"

      NODE_BIN="#{node_bin}"
      "$NODE_BIN" "#{libexec}/dist/build-native-manifest.mjs" \
        "$EXTENSION_ID" \
        "#{bin}/ageaf-host" \
        "$MANIFEST_PATH"

      echo "Wrote native messaging manifest to: $MANIFEST_PATH"
    SH
    chmod 0755, bin/"ageaf-host-install-manifest"

    (bin/"ageaf-host-uninstall-manifest").write <<~SH
      #!/usr/bin/env bash
      set -euo pipefail

      MANIFEST_PATH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
      rm -f "$MANIFEST_PATH"
      echo "Removed native messaging manifest (if present): $MANIFEST_PATH"
    SH
    chmod 0755, bin/"ageaf-host-uninstall-manifest"
  end

  def caveats
    <<~EOS
      To register the native messaging host manifest (Web Store extension ID by default):
        ageaf-host-install-manifest

      Or, to register for a different (e.g. unpacked) extension ID:
        ageaf-host-install-manifest <EXTENSION_ID>

      Then fully quit and reopen Google Chrome.
    EOS
  end
end
