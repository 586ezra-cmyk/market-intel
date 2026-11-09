#!/bin/bash
# בניית תוסף Bookmap "HTT Order Flow Bridge" → dist/htt-orderflow-bridge.jar
# קומפיילר: javac אם מותקן, אחרת ecj.jar (Eclipse compiler, רץ על ה-JRE שמגיע עם Bookmap).
set -euo pipefail
cd "$(dirname "$0")"
BM_JAVA="/Applications/Bookmap.app/Contents/runtime/Contents/Home/bin/java"
API_JAR="/Applications/Bookmap.app/Contents/app/lib/bm-l1api.jar"
[ -f "$API_JAR" ] || { echo "bm-l1api.jar not found at $API_JAR"; exit 1; }
rm -rf out dist && mkdir -p out dist
if command -v javac >/dev/null 2>&1 && javac -version >/dev/null 2>&1; then
  echo "compiling with javac"
  javac --release 17 -cp "$API_JAR" -d out src/htt/*.java
elif [ -f ecj.jar ]; then
  echo "compiling with ecj"
  "$BM_JAVA" -jar ecj.jar -17 -cp "$API_JAR" -d out src/htt/*.java
else
  echo "no compiler: install a JDK or put ecj.jar (Eclipse compiler) here"; exit 1
fi
printf 'Manifest-Version: 1.0\nImplementation-Title: HTT Order Flow Bridge\n' > out/MANIFEST.MF
# ה-JRE של Bookmap בלי כלי jar → אורזים עם zip (jar = zip עם META-INF/MANIFEST.MF)
mkdir -p out/META-INF && mv out/MANIFEST.MF out/META-INF/MANIFEST.MF
( cd out && zip -q -r ../dist/htt-orderflow-bridge.jar META-INF htt )
echo "built: $(pwd)/dist/htt-orderflow-bridge.jar"
