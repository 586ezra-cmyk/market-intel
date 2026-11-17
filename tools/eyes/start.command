#!/bin/bash
# עיניים — double-click to start. Builds the Swift helpers if missing, starts the local
# server (127.0.0.1:8770 only) if not running, and opens the page.
cd "$(dirname "$0")" || exit 1
PORT=8770
DATA="$HOME/.local/share/htt-eyes"
mkdir -p "$DATA/logs" "$DATA/tmp"
for t in ocr winlist; do
  if [ ! -x "./$t" ] || [ "./$t.swift" -nt "./$t" ]; then
    echo "בונה $t ..."
    swiftc -O "$t.swift" -o "$t" || { echo "הבנייה של $t נכשלה (צריך Xcode Command Line Tools)"; read -r -p "Enter לסגירה"; exit 1; }
  fi
done
if curl -s -m 2 "http://127.0.0.1:$PORT/state" >/dev/null 2>&1; then
  echo "השרת כבר רץ."
else
  echo "מפעיל את השרת ..."
  nohup /usr/bin/python3 eyes_server.py --port "$PORT" >>"$DATA/server.log" 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.5
    curl -s -m 1 "http://127.0.0.1:$PORT/state" >/dev/null 2>&1 && break
  done
fi
open "http://127.0.0.1:$PORT/"
