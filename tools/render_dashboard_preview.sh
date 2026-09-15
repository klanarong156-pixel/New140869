#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="/tmp/dashboard-preview"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -a "$ROOT"/. "$OUT"/
python3 - "$OUT/index.html" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
s=s.replace('data-auth-required="true"', '')
s=s.replace('<script src="access.js?v=10"></script>', '')
p.write_text(s)
PY
python3 -m http.server 4181 --bind 127.0.0.1 --directory "$OUT" >/tmp/dashboard-preview-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1
mkdir -p /tmp/dashboard-preview-shots
for spec in 375x812 430x932 768x1024; do
  chromium --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size="${spec%x*}x${spec#*x}" --virtual-time-budget=3500 --screenshot="/tmp/dashboard-preview-shots/${spec}.png" "http://127.0.0.1:4181/index.html" >/dev/null 2>&1
done
ls -lh /tmp/dashboard-preview-shots/*.png
