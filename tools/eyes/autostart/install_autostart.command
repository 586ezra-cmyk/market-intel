#!/bin/bash
# עיניים — install the LaunchAgent so the local helper starts (idle) at login.
# It only listens on 127.0.0.1:8770 and captures nothing until "התחל עיניים" is pressed.
# Remove with uninstall_autostart.command.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
EYES_DIR="$(cd "$HERE/.." && pwd)"
LABEL="com.htt.eyes"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/.local/share/htt-eyes"
mkdir -p "$DATA/logs" "$DATA/tmp" "$HOME/Library/LaunchAgents"
cd "$EYES_DIR" || exit 1
for t in ocr winlist; do
  if [ ! -x "./$t" ] || [ "./$t.swift" -nt "./$t" ]; then
    echo "בונה $t ..."
    swiftc -O "$t.swift" -o "$t" || { echo "הבנייה של $t נכשלה (צריך Xcode Command Line Tools)"; read -r -p "Enter לסגירה"; exit 1; }
  fi
done
# escape for sed (paths may contain & or |)
esc() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }
sed -e "s|__EYES_DIR__|$(esc "$EYES_DIR")|g" -e "s|__HOME__|$(esc "$HOME")|g" \
  "$HERE/$LABEL.plist.template" > "$DEST" || exit 1
plutil -lint "$DEST" >/dev/null || { echo "קובץ ההגדרה לא תקין"; exit 1; }
# a server started by start.command would hold the port; stop it so launchd owns it
pkill -f "eyes_server.py --port 8770" 2>/dev/null
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$UID" "$DEST" || { echo "launchctl bootstrap נכשל"; read -r -p "Enter לסגירה"; exit 1; }
sleep 1
if curl -s -m 2 "http://127.0.0.1:8770/state" >/dev/null 2>&1; then
  echo "הותקן. העוזר המקומי רץ ברקע (כבוי עד שלוחצים התחל עיניים) ויעלה לבד בכל כניסה למחשב."
else
  echo "הותקן, אבל השרת עוד לא עונה. יומן: $DATA/server.log"
fi
read -r -p "Enter לסגירה"
