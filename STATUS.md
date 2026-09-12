# Doomstar Status

Tracks to-dos and implementation status. Update the table rows as work lands. Design history lives in `AGENTS.md`; simulation evidence in `PLAYTEST_NOTES.md`.

Last updated: 2026-09-12

## Current focus: the Doomstar objective
Operator notes (2026-09-12, round 2):
1. Scouts cannot charge or fire the Doomstar.
2. Charging stars should not be centralized (map layout issue).
3. Firing needs charge AND a ship in the Doomstar. Any ship that can charge can fire (decided: no dedicated gunner class).
4. Update the unit guide.
5. Plain background, no stars.
6. Move and attack areas are shaped by terrain.
7. Remove the Orbiter.
8. Nova and Prism move a little less.
9. Scout attack range increases.

Actions: put the project under git; a smaller static test map with dispersed charging stars and a central Doomstar; simpler Command star art; Doomstar is the only game mode (old rulesets removed); clean up the repository.

Operator direction: the map and art can stay simple; the fun is the strategy. Don't spend effort on art polish (asteroid detail etc.).

### Design decisions (assumptions; change them here if they are wrong)
- **Crew:** Guard, Lancer, Prism and Nova (`rules.crew`). Scouts and the Command cannot charge or fire.
- **Charging:** at the end of your turn, +1 charge per star zone held by an uncontested crew ship. Charge caps at `doomstarCharge` (4).
- **Firing:** a crew ship inside the Doomstar zone, not contested, with full charge, spends its attack to fire (`{ type: 'fire' }`): 2 damage to the enemy Command, ignoring armor. Charge resets to 0.
- **Contested:** an enemy ship (Scouts included) within close range (1.5, hull to hull) of the holder or gunner.
- **Stats:** Scout range 1.5 -> 3. Nova move 4.5 -> 3.5. Prism move 3 -> 2.5.
- **Test map "Proving Ground":** 33x33 hidden grid, 9 ships a side. Two charging stars on the midline flanks (equally far from both armies), the Doomstar in the center, walls between the flanks and the center, six small asteroids.
- Armor, walls blocking shots beyond close range, and path movement are now always on (no longer toggles).

### Tasks
| # | Task | Status |
| --- | --- | --- |
| 1 | `git init`, `.gitignore`, baseline commit | done (`f77c122`) |
| 2 | Engine: field-only geometry, remove tile maps/rulesets/Orbiter/cloak/points, new stats | done |
| 3 | Engine: crew charging, `fire` action, Proving Ground map | done |
| 4 | Rule tests rewritten for the Doomstar rules | done (24 tests pass) |
| 5 | Bot: fire plans, gunner positioning, defend the center | done (narrated game: charges and fires) |
| 6 | Renderer: plain background, terrain-shaped move/attack areas, Doomstar zone, simple Command star | done (screenshots checked) |
| 7 | Game (Fire Doomstar button), arena and lab on the single ruleset | done |
| 8 | Unit guide and PDF | done |
| 9 | Repository cleanup: dead CSS, old sim results, docs | done |
| 10 | Simulate the Doomstar rules; Round 5 in `PLAYTEST_NOTES.md` | in progress |

### Known rough edges
- The move area has holes around allied ships (you can't stop on them). Accurate, but busy in the starting formation.
- The Lancer's move reach (6) and attack reach (6.1) are almost the same size, so the two areas overlap.
- The Fire Doomstar button is the only way to fire; there is no board click for it.

## Backlog
- Map variety: more layouts and sizes once the mechanics settle.
- Human playtests (time per game, rules confusion).
- Setup phase with limited loadouts; networking.

## Done
- Rules engine separated from the UI (`engine.js`), shared by game, arena and lab.
- Bot with four personas; AI Arena; Balance Lab; headless simulation and test runners.
- Tile-free battlefield on a hidden fine grid, ship footprints, Nova splash unit (session 2).
