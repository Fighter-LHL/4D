#!/usr/bin/env bash
# Local validation for WSliceProto (L0 compile + L1 Garden validate; optional L2/L3 tests).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${PROJECT_PATH:-$ROOT/WSliceProto}"
UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity}"
RUN_TESTS=false

usage() {
  cat <<'EOF'
Usage: validate-local.sh [OPTIONS]

Runs W-Slice local validation from the repository root.

Options:
  --tests    Also run EditMode and PlayMode batchmode tests (requires Unity license)
  -h, --help Show this help

Environment:
  UNITY_PATH    Path to Unity executable
  PROJECT_PATH  Path to WSliceProto (default: <repo>/WSliceProto)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tests) RUN_TESTS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -x "$UNITY" ]]; then
  echo "ERROR: Unity not found at: $UNITY" >&2
  echo "Set UNITY_PATH to your Unity 6000.0.77f1 executable." >&2
  exit 1
fi

if [[ ! -f "$PROJECT/ProjectSettings/ProjectVersion.txt" ]]; then
  echo "ERROR: Not a Unity project: $PROJECT" >&2
  exit 1
fi

run_unity() {
  local label="$1"
  shift
  echo ""
  echo "=== $label ==="
  if "$UNITY" -projectPath "$PROJECT" "$@" -logFile -; then
    echo "OK: $label"
    return 0
  else
    echo "FAIL: $label (exit $?)" >&2
    return 1
  fi
}

mkdir -p "$PROJECT/TestResults"

echo "W-Slice validate-local"
echo "  Project: $PROJECT"
echo "  Unity:   $UNITY"

run_unity "L0 Compile" -quit -batchmode -nographics

run_unity "L1 Validate Garden Graybox" \
  -executeMethod WSlice.Editor.GardenGrayboxGenerator.Validate \
  -quit -batchmode -nographics

run_unity "L1 Validate Platform Graybox" \
  -executeMethod WSlice.Editor.PlatformGrayboxGenerator.Validate \
  -quit -batchmode -nographics

run_unity "L1 Validate Gate Graybox" \
  -executeMethod WSlice.Editor.GateGrayboxGenerator.Validate \
  -quit -batchmode -nographics

if [[ "$RUN_TESTS" == true ]]; then
  run_unity "L2 EditMode tests" \
    -runTests -testPlatform EditMode \
    -testResults "$PROJECT/TestResults/editmode-results.xml" \
    -quit -batchmode -nographics

  if [[ -f "$PROJECT/TestResults/editmode-results.xml" ]]; then
    echo "  XML: TestResults/editmode-results.xml"
  else
    echo "WARN: EditMode XML not produced — run tests in Unity Editor Test Runner." >&2
  fi

  run_unity "L3 PlayMode tests" \
    -runTests -testPlatform PlayMode \
    -testResults "$PROJECT/TestResults/playmode-results.xml" \
    -quit -batchmode -nographics

  if [[ -f "$PROJECT/TestResults/playmode-results.xml" ]]; then
    echo "  XML: TestResults/playmode-results.xml"
  else
    echo "WARN: PlayMode XML not produced — run tests in Unity Editor Test Runner." >&2
  fi
else
  echo ""
  echo "Skipped L2/L3 (pass --tests to enable batchmode test run)."
fi

echo ""
echo "Done. For manual smoke, see WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md"
