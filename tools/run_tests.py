"""Run the rules engine tests (tests/engine-tests.html) in headless Chrome/Edge.

Usage:
    python tools/run_tests.py
"""

import sys

from simulate import find_browser, run_page


def main():
    payload = run_page(find_browser(), "tests/engine-tests.html", {}, 300)
    for result in payload["results"]:
        status = "PASS" if result["ok"] else "FAIL"
        detail = "" if result["ok"] else f"  ->  {result['error']}"
        print(f"{status}  {result['name']}{detail}")
    failed = sum(1 for r in payload["results"] if not r["ok"])
    print(f"\n{len(payload['results']) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
