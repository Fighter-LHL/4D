"""Synthetic executable fixtures test build evidence, never Unity or gameplay."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "build-macos.sh"
FAKE_UNITY = r'''#!/usr/bin/env python3
from datetime import datetime, timezone
import json, os, plistlib, re, sys
from pathlib import Path

args = sys.argv[1:]
def argument(name): return args[args.index(name) + 1]
assert argument('-executeMethod') == 'WSlice.Editor.WSliceBuildPlayer.BuildMacOS'
assert '-quit' in args and '-batchmode' in args
project = Path(argument('-projectPath'))
output = Path(os.environ['WSLICE_BUILD_OUTPUT'])
mode = os.environ.get('FAKE_BUILD_MODE', 'pass')
with Path(os.environ['FAKE_BUILD_CALLS']).open('a') as calls:
    calls.write('Synthetic fixture invocation, not Unity.\n')
if mode != 'missing_log':
    Path(argument('-logFile')).write_text('Synthetic build log; no Unity build was performed.\n')
print('Synthetic fixture stdout; no actual Unity invocation.')
if mode == 'exit_failure': sys.exit(23)
if mode != 'missing_app':
    (output / 'Contents/MacOS').mkdir(parents=True)
    info = dict(CFBundleShortVersionString='0.4.0', CFBundleExecutable='fixture')
    if mode == 'wrong_bundle_version': info['CFBundleShortVersionString'] = '0.3.0'
    if mode == 'bad_plist':
        (output / 'Contents/Info.plist').write_text('not a plist')
    else:
        with (output / 'Contents/Info.plist').open('wb') as target: plistlib.dump(info, target)
    if mode != 'missing_binary':
        executable = output / 'Contents/MacOS/fixture'
        executable.write_bytes(b'#!/bin/sh\n# Synthetic artifact, not a macOS Unity player.\n')
        executable.chmod(0o755 if mode != 'nonexecutable_binary' else 0o644)
timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f') + '0Z'
manifest = dict(version='0.4.0', productName='W-Slice Demo', unityVersion='6000.0.77f1',
                buildTimeUtc=timestamp, outputPath=str(output),
                enabledScenes=['Assets/LevelSelect.unity', 'Assets/CourtyardSlice.unity'])
overrides = {
    'wrong_version': dict(version='0.3.0'),
    'wrong_unity': dict(unityVersion='6000.0.76f1'),
    'wrong_product': dict(productName='A different game'),
    'wrong_scenes': dict(enabledScenes=['Assets/LevelSelect.unity']),
    'wrong_output': dict(outputPath='/tmp/an-old-build.app'),
    'stale_manifest': dict(buildTimeUtc='2020-01-01T00:00:00.0000000Z'),
    'missing_timestamp': dict(buildTimeUtc=None)
}
manifest.update(overrides.get(mode, {}))
if mode != 'missing_manifest':
    path = output.parent / 'build-info.json'
    path.write_text('{' if mode == 'malformed_manifest' else json.dumps(manifest))
    if mode == 'stale_mtime': os.utime(path, (1, 1))
if mode == 'source_changed':
    (project / 'Assets/source.txt').write_text('changed while building')
'''


class MacOSBuildScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "Repo with spaces"
        self.project = self.repo / "WSliceProto"
        settings = self.project / "ProjectSettings"
        settings.mkdir(parents=True)
        (settings / "ProjectVersion.txt").write_text("m_EditorVersion: 6000.0.77f1\n")
        (settings / "ProjectSettings.asset").write_text("  productName: W-Slice Demo\n  bundleVersion: 0.4.0\n")
        (settings / "EditorBuildSettings.asset").write_text(
            "  m_Scenes:\n  - enabled: 1\n    path: Assets/LevelSelect.unity\n"
            "  - enabled: 0\n    path: Assets/Unused.unity\n"
            "  - enabled: 1\n    path: Assets/CourtyardSlice.unity\n")
        (self.project / "Assets").mkdir()
        (self.project / "Assets/source.txt").write_text("frozen fixture source")
        (self.project / ".gitignore").write_text("builds/\n")
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        subprocess.run(["git", "-C", str(self.repo), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.repo), "-c", "user.name=Build fixture",
                        "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
                        "commit", "-qm", "Synthetic build fixture"], check=True)
        self.revision = subprocess.check_output(["git", "-C", str(self.repo), "rev-parse", "HEAD"], text=True).strip()
        self.unity = self.root / "fake-unity"
        self.unity.write_text(FAKE_UNITY)
        self.unity.chmod(0o755)
        self.calls = self.root / "calls.txt"
        self.env = dict(os.environ, UNITY_PATH=str(self.unity), PROJECT_PATH=str(self.project),
                        PYTHON_PATH=sys.executable, FAKE_BUILD_CALLS=str(self.calls))
        self.env.pop("WSLICE_BUILD_OUTPUT", None)

    def run_script(self, **extra):
        return subprocess.run(["bash", str(SCRIPT)], env=dict(self.env, **extra), capture_output=True, text=True)

    def runs(self):
        return list((self.project / "builds/macos").glob("run-*"))

    def test_each_invocation_produces_fresh_evidence_and_artifact_identity(self):
        for _ in range(2):
            outcome = self.run_script()
            self.assertEqual(outcome.returncode, 0, outcome.stdout + outcome.stderr)
            self.assertIn("Application startup/playthrough: NOT RUN", outcome.stdout)
        self.assertEqual(len(self.runs()), 2)
        for run in self.runs():
            invocation = json.loads((run / "build-invocation.json").read_text())
            receipt = json.loads((run / "build-result.json").read_text())
            self.assertEqual(invocation["revision"], self.revision)
            self.assertFalse(invocation["workingTreeDirty"])
            self.assertEqual(receipt["status"], "passed")
            self.assertEqual(receipt["applicationSmoke"], "not_run")
            for field in ("artifactSha256", "manifestSha256", "executableSha256"):
                self.assertEqual(len(receipt[field]), 64)
            self.assertIn("Synthetic", (run / "build.log").read_text())
            self.assertIn("Synthetic", (run / "unity-console.log").read_text())

    def test_record_dirty_source_without_claiming_clean_commit(self):
        (self.project / "Assets/source.txt").write_text("intentional uncommitted fixture")
        outcome = self.run_script()
        self.assertEqual(outcome.returncode, 0, outcome.stderr)
        invocation = json.loads((self.runs()[0] / "build-invocation.json").read_text())
        self.assertTrue(invocation["workingTreeDirty"])
        self.assertIn("Assets/source.txt", invocation["workingTreeStatus"])
        self.assertEqual(invocation["revision"], self.revision)

    def test_existing_app_or_manifest_is_never_reused_or_overwritten(self):
        for existing_name in ("Existing.app", "build-info.json", "build-result.json", "build.log"):
            with self.subTest(existing_name=existing_name):
                parent = self.root / existing_name.replace(".", "-")
                parent.mkdir()
                existing = parent / existing_name
                existing.write_text("keep original")
                outcome = self.run_script(WSLICE_BUILD_OUTPUT=str(parent / "Existing.app"))
                self.assertNotEqual(outcome.returncode, 0)
                self.assertIn("Refusing existing", outcome.stderr)
                self.assertEqual(existing.read_text(), "keep original")
        self.assertFalse(self.calls.exists())

    def test_custom_fresh_path_with_spaces_is_accepted(self):
        output = self.root / "Fresh build" / "New demo.app"
        outcome = self.run_script(WSLICE_BUILD_OUTPUT=str(output))
        self.assertEqual(outcome.returncode, 0, outcome.stderr)
        receipt = json.loads((output.parent / "build-result.json").read_text())
        self.assertEqual(receipt["outputPath"], str(output.resolve()))

    def test_zero_exit_with_missing_stale_or_mismatched_artifacts_is_rejected(self):
        modes = (
            "missing_log", "missing_manifest", "malformed_manifest", "stale_manifest", "stale_mtime",
            "missing_timestamp", "wrong_version", "wrong_unity", "wrong_product", "wrong_scenes",
            "wrong_output", "missing_app", "bad_plist", "wrong_bundle_version", "missing_binary",
            "nonexecutable_binary", "source_changed"
        )
        for mode in modes:
            with self.subTest(mode=mode):
                # The source-change fixture must not contaminate subsequent subtests.
                (self.project / "Assets/source.txt").write_text("frozen fixture source")
                before = set(self.runs())
                outcome = self.run_script(FAKE_BUILD_MODE=mode)
                self.assertNotEqual(outcome.returncode, 0, outcome.stdout)
                self.assertNotIn("VERIFIED BUILD", outcome.stdout)
                self.assertIn("FAIL / UNCONFIRMED", outcome.stderr)
                run = (set(self.runs()) - before).pop()
                receipt = json.loads((run / "build-result.json").read_text())
                self.assertEqual(receipt["status"], "failed")
                self.assertEqual(receipt["applicationSmoke"], "not_run")
                self.assertTrue(receipt["error"])

    def test_nonzero_unity_exit_preserves_logs_and_failure_status(self):
        outcome = self.run_script(FAKE_BUILD_MODE="exit_failure")
        self.assertNotEqual(outcome.returncode, 0)
        receipt = json.loads((self.runs()[0] / "build-result.json").read_text())
        self.assertEqual(receipt["unityExitCode"], 23)
        self.assertEqual(receipt["status"], "failed")
        self.assertTrue((self.runs()[0] / "build.log").is_file())

    def test_missing_unity_does_not_claim_execution(self):
        outcome = self.run_script(UNITY_PATH=str(self.root / "not-installed"))
        self.assertNotEqual(outcome.returncode, 0)
        self.assertIn("NOT RUN", outcome.stderr)
        self.assertFalse(self.calls.exists())
        self.assertEqual(self.runs(), [])

    def test_non_app_output_is_rejected_before_invoking_unity(self):
        outcome = self.run_script(WSLICE_BUILD_OUTPUT=str(self.root / "artifact"))
        self.assertNotEqual(outcome.returncode, 0)
        self.assertIn("new .app bundle", outcome.stderr)
        self.assertFalse(self.calls.exists())


if __name__ == "__main__":
    unittest.main()
