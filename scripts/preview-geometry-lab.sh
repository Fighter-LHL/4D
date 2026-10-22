#!/usr/bin/env bash
# Serve the isolated browser geometry experiment; no Unity or npm packages needed.
set -euo pipefail

LAB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB_PORT="${LAB_PORT:-4175}"

if [[ ! "$LAB_PORT" =~ ^[1-9][0-9]{3,4}$ ]] || (( LAB_PORT < 1024 || LAB_PORT > 65535 )); then
  echo "ERROR: LAB_PORT must be a port number between 1024 and 65535." >&2
  exit 1
fi

echo "W-Slice Geometry Lab: http://127.0.0.1:$LAB_PORT"
echo "Stop with Ctrl+C. This serves only web/geometry-lab on the local machine."
exec python3 "$LAB_ROOT/scripts/serve-geometry-lab.py" "$LAB_PORT" "$LAB_ROOT/web/geometry-lab"
