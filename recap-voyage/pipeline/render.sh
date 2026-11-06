#!/usr/bin/env bash
# Rendu vidéo. Usage : pipeline/render.sh <voyage> [reel|16x9]   (depuis recap-voyage/)
# reel : 1080x1920, 30 i/s, ~75 s  |  16x9 : 1920x1080, 24 i/s, ~3 min 15
# Reprend là où il s'est arrêté (les images déjà calculées sont conservées).
set -euo pipefail
TRIP=${1:-palma-2026-11}; FMT=${2:-reel}; W=work/$TRIP; J=${JOBS:-3}
if [ "$FMT" = reel ]; then PAGE=$W/capture_reel.html; ARGS="540 960 2 30"; FPS=30; OUT=$W/recap-reel.mp4
else PAGE=$W/capture.html; ARGS="1920 1080 1 24"; FPS=24; OUT=$W/recap-16x9.mp4; fi
FR=$W/frames-$FMT
for i in $(seq 0 $((J-1))); do node pipeline/render.js "$PAGE" "$FR" $ARGS "$i" "$J" & done; wait
ffmpeg -y -v error -framerate $FPS -i "$FR/f%05d.jpg" -c:v libx264 -profile:v high -pix_fmt yuv420p -b:v 9M -maxrate 12M -bufsize 18M -preset slow -movflags +faststart "$OUT"
echo "vidéo : $OUT"
