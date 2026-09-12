"""Run Doomstar balance experiments in headless Chrome/Edge and save the results as JSON.

The simulation itself lives in lab.js (shared with the in-browser Balance Lab); this
script only opens lab.html headlessly, splits a suite across browser processes, and
collects the JSON each process writes into the page.

Usage:
    python tools/simulate.py --suite smoke --games 10
    python tools/simulate.py --suite doomstar --games 200 --parallel 6
    python tools/simulate.py --config my_experiments.json --games 100
    python tools/simulate.py --narrate --p1 rusher --p2 turtle --seed 3

A config file is a JSON array of experiments:
    [{"name": "charge 3", "rules": {"preset": "doomstar", "doomstarCharge": 3},
      "p1": "balanced", "p2": "balanced", "swapSeats": false}]
"""

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BROWSER_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "google-chrome",
    "chromium",
    "msedge",
]


def find_browser():
    for candidate in BROWSER_CANDIDATES:
        if Path(candidate).exists():
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    sys.exit("No Chrome, Chromium or Edge browser found.")


def run_page(browser, page, params, timeout):
    """Load a page headlessly and return the JSON it writes into <pre id="results">."""
    url = (ROOT / page).as_uri() + ("?" + urllib.parse.urlencode(params) if params else "")
    with tempfile.TemporaryDirectory(prefix="doomstar-sim-") as profile:
        command = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            "--dump-dom",
            url,
        ]
        proc = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=timeout)
    match = re.search(r'<pre id="results"[^>]*>(.*?)</pre>', proc.stdout, re.S)
    if not match or not match.group(1).strip():
        raise RuntimeError(f"No results in page output.\nstderr:\n{proc.stderr[-3000:]}")
    payload = json.loads(html.unescape(match.group(1)))
    if not payload.get("ok"):
        raise RuntimeError(f"Page reported an error:\n{payload.get('error')}")
    return payload


def run_lab(browser, params, timeout):
    return run_page(browser, "lab.html", {"headless": "1", **params}, timeout)


def print_table(results):
    header = (
        f"{'experiment':46} {'games':>5} {'P1%':>6} {'P2%':>6} {'draw%':>6} {'A%':>6} {'B%':>6} "
        f"{'rounds':>6} {'kill@':>6} {'shots':>5} {'ms/g':>5}  endings"
    )
    print(header)
    print("-" * len(header))
    for r in results:
        endings = ", ".join(f"{k} {v}%" for k, v in r["reasons"].items())
        print(
            f"{r['name'][:46]:46} {r['games']:>5} {r['p1Win']:>6} {r['p2Win']:>6} {r['draw']:>6} "
            f"{r['botAWin']:>6} {r['botBWin']:>6} {r['roundsMedian']:>6} {str(r['firstKillRoundAvg']):>6} "
            f"{r['doomstarShotsPerGame']:>5} {r['msPerGame']:>5}  {endings}"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--suite", default="smoke", help="suite name defined in lab.js")
    parser.add_argument("--config", type=Path, help="JSON file with an array of experiments (overrides --suite)")
    parser.add_argument("--games", type=int, default=20, help="games per experiment")
    parser.add_argument("--seed", type=int, default=1, help="first seed")
    parser.add_argument("--parallel", type=int, default=1, help="browser processes to split experiments across")
    parser.add_argument("--timeout", type=int, default=3600, help="seconds allowed per browser process")
    parser.add_argument("--out", type=Path, help="where to write the JSON report")
    parser.add_argument("--narrate", action="store_true", help="print a turn-by-turn log of one game instead")
    parser.add_argument("--rules", default="doomstar", help="with --narrate: ruleset name or JSON rules object")
    parser.add_argument("--p1", default="balanced", help="with --narrate: Player 1 persona")
    parser.add_argument("--p2", default="balanced", help="with --narrate: Player 2 persona")
    args = parser.parse_args()

    browser = find_browser()

    if args.narrate:
        params = {"narrate": "1", "rules": args.rules, "p1": args.p1, "p2": args.p2, "seed": str(args.seed)}
        print(run_lab(browser, params, args.timeout)["text"])
        return

    base = {"games": str(args.games), "seed": str(args.seed)}
    if args.config:
        experiments = json.loads(args.config.read_text(encoding="utf-8"))
        base["config"] = json.dumps(experiments, separators=(",", ":"))
        names = [e.get("name", f"experiment {i}") for i, e in enumerate(experiments)]
        label = args.config.stem
    else:
        base["suite"] = args.suite
        names = run_lab(browser, {**base, "list": "1"}, 120)["experiments"]
        label = args.suite

    workers = max(1, min(args.parallel, len(names)))
    batches = [list(range(len(names)))[i::workers] for i in range(workers)]
    print(f"Running {len(names)} experiment(s) x {args.games} games in {workers} browser process(es)...", flush=True)

    started = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        payloads = list(pool.map(
            lambda batch: run_lab(browser, {**base, "only": ",".join(map(str, batch))}, args.timeout),
            batches,
        ))
    results = sorted((r for p in payloads for r in p["results"]), key=lambda r: r["index"])
    elapsed = time.time() - started

    print_table(results)
    print(f"\nFinished in {elapsed:.0f}s.")

    out = args.out or ROOT / "sim-results" / f"{label}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    report = {"suite": label, "games": args.games, "seed": args.seed, "elapsedSeconds": round(elapsed), "results": results}
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
