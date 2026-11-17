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
# CrazyGames SDK + bridge, loaded before the game scripts
sed -i 's|<script src="js/platform.js"></script>|<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n<script src="js/platform.js"></script>\n<script src="js/crazy.js"></script>|' "$out/index.html"
# no install-as-app on the portal
sed -i '/rel="manifest"/d' "$out/index.html"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/zip-forward.ps1 -Src "$out" -Dest "$zip"
echo "Built $zip ($(du -h "$zip" | cut -f1))"
