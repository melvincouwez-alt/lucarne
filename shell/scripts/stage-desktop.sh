#!/bin/sh
# Stages the desktop side of Lucarne (commands, launchers, icons, Chrome extension and
# native messaging host) under build/ so the .deb carries it, without install.sh:
#   /opt/Lucarne/resources/desktop/{bin,extension,share}
#   /usr/share/applications/lucarne-*.desktop, /usr/share/icons/hicolor/*/apps/lucarne-*.svg
#   /etc/opt/chrome/native-messaging-hosts, /etc/chromium/native-messaging-hosts
set -e
cd "$(dirname "$0")/.."
ROOT=..
OUT=build/stage
RES=/opt/Lucarne/resources/desktop
rm -rf "$OUT"
mkdir -p "$OUT/desktop" "$OUT/applications" "$OUT/icons" "$OUT/native-hosts"
cp -r "$ROOT/bin" "$ROOT/extension" "$ROOT/share" "$OUT/desktop/"
find "$OUT/desktop" -name __pycache__ -prune -exec rm -rf {} +
cp -r "$ROOT/icons/hicolor/." "$OUT/icons/"
python3 "$ROOT/bin/lucarne-desktop-files" "$OUT/applications" lucarne
EXT_ID="$(cat "$ROOT/extension/ID")"
cat >"$OUT/native-hosts/io.github.melvincouwez.lucarne.json" <<JSON
{
  "name": "io.github.melvincouwez.lucarne",
  "description": "Lucarne: opens the links clicked in Chrome",
  "path": "$RES/bin/lucarne-native-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON
echo "staged in $OUT"
