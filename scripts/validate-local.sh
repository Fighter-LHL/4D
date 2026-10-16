#!/usr/bin/env bash
# Evidence-backed validation. Test Runner owns shutdown during -runTests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${PROJECT_PATH:-$ROOT/WSliceProto}"
UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity}"
PYTHON="${PYTHON_PATH:-python3}"
RUN_TESTS=false

usage() {
  cat <<'USAGE'
Usage: validate-local.sh [--tests]

Default: compile + validate all six levels and catalog, with a checked receipt.
--tests: also require fresh, complete EditMode and PlayMode NUnit XML.
Environment: UNITY_PATH, PROJECT_PATH, PYTHON_PATH (default python3).
Artifacts: <project>/TestResults/run-<UTC timestamp>-<unique suffix>/
Missing Unity/license/results is not a pass. No credentials are requested.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tests) RUN_TESTS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -x "$UNITY" ]]; then
  echo "NOT RUN: Unity executable unavailable: $UNITY" >&2
  echo "Set UNITY_PATH to an installed Unity 6000.0.77f1 executable." >&2
  exit 1
fi
if [[ ! -f "$PROJECT/ProjectSettings/ProjectVersion.txt" ]]; then
  echo "ERROR: Not a Unity project: $PROJECT" >&2
  exit 1
fi
command -v "$PYTHON" >/dev/null
PROJECT="$(cd "$PROJECT" && pwd)"
mkdir -p "$PROJECT/TestResults"
RESULTS="$(mktemp -d "$PROJECT/TestResults/run-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"

finish() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "FAIL / UNCONFIRMED: validation did not complete successfully (exit $status)." >&2
    echo "Evidence retained: $RESULTS" >&2
  fi
}
trap finish EXIT

"$PYTHON" - "$RESULTS/invocation.json" "$ROOT" "$RUN_TESTS" <<'PY'
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
revision = subprocess.run(['git', '-C', sys.argv[2], 'rev-parse', 'HEAD'], capture_output=True, text=True)
status = subprocess.run(['git', '-C', sys.argv[2], 'status', '--porcelain'], capture_output=True, text=True)
Path(sys.argv[1]).write_text(json.dumps({
    'startedUtc': datetime.now(timezone.utc).isoformat(),
    'revision': revision.stdout.strip(), 'workingTreeDirty': bool(status.stdout.strip()),
    'testsRequested': sys.argv[3] == 'true'
}, indent=2))
PY

echo "W-Slice evidence directory: $RESULTS"

run_unity() {
  local label="$1" log="$2"
  shift 2
  echo "RUNNING: $label"
  if "$UNITY" -projectPath "$PROJECT" "$@" -logFile "$log"; then
    return 0
  else
    local status=$?
    echo "FAIL: $label (Unity exit $status); log: $log" >&2
    return "$status"
  fi
}

# Reaching the entry point requires script compilation; its receipt proves all
# validators completed and no error logs were silently swallowed.
run_unity "L0 Compile + L1 validation" "$RESULTS/validation.log" \
  -executeMethod WSlice.Editor.WSliceValidationRunner.ValidateAll \
  -wsliceValidationReport "$RESULTS/validation.json" \
  -quit -batchmode -nographics
"$PYTHON" "$ROOT/scripts/verify_unity_results.py" "$RESULTS/validation.json" \
  --kind validation --started-after "$RESULTS/invocation.json"

if [[ "$RUN_TESTS" == true ]]; then
  for mode in EditMode PlayMode; do
    marker="$RESULTS/$mode.started"
    "$PYTHON" -c 'from pathlib import Path; import sys; Path(sys.argv[1]).touch()' "$marker"
    run_unity "$mode tests" "$RESULTS/$mode.log" \
      -runTests -testPlatform "$mode" -testResults "$RESULTS/$mode-results.xml" \
      -batchmode -nographics
    "$PYTHON" "$ROOT/scripts/verify_unity_results.py" "$RESULTS/$mode-results.xml" \
      --started-after "$marker"
  done
  echo "L0-L3 VERIFIED. Human smoke, five-player playtest, and build are NOT RUN by this script."
else
  echo "L2/L3 SKIPPED: pass --tests to require automated test evidence."
  echo "L0/L1 VERIFIED ONLY; this is not a full release verification."
fi
