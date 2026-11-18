#!/bin/bash
# מסיר את "HTT Eyes.app". הקוד בתיקיית tools/eyes והיומנים נשארים.
APP="$HOME/Applications/HTT Eyes.app"
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
pkill -f "HTT Eyes.app/Contents/MacOS/htt-eyes" 2>/dev/null
"$LSREG" -u "$APP" 2>/dev/null
rm -rf "$APP"
echo "הוסר: $APP"
