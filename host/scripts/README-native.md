# Native Messaging Manifest

## Usage

Generate a native messaging manifest for Chrome/Chromium:

```bash
node host/scripts/build-native-manifest.mjs <extension-id> <host-binary-path> <output-path>
```

## Example (macOS)

```bash
node host/scripts/build-native-manifest.mjs \
  "abcdefghijklmnopqrstuvwxyz123456" \
  "/usr/local/bin/ageaf-host" \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ageaf.host.json"
```

## Example (Linux)

```bash
node host/scripts/build-native-manifest.mjs \
  "abcdefghijklmnopqrstuvwxyz123456" \
  "/usr/local/bin/ageaf-host" \
  "$HOME/.config/google-chrome/NativeMessagingHosts/com.ageaf.host.json"
```

## Example (Windows)

```powershell
node host/scripts/build-native-manifest.mjs `
  "abcdefghijklmnopqrstuvwxyz123456" `
  "C:\Program Files\Ageaf\ageaf-host.exe" `
  "manifest.json"

# Then install to registry:
# reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ageaf.host" /ve /d "C:\path\to\manifest.json"
```

## Notes

- Extension ID can be found in `chrome://extensions/` (Developer Mode must be enabled)
- Host binary path must be absolute (no `~` expansion)
- Output path should be in the Chrome NativeMessagingHosts directory for automatic discovery
