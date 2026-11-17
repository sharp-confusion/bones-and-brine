#!/usr/bin/env bash
# Builds the CrazyGames upload: builds/bones-and-brine-crazygames.zip (index.html at the zip root).
# Run from the project folder in Git Bash:  bash tools/build-crazygames.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=builds/crazygames; zip=builds/bones-and-brine-crazygames.zip
rm -rf "$out" "$zip"; mkdir -p "$out/models"
cp -r index.html css js icons icon.svg "$out/"
cp models/pirates.js "$out/models/"            # the embedded model; the .glb isn't needed
printf "/* CrazyGames build */\nwindow.BNB_PLATFORM = 'crazygames';\n" > "$out/js/platform.js"
# no install-as-app on the portal
sed -i '/rel="manifest"/d' "$out/index.html"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/zip-forward.ps1 -Src "$out" -Dest "$zip"
echo "Built $zip ($(du -h "$zip" | cut -f1))"
