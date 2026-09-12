#!/bin/bash
# Builds a minimal double-clickable .app that launches the Electron app in place.
# This is a launcher bundle, not a distributable: it points at the checkout, so
# there is nothing to sign or notarise and no 200MB copy of Electron.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/Applications}"
APP="$DEST/Zwift Badge Planner.app"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Zwift Badge Planner</string>
  <key>CFBundleDisplayName</key><string>Zwift Badge Planner</string>
  <key>CFBundleIdentifier</key><string>local.zwift-plan.launcher</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
cd "$REPO"
exec "$REPO/node_modules/.bin/electron" "$REPO/app/main.js"
LAUNCH

chmod +x "$APP/Contents/MacOS/launch"
echo "built: $APP"
echo "LSUIElement is set, so it runs in the menu bar with no dock icon."
