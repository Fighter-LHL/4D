#!/usr/bin/env bash
# Build and verify a fresh macOS artifact; application smoke is a separate step.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${PROJECT_PATH:-$ROOT/WSliceProto}"
UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.0.77f1/Unity.app/Contents/MacOS/Unity}"
PYTHON="${PYTHON_PATH:-python3}"

usage() {
  cat <<'USAGE'
Usage: build-macos.sh [--help]

Builds enabled EditorBuildSettings scenes and verifies a fresh macOS artifact.
Default output: <project>/builds/macos/run-<UTC timestamp>-<unique suffix>/W-Slice.app
Existing app/manifest/evidence paths are refused, never replaced.

Environment:
  UNITY_PATH           Unity executable (must match ProjectVersion.txt)
  PROJECT_PATH         Unity project (default: <repo>/WSliceProto)
  PYTHON_PATH          Python 3 executable (default: python3)
  WSLICE_BUILD_OUTPUT  Optional new .app path; its evidence names must be unused

The app directory also contains build.log, unity-console.log, build-info.json,
build-invocation.json and build-result.json. Startup/playthrough is NOT RUN here.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

command -v "$PYTHON" >/dev/null
exec "$PYTHON" - "$PROJECT" "$UNITY" "${WSLICE_BUILD_OUTPUT:-}" <<'PY'
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile
import time


class BuildEvidenceError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise BuildEvidenceError(message)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def git(repository, *arguments):
    return subprocess.check_output(['git', '-C', str(repository), *arguments], stderr=subprocess.PIPE)


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def tree_hash(paths, root):
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda value: str(value)):
        relative = str(path.relative_to(root))
        if path.is_symlink():
            value = 'symlink:' + os.readlink(path)
        elif path.is_file():
            value = str(path.stat().st_mode & 0o777) + ':' + file_hash(path)
        else:
            value = 'missing'
        digest.update(os.fsencode(relative) + b'\0' + value.encode() + b'\0')
    return digest.hexdigest()


def source_state(repository):
    paths = set(git(repository, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0'))
    paths.discard(b'')
    status = git(repository, 'status', '--porcelain=v1').decode(errors='replace')
    return {
        'revision': git(repository, 'rev-parse', 'HEAD').decode().strip(),
        'workingTreeDirty': bool(status.strip()),
        'workingTreeStatus': status,
        'sourceSha256': tree_hash([repository / os.fsdecode(path) for path in paths], repository)
    }


def setting(path, key):
    match = re.search(r'^\s*' + re.escape(key) + r':\s*(\S[^\r\n]*)$', path.read_text(), re.MULTILINE)
    require(match is not None, f'Missing {key}: {path}')
    return match.group(1).strip().strip('"')


def enabled_scenes(path):
    entries = re.findall(r'^\s*- enabled:\s*([01])\s*\n\s*path:\s*([^\r\n]+)', path.read_text(), re.MULTILINE)
    scenes = [scene.strip() for enabled, scene in entries if enabled == '1']
    require(scenes, f'No enabled build scenes: {path}')
    return scenes


invocation_path = None
owned_evidence = False
result = {'schemaVersion': 1, 'status': 'failed', 'applicationSmoke': 'not_run'}
try:
    project = Path(sys.argv[1]).expanduser().resolve()
    unity = Path(sys.argv[2]).expanduser().resolve()
    require(unity.is_file() and os.access(unity, os.X_OK), f'NOT RUN: Unity executable unavailable: {unity}')
    require((project / 'ProjectSettings/ProjectVersion.txt').is_file(), f'Not a Unity project: {project}')
    repository = Path(git(project, 'rev-parse', '--show-toplevel').decode().strip()).resolve()
    expected = {
        'unityVersion': setting(project / 'ProjectSettings/ProjectVersion.txt', 'm_EditorVersion'),
        'version': setting(project / 'ProjectSettings/ProjectSettings.asset', 'bundleVersion'),
        'productName': setting(project / 'ProjectSettings/ProjectSettings.asset', 'productName'),
        'enabledScenes': enabled_scenes(project / 'ProjectSettings/EditorBuildSettings.asset')
    }
    before = source_state(repository)
    if sys.argv[3]:
        output = Path(os.path.abspath(os.path.expanduser(sys.argv[3])))
        require(output.suffix == '.app', 'WSLICE_BUILD_OUTPUT must name a new .app bundle.')
        evidence = output.parent.resolve()
        output = evidence / output.name
    else:
        parent = project / 'builds/macos'
        parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        evidence = Path(tempfile.mkdtemp(prefix=f'run-{stamp}-', dir=parent))
        output = evidence / 'W-Slice.app'
    names = ['build-info.json', 'build-invocation.json', 'build-result.json', 'build.log', 'unity-console.log']
    for path in [output] + [evidence / name for name in names]:
        require(not os.path.lexists(path), f'Refusing existing output/evidence: {path}; choose a new output directory.')
    evidence.mkdir(parents=True, exist_ok=True)
    invocation_path = evidence / 'build-invocation.json'
    started = time.time()
    invocation = dict(before, schemaVersion=1, startedUtc=utc_now(), startedUnix=started,
                      repository=str(repository), projectPath=str(project), outputPath=str(output),
                      unityExecutable=str(unity), expected=expected)
    with invocation_path.open('x') as target:
        json.dump(invocation, target, indent=2)
    owned_evidence = True
    result.update(revision=before['revision'], sourceSha256=before['sourceSha256'], outputPath=str(output))
    print(f'RUNNING macOS build; evidence: {evidence}', flush=True)
    print(f'Source: {before["revision"]}; dirty={before["workingTreeDirty"]}', flush=True)
    environment = dict(os.environ, WSLICE_BUILD_OUTPUT=str(output))
    with (evidence / 'unity-console.log').open('w') as console:
        completed = subprocess.run([
            str(unity), '-projectPath', str(project),
            '-executeMethod', 'WSlice.Editor.WSliceBuildPlayer.BuildMacOS',
            '-quit', '-batchmode', '-nographics', '-logFile', str(evidence / 'build.log')
        ], env=environment, stdout=console, stderr=subprocess.STDOUT)
    result['unityExitCode'] = completed.returncode
    require(completed.returncode == 0, f'Unity build failed (exit {completed.returncode}); inspect saved logs.')
    log = evidence / 'build.log'
    require(log.is_file() and log.stat().st_size > 0, 'Unity build log missing or empty.')
    manifest_path = evidence / 'build-info.json'
    require(manifest_path.is_file(), 'Missing build-info.json; process exit 0 is not build evidence.')
    require(manifest_path.stat().st_mtime >= started, 'Stale build-info.json file.')
    manifest = json.loads(manifest_path.read_text())
    require(isinstance(manifest, dict), 'Build manifest must be an object.')
    for key, value in expected.items():
        require(manifest.get(key) == value, f'Build manifest {key} mismatch: expected {value!r}.')
    require(manifest.get('outputPath') == str(output), 'Build manifest outputPath mismatch.')
    timestamp = manifest.get('buildTimeUtc')
    require(isinstance(timestamp, str), 'Missing build manifest timestamp.')
    # .NET round-trip timestamps contain seven fractional digits; Python 3.9
    # accepts at most six. Preserve the timestamp while trimming excess precision.
    timestamp = re.sub(r'(\.\d{6})\d+(?=Z|[+-]\d{2}:\d{2}$)', r'\1', timestamp)
    finished = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    require(finished.tzinfo is not None and started <= finished.timestamp() <= time.time() + 5,
            'Build manifest timestamp does not belong to this run.')
    require(output.is_dir() and not output.is_symlink(), 'Fresh .app bundle is missing or is a symlink.')
    plist_path = output / 'Contents/Info.plist'
    with plist_path.open('rb') as source:
        info = plistlib.load(source)
    require(isinstance(info, dict), 'App Info.plist must be a dictionary.')
    require(info.get('CFBundleShortVersionString') == expected['version'], 'App Info.plist version mismatch.')
    executable_name = info.get('CFBundleExecutable')
    require(isinstance(executable_name, str) and executable_name not in {'', '.', '..'}
            and Path(executable_name).name == executable_name, 'Invalid app executable name in Info.plist.')
    executable = output / 'Contents/MacOS' / executable_name
    require(executable.is_file() and executable.stat().st_size > 0 and os.access(executable, os.X_OK),
            'App executable missing, empty or not executable.')
    after = source_state(repository)
    result['sourceAfterBuild'] = after
    require(after == before, 'Source changed during the build; review changes and rebuild from a fixed snapshot.')
    result.update(status='passed', finishedUtc=utc_now(),
                  artifactSha256=tree_hash([path for path in output.rglob('*') if path.is_file() or path.is_symlink()], output),
                  manifestSha256=file_hash(manifest_path), executableSha256=file_hash(executable))
except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
    result.update(error=str(error), finishedUtc=utc_now())
    print(f'FAIL / UNCONFIRMED: {error}', file=sys.stderr)
    if owned_evidence:
        print(f'Evidence retained: {invocation_path.parent}', file=sys.stderr)
finally:
    if owned_evidence:
        (invocation_path.parent / 'build-result.json').write_text(json.dumps(result, indent=2))
if result['status'] == 'passed':
    print(f'VERIFIED BUILD ARTIFACT ONLY: {output}', flush=True)
    print('Application startup/playthrough: NOT RUN. See build-result.json and saved logs.', flush=True)
sys.exit(0 if result['status'] == 'passed' else 1)
PY
