import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone


SCRIPTS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify_unity_results", SCRIPTS / "verify_unity_results.py")
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.start = time.time()
        self.xml = self.root / "results.xml"
        self.now = datetime.now(timezone.utc).isoformat()

    def write_xml(self, cases=("Passed",), **overrides):
        attributes = dict(result="Passed", total=len(cases), testcasecount=len(cases),
                          passed=cases.count("Passed"), failed=cases.count("Failed"),
                          skipped=cases.count("Skipped"), inconclusive=cases.count("Inconclusive"))
        attributes.update({"start-time": self.now, "end-time": self.now})
        attributes.update(overrides)
        attrs = " ".join(f'{key}="{value}"' for key, value in attributes.items())
        self.xml.write_text(f'<test-run {attrs}><test-suite result="Passed">'
                            + "".join(f'<test-case name="case{i}" result="{result}"/>'
                                      for i, result in enumerate(cases))
                            + '</test-suite></test-run>')
        return self.xml

    def test_valid_report_counts_actual_cases(self):
        result = checker.verify_xml(self.write_xml(("Passed", "Passed", "Skipped")), self.start)
        self.assertEqual(result, dict(total=3, passed=2, failed=0, skipped=1, inconclusive=0))

    def test_empty_or_all_skipped_is_not_a_pass(self):
        for cases in ((), ("Skipped",)):
            with self.subTest(cases=cases), self.assertRaises(checker.EvidenceError):
                checker.verify_xml(self.write_xml(cases), self.start)

    def test_failed_inconclusive_unknown_or_unfinished_cases_rejected(self):
        for result in ("Failed", "Inconclusive", "Running", ""):
            with self.subTest(result=result), self.assertRaises(checker.EvidenceError):
                checker.verify_xml(self.write_xml(("Passed", result)), self.start)

    def test_root_cannot_claim_pass_with_inconsistent_counts(self):
        for overrides in ({"total": 2}, {"passed": 2}, {"failed": 1},
                          {"testcasecount": 2}, {"skipped": -1}, {"total": "invalid"}):
            with self.subTest(overrides=overrides), self.assertRaises(checker.EvidenceError):
                checker.verify_xml(self.write_xml(**overrides), self.start)

    def test_root_and_suite_must_complete(self):
        for state in ("Failed", "Inconclusive", "Skipped", "Running"):
            with self.subTest(state=state), self.assertRaises(checker.EvidenceError):
                checker.verify_xml(self.write_xml(result=state), self.start)
        self.write_xml()
        self.xml.write_text(self.xml.read_text().replace('test-suite result="Passed"', 'test-suite result="Failed"'))
        with self.assertRaises(checker.EvidenceError):
            checker.verify_xml(self.xml, self.start)

    def test_missing_and_malformed_xml_rejected(self):
        with self.assertRaises(checker.EvidenceError):
            checker.verify_xml(self.xml, self.start)
        self.xml.write_text("<test-run")
        with self.assertRaises(checker.EvidenceError):
            checker.verify_xml(self.xml, self.start)

    def test_missing_completion_time_rejected(self):
        self.write_xml()
        self.xml.write_text(self.xml.read_text().replace(f'end-time="{self.now}"', ""))
        with self.assertRaises(checker.EvidenceError):
            checker.verify_xml(self.xml, self.start)

    def test_stale_mtime_rejected(self):
        self.write_xml()
        os.utime(self.xml, (self.start - 60, self.start - 60))
        with self.assertRaises(checker.EvidenceError):
            checker.verify_xml(self.xml, self.start)

    def test_old_report_copied_now_still_rejected(self):
        old = "2020-01-01T00:00:00Z"
        self.write_xml(**{"start-time": old, "end-time": old})
        with self.assertRaises(checker.EvidenceError):
            checker.verify_xml(self.xml, self.start)

    def test_validation_requires_every_scope_and_no_errors(self):
        report = dict(schemaVersion=1, status="passed", startedUtc=self.now, finishedUtc=self.now,
                      errorCount=0, warningCount=0, validatedScopes=sorted(checker.VALIDATION_SCOPES))
        path = self.root / "validation.json"
        path.write_text(json.dumps(report))
        checker.verify_validation(path, self.start)
        for override in ({"errorCount": 1}, {"status": "failed"}, {"validatedScopes": ["Garden"]}):
            path.write_text(json.dumps(dict(report, **override)))
            with self.subTest(override=override), self.assertRaises(checker.EvidenceError):
                checker.verify_validation(path, self.start)

    def test_cli_rejects_empty_artifact_directory(self):
        marker = self.root / "started"
        marker.touch()
        result = subprocess.run([sys.executable, str(SCRIPTS / "verify_unity_results.py"),
                                 str(self.root), "--started-after", str(marker)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("VERIFIED", result.stdout)


# Synthetic subprocess fixtures exercise orchestration, not Unity or gameplay.
FAKE_UNITY = '''#!/usr/bin/env python3
import json, os, sys
from datetime import datetime, timezone
from pathlib import Path
args = sys.argv[1:]
def argument(name): return args[args.index(name) + 1]
now = datetime.now(timezone.utc).isoformat()
Path(argument('-logFile')).write_text('Synthetic orchestration fixture, not a Unity run.\\n')
if '-runTests' in args:
    if '-quit' in args: sys.exit(89)
    if os.environ.get('FAKE_MISSING_XML') == '1': sys.exit(0)
    Path(argument('-testResults')).write_text('<test-run result="Passed" total="1" testcasecount="1" passed="1" failed="0" skipped="0" inconclusive="0" start-time="'+now+'" end-time="'+now+'"><test-case name="synthetic" result="Passed"/></test-run>')
else:
    Path(argument('-wsliceValidationReport')).write_text(json.dumps(dict(schemaVersion=1, status='passed', startedUtc=now, finishedUtc=now, errorCount=0, warningCount=0, validatedScopes=['Garden','Platform','Gate','Chambers','Hazard','Courtyard','Catalog'])))
'''


class LocalScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "Project with spaces"
        (self.project / "ProjectSettings").mkdir(parents=True)
        (self.project / "ProjectSettings/ProjectVersion.txt").write_text("fixture")
        self.unity = self.root / "fake-unity"
        self.unity.write_text(FAKE_UNITY)
        self.unity.chmod(0o755)
        self.env = dict(os.environ, UNITY_PATH=str(self.unity), PROJECT_PATH=str(self.project),
                        PYTHON_PATH=sys.executable)

    def run_script(self, tests=True, **extra):
        return subprocess.run(["bash", str(SCRIPTS / "validate-local.sh")] + (["--tests"] if tests else []),
                              env=dict(self.env, **extra), capture_output=True, text=True)

    def test_two_invocations_keep_independent_evidence(self):
        for _ in range(2):
            result = self.run_script()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        runs = list((self.project / "TestResults").glob("run-*"))
        self.assertEqual(len(runs), 2)
        for run in runs:
            self.assertTrue((run / "EditMode-results.xml").is_file())
            self.assertTrue((run / "PlayMode-results.xml").is_file())

    def test_exit_zero_without_xml_fails_and_cannot_reuse_previous_results(self):
        self.assertEqual(self.run_script().returncode, 0)
        result = self.run_script(FAKE_MISSING_XML="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("L0-L3 VERIFIED", result.stdout)
        self.assertIn("FAIL / UNCONFIRMED", result.stderr)

    def test_without_tests_reports_skipped(self):
        result = self.run_script(tests=False)
        self.assertEqual(result.returncode, 0)
        self.assertIn("L2/L3 SKIPPED", result.stdout)
        self.assertNotIn("L0-L3 VERIFIED", result.stdout)

    def test_missing_unity_is_not_run_and_nonzero(self):
        result = self.run_script(UNITY_PATH=str(self.root / "missing-unity"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("NOT RUN", result.stderr)


if __name__ == "__main__":
    unittest.main()
