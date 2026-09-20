#!/usr/bin/env python3
"""Fail closed on missing, stale, incomplete or unsuccessful Unity evidence."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
import xml.etree.ElementTree as ET


VALIDATION_SCOPES = {"Garden", "Platform", "Gate", "Chambers", "Hazard", "Courtyard", "Catalog"}


class EvidenceError(ValueError):
    pass


def timestamp(value):
    try:
        # Unity's DateTime.ToString("o") emits seven fractional digits; the
        # Python 3.9 bundled with macOS accepts at most microsecond precision.
        normalized = re.sub(r"(\.\d{6})\d+(?=(?:Z|[+-]\d{2}:\d{2})?$)", r"\1", value)
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (AttributeError, TypeError, ValueError) as error:
        raise EvidenceError(f"Invalid or missing evidence timestamp: {value!r}") from error


def check_fresh(path, started_after, started, finished):
    if not path.is_file():
        raise EvidenceError(f"Missing evidence: {path}")
    if path.stat().st_mtime < started_after:
        raise EvidenceError(f"Stale file: {path}")
    start, end = timestamp(started), timestamp(finished)
    # NUnit may serialize whole seconds. Unique run directories prevent reuse.
    if start < int(started_after) or end < start or end > time.time() + 300:
        raise EvidenceError(f"Stale or incomplete run timestamps: {path}")


def count_attribute(root, key):
    try:
        value = int(root.attrib[key])
        if value < 0:
            raise ValueError()
        return value
    except (KeyError, ValueError) as error:
        raise EvidenceError(f"Invalid or missing NUnit count: {key}") from error


def verify_xml(path, started_after):
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError) as error:
        raise EvidenceError(f"Missing or malformed NUnit XML: {path}: {error}") from error
    if root.tag != "test-run":
        raise EvidenceError(f"Expected NUnit 3 test-run root: {path}")
    check_fresh(path, started_after, root.get("start-time"), root.get("end-time"))
    cases = list(root.iter("test-case"))
    counts = Counter(case.get("result") for case in cases)
    if not cases or counts["Passed"] == 0:
        raise EvidenceError(f"No executed passing test cases (empty/all skipped): {path}")
    if any(result not in {"Passed", "Skipped"} for result in counts):
        raise EvidenceError(f"Failed, inconclusive or incomplete test cases: {dict(counts)}")
    if root.get("result") != "Passed":
        raise EvidenceError(f"Test run did not pass: {root.get('result')}: {path}")
    for suite in root.iter("test-suite"):
        if suite.get("result") not in {"Passed", "Skipped"}:
            raise EvidenceError(f"Failed or incomplete suite: {suite.get('fullname', suite.get('name'))}")
    expected = {"total": len(cases), "passed": counts["Passed"], "failed": 0,
                "skipped": counts["Skipped"], "inconclusive": 0}
    for key, value in expected.items():
        if count_attribute(root, key) != value:
            raise EvidenceError(f"NUnit summary/case mismatch for {key}: {path}")
    if "testcasecount" in root.attrib and count_attribute(root, "testcasecount") != len(cases):
        raise EvidenceError(f"Discovered tests were not all reported: {path}")
    return expected


def verify_validation(path, started_after):
    try:
        report = json.loads(path.read_text())
    except (OSError, ValueError) as error:
        raise EvidenceError(f"Missing or malformed validation receipt: {path}") from error
    if not isinstance(report, dict):
        raise EvidenceError("Validation receipt must be an object")
    check_fresh(path, started_after, report.get("startedUtc"), report.get("finishedUtc"))
    scopes = report.get("validatedScopes", [])
    if (report.get("schemaVersion") != 1 or report.get("status") != "passed"
            or report.get("errorCount") != 0 or not isinstance(scopes, list)
            or len(scopes) != len(VALIDATION_SCOPES) or set(scopes) != VALIDATION_SCOPES):
        raise EvidenceError("Validation did not finish all required scopes without errors")
    return {"scopes": scopes, "warnings": report.get("warningCount", 0)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results", type=Path, help="One NUnit XML, a runner artifact directory, or validation JSON")
    parser.add_argument("--started-after", required=True, type=Path, help="Marker created before this invocation")
    parser.add_argument("--kind", choices=["tests", "validation"], default="tests")
    args = parser.parse_args(argv)
    try:
        if not args.started_after.is_file():
            raise EvidenceError(f"Missing invocation marker: {args.started_after}")
        started_after = args.started_after.stat().st_mtime
        if args.kind == "validation":
            result = verify_validation(args.results, started_after)
            print(f"VERIFIED L0/L1: {len(result['scopes'])} scopes, {result['warnings']} warnings; {args.results}")
        else:
            paths = sorted(args.results.rglob("*.xml")) if args.results.is_dir() else [args.results]
            if not paths:
                raise EvidenceError(f"No NUnit XML produced: {args.results}")
            totals = Counter()
            for path in paths:
                totals.update(verify_xml(path, started_after))
            print(f"VERIFIED tests: {totals['passed']} passed, {totals['skipped']} skipped, "
                  f"{totals['total']} reported; {args.results}")
        return 0
    except (EvidenceError, TypeError) as error:
        print(f"FAIL / UNCONFIRMED: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
