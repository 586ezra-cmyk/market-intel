#!/bin/bash
# מתקין את "HTT Eyes.app" בתיקיית ~/Applications של המשתמש (לא נוגע במערכת).
# אחרי ההתקנה, כפתור "התחל עיניים" באתר פותח את העוזר, ו"עצור" סוגר אותו לגמרי.
# הסרה: uninstall_app.command
set -e
cd "$(dirname "$0")"
EYES_DIR="$(cd .. && pwd)"
APP="$HOME/Applications/HTT Eyes.app"
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
for t in ocr winlist; do
  if [ ! -x "$EYES_DIR/$t" ] || [ "$EYES_DIR/$t.swift" -nt "$EYES_DIR/$t" ]; then
    swiftc -O "$EYES_DIR/$t.swift" -o "$EYES_DIR/$t"
  fi
done
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/Info.plist"
swiftc -O launcher.swift -o "$APP/Contents/MacOS/htt-eyes"
printf '%s\n' "$EYES_DIR" > "$APP/Contents/Resources/eyes_dir.txt"
codesign --force -s - "$APP"
"$LSREG" -f "$APP"
echo "הותקן: $APP"
