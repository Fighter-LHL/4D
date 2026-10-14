#!/usr/bin/env bash
# Local validation for WSliceProto (L0 compile + five graybox/catalog L1 checks; optional L2/L3 tests).
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

verify_test_result() {
  local label="$1"
  local result_path="$2"

  if [[ ! -s "$result_path" ]]; then
    echo "FAIL: $label did not produce a fresh XML result: $result_path" >&2
    return 1
  fi

  local result
  local failed
  local total
  local passed
  result="$(xmllint --xpath 'string(/test-run/@result)' "$result_path" 2>/dev/null || true)"
  failed="$(xmllint --xpath 'string(/test-run/@failed)' "$result_path" 2>/dev/null || true)"
  total="$(xmllint --xpath 'string(/test-run/@total)' "$result_path" 2>/dev/null || true)"
  passed="$(xmllint --xpath 'string(/test-run/@passed)' "$result_path" 2>/dev/null || true)"
  if [[ "$result" != "Passed"
        || "$failed" != "0"
        || ! "$total" =~ ^[1-9][0-9]*$
        || "$passed" != "$total" ]]; then
    echo "FAIL: $label XML reports result=${result:-missing}, total=${total:-missing}, passed=${passed:-missing}, failed=${failed:-missing}" >&2
    return 1
  fi

  echo "  XML: ${result_path#"$PROJECT/"} (Passed, $passed/$total, failed=0)"
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

run_unity "L1 Validate Chambers Graybox" \
  -executeMethod WSlice.Editor.ChambersGrayboxGenerator.Validate \
  -quit -batchmode -nographics

run_unity "L1 Validate Hazard Graybox" \
  -executeMethod WSlice.Editor.HazardGrayboxGenerator.Validate \
  -quit -batchmode -nographics

run_unity "L1 Validate Level Catalog" \
  -executeMethod WSlice.Editor.LevelCatalogValidatorRunner.Validate \
  -quit -batchmode -nographics

if [[ "$RUN_TESTS" == true ]]; then
  if ! command -v xmllint >/dev/null 2>&1; then
    echo "ERROR: xmllint is required to validate Unity test results." >&2
    exit 1
  fi

  TEST_RUN_DIR="$(mktemp -d "$PROJECT/TestResults/run.XXXXXX")"
  EDITMODE_RESULT="$TEST_RUN_DIR/editmode-results.xml"
  PLAYMODE_RESULT="$TEST_RUN_DIR/playmode-results.xml"
  echo "  Test run: ${TEST_RUN_DIR#"$PROJECT/"}"

  run_unity "L2 EditMode tests" \
    -runTests -testPlatform EditMode \
    -testResults "$EDITMODE_RESULT" \
    -batchmode -nographics
  verify_test_result \
    "L2 EditMode tests" \
    "$EDITMODE_RESULT"

  run_unity "L3 PlayMode tests" \
    -runTests -testPlatform PlayMode \
    -testResults "$PLAYMODE_RESULT" \
    -batchmode -nographics
  verify_test_result \
    "L3 PlayMode tests" \
    "$PLAYMODE_RESULT"
else
  echo ""
  echo "Skipped L2/L3 (pass --tests to enable batchmode test run)."
fi

echo ""
echo "Done. For manual smoke, see WSliceProto/Assets/_Project/Tests/PlayModeSmokeTest.md"
