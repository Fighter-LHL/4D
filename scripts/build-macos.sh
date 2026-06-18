#!/usr/bin/env bash
# Build a macOS standalone player for WSliceProto.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${PROJECT_PATH:-$ROOT/WSliceProto}"
UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity}"
OUTPUT="${WSLICE_BUILD_OUTPUT:-$PROJECT/builds/macos/W-Slice.app}"

usage() {
  cat <<'EOF'
Usage: build-macos.sh [OPTIONS]

Builds a macOS standalone player from enabled EditorBuildSettings scenes.

Options:
  -h, --help    Show this help

Environment:
  UNITY_PATH           Path to Unity executable
  PROJECT_PATH         Path to WSliceProto (default: <repo>/WSliceProto)
  WSLICE_BUILD_OUTPUT  Output .app path (default: <WSliceProto>/builds/macos/W-Slice.app)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -x "$UNITY" ]]; then
  echo "ERROR: Unity not found at: $UNITY" >&2
  exit 1
fi

if [[ ! -f "$PROJECT/ProjectSettings/ProjectVersion.txt" ]]; then
  echo "ERROR: Not a Unity project: $PROJECT" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

echo "W-Slice build-macos"
echo "  Project: $PROJECT"
echo "  Unity:   $UNITY"
echo "  Output:  $OUTPUT"
echo ""

export WSLICE_BUILD_OUTPUT="$OUTPUT"

"$UNITY" \
  -projectPath "$PROJECT" \
  -executeMethod WSlice.Editor.WSliceBuildPlayer.BuildMacOS \
  -quit -batchmode -nographics \
  -logFile -

if [[ -d "$OUTPUT" ]]; then
  echo ""
  echo "OK: Built $OUTPUT"
  echo "Run: open \"$OUTPUT\""
else
  echo "ERROR: Build output not found at $OUTPUT" >&2
  exit 1
fi
