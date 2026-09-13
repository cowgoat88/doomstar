# Doomstar Agent Notes

Doomstar is a browser prototype for a quick, one-screen tactics game in a space setting: chess-like turn taking, free-flowing movement, and ships with distinct roles. Players charge the Doomstar at stars spread across the map and fire it from the center to destroy the enemy Command.

## Design pillars (from the owner)
- Plays like a lighter chess: easy to learn, fun, approachable.
- Enough depth that two humans want rematches; distinct ship roles.
- Matches of roughly 10-20 minutes.
- Variable battlefields and a limited roster. Map variety comes later; one static test map for now.
- Free-flowing board: no visible tiles; move and attack areas drawn as shapes; ships with their own shapes and sizes; mechanics stay grid-based underneath.
- Keep the map and art simple. The fun is the strategy, so don't spend effort on art polish.
- Small maps stay open: obstacles only where they shape the objective (walls between the Doomstar and the charging stars). Bigger maps may add more.
- The Doomstar is the game mode. Charging happens at dispersed stars and firing needs a ship in the center, so there is a central fight over charging and firing, with only a small chance to raid an undefended Command.

## Where things are tracked
- `STATUS.md`: to-dos, implementation status and open design assumptions. Update it whenever a task starts or lands.
- `PLAYTEST_NOTES.md`: simulation evidence and balance recommendations.
- This file: architecture, current rules, design decisions and history.

## Architecture
All pages are plain HTML + classic scripts (no build step, no Node required). They run from disk or via `python -m http.server 8000`. The project is a git repository; commit only when the owner asks.

| File | Role |
| --- | --- |
| `engine.js` | The only place rules live: `UNIT_TYPES`, `MAPS`, `DEFAULT_RULES`, `createGame`, `applyAction`, legality queries. No DOM. |
| `ai.js` | Greedy one-turn-lookahead bot (`Doomstar.AI`). Personas: balanced, rusher, turtle, hunter. `playGame` runs a headless match. |
| `board.js` | SVG battlefield (terrain, stars, Doomstar, ship silhouettes, terrain-shaped move/attack areas, hover preview, click snapping), scoreboard and rules text. |
| `index.html` + `game.js` | Playable hot-seat game with a Fire Doomstar button; Player 2 can be a bot. |
| `arena.html` + `arena.js` | Watch bot vs bot. URL params: `p1`, `p2`, `seed`, `speed`, `autoplay=1`, `rules` (JSON overrides, used by lab links). |
| `lab.html` + `lab.js` | Balance Lab: batch experiments and saved suites (`smoke`, `doomstar`, `matchups`, `variants`); headless mode for scripts. |
| `roster.html` | Unit guide; reads stats, ship art and Doomstar steps from the engine and renderer. |
| `make_roster_pdf.py` | Writes `roster.pdf`; stats are hand-copied, keep in sync with `engine.js`. |
| `tools/simulate.py` | Runs lab suites in headless Chrome/Edge, writes `sim-results/*.json`; `--narrate` prints one game as text. |
| `tools/run_tests.py` | Runs `tests/engine-tests.html` headlessly. |

## Current rules
- **Board:** the Proving Ground, a hidden 33x33 grid. Player 2's army is Player 1's rotated 180 degrees. Two charging stars sit on the midline flanks, the Doomstar in the center, and walls between the flanks and the center. No asteroids: human playtests found them too congesting on a small map.
- **Geometry:** Euclidean distances. Every ship has a footprint `radius` and ships cannot overlap. Movement is an 8-way path search that fills a circle of radius `move` in open space and steers around walls, asteroids (a ship needs clearance of `radius + 0.5`) and enemy footprints; allies can be passed. Range is measured hull to hull (`gap`). Close range is 1.5 and never needs a clear lane; longer shots are blocked by walls but not asteroids.
- **Combat:** no armor; every hit deals the attacker's full damage. HP / damage: Scout 4/2, Guard 9/4, Lancer 4/4, Prism 4/5, Nova 4/1, Command 15/2. The Nova is a fast, long-range nuisance (move 7, range 10); the Prism hits hardest (range 8). The Nova's blast deals its damage to every enemy within `splash` (3.5) of the target; no friendly fire.
- **Turns:** 2 orders per turn. An ordered ship may move and attack (or fire), in either order.
- **Doomstar:** at the end of your turn, each star zone held by one of your uncontested crew ships (`rules.crew`: Guard, Lancer, Prism, Nova) adds 1 charge, capped at `doomstarCharge` (3). With full charge, a crew ship inside the Doomstar zone may spend its attack to fire (`{ type: 'fire', unitId }`), even with enemies close by: `doomstarDamage` (5) to the enemy Command; charge resets. Contested means an enemy ship, Scouts included, within close range; it stops charging (`contestedStars`) and, only if `contestedFiring` is on, firing. Scouts and the Command never charge or fire.
- **Winning:** destroy the enemy Command by attack or Doomstar. A draw after `turnLimit` (120) player-turns.
- **Tunable rules** (`DEFAULT_RULES`): `activations`, `firstTurnOrders`, `crew`, `contestedStars`, `contestedFiring`, `doomstarCharge`, `doomstarDamage`, `doomstarNeedsCrew` (false = the old automatic firing), `turnLimit`, `unitOverrides`, `remove`. The only preset is `doomstar`.
- **Map format:** `size`, `scale` (fine tiles per original prototype tile, used by the bot so persona weights keep their meaning), `meleeReach`, `walls` and `asteroids` as `{ rect: [x, y, w, h] }` or `{ circle: [x, y, r] }`, `stars` and `doomstar` as `{ x, y, r }`, and `setup`.

## Rendering notes
- The move area is traced around the ship's legal destinations and the attack area around the cells it could hit from where it stands, so walls, asteroids and other ships cut into them. Both use marching squares with interpolated edges (`areaPaths` in `board.js`).
- Hulls are drawn 15% larger than their footprint so small ships stay readable.

## History
- Original prototype: 15x15 tile board, six unit classes, hot-seat play, unit guide and PDF.
- 2026-09-12, session 1: Claude Code took over the repository.
  - Moved rules into `engine.js`; added the bot, AI Arena, Balance Lab, headless simulation and rule tests.
  - Fixed the Prism line-of-sight freeze, the missing game over, and squashed tokens on the board.
  - Implemented the inert mechanics as rule switches, ran three rounds of simulations and recommended the Doomstar objective with contested stars.
- 2026-09-12, session 2 (operator notes, round 1): free-flowing battlefield.
  - Hidden fine grid, circular ranges, ship footprints, the Nova splash unit and an SVG battlefield.
  - New ship art; `roster.html` reads stats from the engine.
- 2026-09-12, session 3 (operator notes, round 2): the Doomstar mode.
  - Started the git repository.
  - Removed the tile maps, the `classic`/`complete`/`orders`/`field` rulesets, star points, the Orbiter and its cloaking field. `doomstar` is the only mode.
  - Crew charging and the `fire` action. Scouts cannot charge or fire; Scout range 1.5 -> 3; Nova move 4.5 -> 3.5; Prism move 3 -> 2.5.
  - Proving Ground test map (33x33) with flank stars and a central Doomstar.
  - Plain board background, terrain-shaped move and attack areas, a plain five-point Command star, Doomstar zone art and a Fire Doomstar button.
  - Unit guide and PDF updated. Old simulation results were removed; they remain in git history (commit `f77c122`).
- 2026-09-12, session 4 (operator notes, round 3, after human playtests):
  - Removed armor; HP and damage doubled and rebalanced to keep roughly the same hits to destroy each ship.
  - Nova move 3.5 -> 5, Prism move 2.5 -> 4.
  - Gunners fire even when contested (`contestedFiring` toggle, default off); charging still needs an uncontested holder.
  - Removed the asteroids from the Proving Ground; the walls stay.
  - The Command is drawn as a sphere again.
- 2026-09-12, session 5 (operator notes, round 4; owner asked for no testing):
  - Doomstar charge needed 4 -> 3.
  - Nova reworked into a nuisance: move 5 -> 7, range 7 -> 10, damage 2 -> 1. (Alternative the owner raised: remove the Nova and field a second Prism.)

## Workflow
- Change rules only in `engine.js`, and add new mechanics as `DEFAULT_RULES` toggles first so they can be compared in simulation.
- After editing `engine.js` or `ai.js`, run `python tools/run_tests.py`.
- Compare rules with `python tools/simulate.py --suite doomstar --games 200 --parallel 8`; suites are defined in `lab.js`.
- Bot results measure rules as played by a heuristic bot. Use them to shortlist changes, then confirm with human playtests.
- Keep `STATUS.md` current; record design decisions here and findings in `PLAYTEST_NOTES.md`.
