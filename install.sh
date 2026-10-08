#!/usr/bin/env bash
# Installe Lucarne (services web Microsoft 365) sur le bureau (sans root) :
# pages d'amorce, lanceurs .desktop (bin/lucarne-desktop-files), icônes,
# schémas ms-word:/msteams:…, hôte de messagerie native pour l'extension Chrome.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DATA="$HOME/.local/share/lucarne"
APPS_DIR="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor"
EXT_ID="$(cat "$ROOT/extension/ID")"

mkdir -p "$APPS_DIR" "$HOME/.local/bin"
# Ancien nom (m365-linux) : lanceurs, icônes, commandes et hôte natif retirés
rm -f "$HOME/.local/bin/m365" "$HOME/.local/bin/m365-settings" \
  "$APPS_DIR"/m365-*.desktop "$HOME/.config/autostart"/m365-*.desktop \
  "$HOME/.config/google-chrome/NativeMessagingHosts/io.github.melvincouwez.m365.json" \
  "$HOME/.config/chromium/NativeMessagingHosts/io.github.melvincouwez.m365.json"
find "$ICONS" -name 'm365-*.svg' -delete 2>/dev/null || true
# (dossiers de données créés seulement après la reprise de l'ancien nom, sinon mv ne se fait pas)
[ -d "$HOME/.local/share/m365-linux" ] && [ ! -e "$DATA" ] && mv "$HOME/.local/share/m365-linux" "$DATA"
[ -d "$HOME/.config/m365-linux" ] && [ ! -e "$HOME/.config/lucarne" ] && mv "$HOME/.config/m365-linux" "$HOME/.config/lucarne"
[ -d "$HOME/.cache/m365-linux" ] && [ ! -e "$HOME/.cache/lucarne" ] && mv "$HOME/.cache/m365-linux" "$HOME/.cache/lucarne"
mkdir -p "$DATA/loaders"

ln -sf "$ROOT/bin/lucarne" "$HOME/.local/bin/lucarne"
ln -sf "$ROOT/bin/lucarne-settings" "$HOME/.local/bin/lucarne-settings"

# Pages d'amorce (repli Chrome --app sans l'appli Electron) :
# id|Nom|Accueil|Dégradé (clair moyen foncé)
LOADER_APPS=(
  "word|Word|https://www.office.com/launch/word?auth=2|#64baff #3689e6 #0d52bf"
  "excel|Excel|https://www.office.com/launch/excel?auth=2|#9bdb4d #68b723 #3a9104"
  "powerpoint|PowerPoint|https://www.office.com/launch/powerpoint?auth=2|#ffa154 #f37329 #cc3b02"
  "onenote|OneNote|https://www.office.com/launch/onenote?auth=2|#f4679d #de3e80 #bc245d"
  "outlook|Outlook|https://outlook.office.com/mail/|#7f9cc6 #56739f #3b5680"
  "teams|Teams|https://teams.microsoft.com/v2/|#cd9ef7 #a56de2 #7239b3"
  "powerbi|Power BI|https://app.powerbi.com/home|#ffe16b #f9c440 #d48e15"
)

for row in "${LOADER_APPS[@]}"; do
  IFS='|' read -r id name home bg <<<"$row"
  read -r c1 c2 c3 <<<"$bg"
  sed -e "s|@NAME@|$name|g" -e "s|@HOME@|$home|g" -e "s|@C1@|$c1|g" -e "s|@C2@|$c2|g" -e "s|@C3@|$c3|g" \
    -e "s|@ICON@|file://$ICONS/128x128/apps/lucarne-$id.svg|g" \
    "$ROOT/share/loader.html" >"$DATA/loaders/$id.html"
done

# Lanceurs des 7 applis et de Réglages (même générateur que le paquet .deb)
python3 "$ROOT/bin/lucarne-desktop-files" "$APPS_DIR" lucarne lucarne-settings

# Applis désactivées ou cachées dans Réglages : NoDisplay, démarrage auto
python3 "$ROOT/bin/lucarne_config.py" apply

cp -r "$ROOT/icons/hicolor/." "$ICONS/"
touch "$ICONS"
gtk-update-icon-cache -qtf "$ICONS" 2>/dev/null || true

# Schémas d'URL : « Ouvrir dans l'application » de SharePoint, liens Teams, Outlook, Power BI.
# mailto: reste à l'appli de courrier choisie par l'utilisateur (Outlook le déclare seulement).
for pair in ms-word:word ms-excel:excel ms-powerpoint:powerpoint onenote:onenote \
            ms-onenote:onenote msteams:teams ms-outlook:outlook ms-powerbi:powerbi; do
  xdg-mime default "lucarne-${pair#*:}.desktop" "x-scheme-handler/${pair%%:*}"
done
update-desktop-database -q "$APPS_DIR" 2>/dev/null || true

# Hôte de messagerie native pour l'extension : Google Chrome, et Chromium s'il est configuré
host_manifest() {
  mkdir -p "$1"
  cat >"$1/io.github.melvincouwez.lucarne.json" <<EOF
{
  "name": "io.github.melvincouwez.lucarne",
  "description": "Lucarne: opens links clicked in Chrome in the desktop apps",
  "path": "$ROOT/bin/lucarne-native-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
}
host_manifest "$HOME/.config/google-chrome/NativeMessagingHosts"
if [ -d "$HOME/.config/chromium" ]; then
  host_manifest "$HOME/.config/chromium/NativeMessagingHosts"
fi

echo "Apps installed. Load the extension once in chrome://extensions:"
echo "  Developer mode, \"Load unpacked\", folder $ROOT/extension"
