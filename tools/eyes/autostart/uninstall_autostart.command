#!/bin/bash
# עיניים — remove the LaunchAgent and stop the helper. Logs in ~/.local/share/htt-eyes stay.
LABEL="com.htt.eyes"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null
rm -f "$DEST"
pkill -f eyes_server.py 2>/dev/null
echo "ההפעלה האוטומטית הוסרה והעוזר נעצר."
read -r -p "Enter לסגירה"
