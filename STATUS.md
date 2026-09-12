# Doomstar Status

Tracks to-dos and implementation status. Update the table rows as work lands. Design history lives in `AGENTS.md`; simulation evidence in `PLAYTEST_NOTES.md`.

Last updated: 2026-09-12

## Current focus: free-flowing battlefield
Operator notes (2026-09-12):
1. Raise tile density and hide the tiles entirely. Move and attack ranges become circles, each unit has its own shape and size on the board, and mechanics stay grid-based underneath. Add a unit with a splash (area) attack.
2. The Orbiter and the Command look too similar. Orbiter becomes a small science vessel; Command becomes a command star.

### Design decisions (assumptions; change them here if they are wrong)
- The hidden grid is 3x finer: 45x45 fine tiles on the same board footprint as the old 15x15.
- Distances are Euclidean on that grid. Movement still follows paths around obstacles but fills a circle in open space.
- Attack range is measured edge to edge between unit footprints, so bigger units are easier to reach.
- Every unit has a footprint radius; units cannot overlap.
- New unit **Nova**: splash artillery. Its shot damages the target and every other enemy inside the blast radius. No friendly fire.
- Stars become circular zones. A unit holds a star while its center is inside the zone.
- The original tile rulesets stay available in the Balance Lab for comparison.

### Tasks
| # | Task | Status |
| --- | --- | --- |
| 1 | Create `STATUS.md`; update `AGENTS.md` for the new direction | done |
| 2 | Engine: Euclidean distances, unit footprints, no-overlap, circular path movement | done |
| 3 | Engine: Nova unit and splash damage | done |
| 4 | Engine: shape-based map ("Expanse"), circular star zones, cloak field radius | done |
| 5 | Rule tests for the field geometry (25 tests pass) | done |
| 6 | Bot: threat maps for footprints, sampled destinations for speed, value splash hits | done |
| 7 | Renderer: tile-free SVG board, range circles, hover preview, click snaps to nearest legal spot | done (screenshots checked; tile maps still render) |
| 8 | Art: Orbiter science vessel, Command star, Nova, per-unit sizes | done |
| 9 | Game and AI Arena on the new board (Field is the default ruleset); Balance Lab keeps working | done (scripted click test: select, move, order limit, end turn) |
| 10 | Refresh `roster.html` (now reads stats from the engine) and the PDF script | done |
| 11 | Simulate the Field ruleset and add results to `PLAYTEST_NOTES.md` (Round 4) | done |

### Known rough edges
- The Lancer's move circle (6) and attack circle (6.1) nearly coincide, which reads as one circle.
- The move circle doesn't show spots blocked by terrain; the hover preview only appears over reachable spots.
- Asteroids are flat circles; they could use rock detail.
- Field bot games take about 0.6 s, roughly 15x slower than tile games.

## Backlog
- Field: Player 1 wins 59/41. Test `firstTurnOrders: 1` on the `field` ruleset.
- Field: Star Hunter dominates (81-87% vs Balanced/Turtle). Try moving the flank stars farther from both armies, a wider contest reach, or "Scouts can't hold stars".
- Field: Lancer and Guard show negative value at 160 games. Re-run the `field` suite at 400 games; review how the bot positions them; consider separating the Lancer's move (6) and attack (6.1) circles.
- Tile rules: slow units rarely mattered under star rules. Mostly superseded by the Field map, where every ship type deals damage.
- Human playtests of the recommended ruleset (time per game, rules confusion).
- Setup phase with limited loadouts; more maps; networking.
- Put the project under git (not yet a repository).

## Done
- Rules engine separated from the UI (`engine.js`), shared by game, arena and lab.
- Fixed: Prism line-of-sight freeze, no game over after a Command dies, squashed tokens on the board.
- Missing mechanics implemented as rule switches: path movement, blocking asteroids, armor, walls block shots, Orbiter cloak field, star points, Doomstar charge, contested stars, opening-turn order limit.
- Bot with four personas; AI Arena; Balance Lab; headless simulation and test runners.
- Three rounds of simulations; `doomstar` ruleset recommended (see `PLAYTEST_NOTES.md`).
