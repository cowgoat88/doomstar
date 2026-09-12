# Doomstar Agent Notes

Doomstar is a browser prototype for a quick, one-screen tactics game in a space setting: chess-like turn taking, looser free-flowing movement, and ships that each have a distinct role. Command survival and star control are the objectives.

## Design pillars (from the owner)
- Plays like a lighter chess: easy to learn, fun, approachable.
- Enough depth that two humans want rematches; distinct unit abilities.
- Matches of roughly 10-20 minutes.
- Variable battlefields and a limited roster.
- **Free-flowing board (operator notes, 2026-09-12):** no visible tiles; circular move and attack ranges; ships with unique shapes and sizes; mechanics stay grid-based underneath. The Orbiter is a small science vessel and the Command is a command star. The roster includes a splash-damage unit (Nova).

## Where things are tracked
- `STATUS.md`: to-dos and implementation status. Update it whenever a task starts or lands.
- `PLAYTEST_NOTES.md`: simulation evidence and balance recommendations.
- This file: architecture, design decisions and history.

## Architecture
All pages are plain HTML + classic scripts (no build step, no Node required). They run from disk or via `python -m http.server 8000`.

| File | Role |
| --- | --- |
| `engine.js` | The only place rules live. `DEFAULT_RULES` toggles, `RULESETS`, `MAPS`, `UNIT_SETS`, `createGame`, `applyAction`, legality queries. No DOM. |
| `ai.js` | Greedy one-turn-lookahead bot (`Doomstar.AI`). Personas: balanced, rusher, turtle, hunter. `playGame` runs a headless match. |
| `board.js` | Tile-free SVG battlefield (terrain shapes, star zones, ship silhouettes, range circles, hover preview, click snapping), scoreboard and rules text. |
| `index.html` + `game.js` | Playable hot-seat game; Player 2 can be a bot; ruleset picker (defaults to `field`). |
| `arena.html` + `arena.js` | Watch bot vs bot. URL params: `rules`, `p1`, `p2`, `seed`, `speed`, `autoplay=1`. |
| `lab.html` + `lab.js` | Balance Lab: batch experiments and saved suites; headless mode for scripts. |
| `roster.html` | Unit guide; reads stats and ship art from the engine and renderer. |
| `make_roster_pdf.py` | Writes `roster.pdf`; stats are hand-copied, keep in sync with `engine.js`. |
| `tools/simulate.py` | Runs lab suites in headless Chrome/Edge, writes `sim-results/*.json`; `--narrate` prints one game as text. |
| `tools/run_tests.py` | Runs `tests/engine-tests.html` headlessly. |

## Board geometry
The engine supports two geometries, chosen by the map:
- **Tile maps** (`prototype`, `crucible`, `outpost`): Manhattan distances, one unit per tile, the original stats (`UNIT_TYPES`). Kept for comparison with earlier simulations.
- **Field maps** (`expanse`): a hidden 45x45 grid, 3x the original density. Distances are Euclidean. Each unit has a footprint `radius` and units cannot overlap. Movement is an 8-way path search that fills a circle of radius `move` in open space and steers around terrain (units need clearance of `radius + 0.5` from blocking tiles) and enemy footprints. Attack range is measured edge to edge (`gap`); melee reach is 1.5. Star zones are circles; the Orbiter field is a circle of radius `field`; the Nova's `splash` hits every enemy whose footprint is inside the blast around the target (no friendly fire). Field stats live in `FIELD_STATS`; HP, damage and armor are shared with the tile stats.
- Map settings: `metric`, `units` (stat set), `scale` (fine tiles per original tile, used by the bot so persona weights mean the same on every map) and `meleeReach`. Field terrain is described as shapes: `{ rect: [x, y, w, h] }`, `{ circle: [x, y, r] }`, stars `{ x, y, r }`.

## Rulesets
- `classic`: the original prototype rules as coded. Every unit moves and attacks each turn; moves ignore walls; only Prism shots need a clear lane; armor, cloaking, asteroids and stars have no effect.
- `complete`: the mechanics the original UI described, implemented, on the symmetric `crucible` tile map.
- `orders`: `complete` with only 2 units ordered per turn.
- `doomstar`: `orders` with contested stars charging a Doomstar that hits the enemy Command for 2 at 6 charge. Best-balanced tile ruleset (see `PLAYTEST_NOTES.md`).
- `field`: the `doomstar` rules on the open `expanse` field map. Current default in the game and arena.
- Other switches: `firstTurnOrders`, `starTarget`, `doomstarCharge`, `unitOverrides`, `remove`.

## History
- Original prototype: 15x15 tile board, six unit classes, hot-seat play, unit guide and PDF.
- 2026-09-12, session 1: Claude Code took over the repository.
  - Moved rules into `engine.js`; added the bot, AI Arena, Balance Lab, headless simulation and rule tests.
  - Fixed the Prism line-of-sight freeze, the missing game over, and squashed tokens on the board.
  - Implemented the inert mechanics as rule switches and ran three rounds of simulations; recommended the `doomstar` ruleset.
- 2026-09-12, session 2 (operator notes): free-flowing battlefield.
  - Added field geometry, the `expanse` map, the Nova splash unit and the `field` ruleset.
  - Replaced the tile grid renderer with an SVG battlefield; new ship art (Command star, Orbiter science vessel, Nova).
  - `roster.html` now reads stats from the engine; PDF script updated.

## Workflow
- Change rules only in `engine.js`, and add new mechanics as toggles first so they can be compared in simulation.
- After editing `engine.js` or `ai.js`, run `python tools/run_tests.py`.
- Compare rules with `python tools/simulate.py --suite <name> --games 400 --parallel 3`; suites are defined in `lab.js`. Field games take about 0.6 s each, so use `--parallel` generously.
- Bot results measure rules as played by a heuristic bot. Use them to shortlist changes, then confirm with human playtests.
- Keep `STATUS.md` current; record design decisions here and findings in `PLAYTEST_NOTES.md`.
