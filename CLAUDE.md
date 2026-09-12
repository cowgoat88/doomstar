@AGENTS.md

## Commands
- Play locally: `python -m http.server 8000`, then open http://localhost:8000 (the pages also work straight from disk).
- Rule tests: `python tools/run_tests.py`
- Balance simulations: `python tools/simulate.py --suite ablation --games 400 --parallel 3` (suites live in `lab.js`)
- Read one bot game as text: `python tools/simulate.py --narrate --rules orders --seed 3`

## Working rules
- All game rules belong in `engine.js`. UI files (`game.js`, `arena.js`, `board.js`) must not re-implement rules.
- Every rule change should be a toggle in `DEFAULT_RULES` so it can be compared in the Balance Lab before it becomes the default.
- Run `python tools/run_tests.py` after touching `engine.js` or `ai.js`.
- Bot numbers measure the rules as played by a heuristic bot; treat them as evidence, not proof, and confirm with human playtests.
