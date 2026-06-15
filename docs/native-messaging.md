# Native Messaging Setup

Ageaf can connect to the local host through Chrome Native Messaging.

## macOS Install (Homebrew)

Install the companion app:

```bash
brew install --cask ageaf-host
```

The installer registers:
- `com.ageaf.host`
- Chrome native messaging manifest under `NativeMessagingHosts`

## Unsigned Installer Note

If macOS warns that the host is unsigned, open:
`System Settings -> Privacy & Security`
and allow the blocked Ageaf Host item.

After allowing it once, retry from the Ageaf panel settings.
