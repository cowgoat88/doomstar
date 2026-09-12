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
| 10 | Simulate the Doomstar rules; Round 5 in `PLAYTEST_NOTES.md` | done (also strengthened the bot's star pull) |

### Known rough edges
- The move area has holes around allied ships (you can't stop on them). Accurate, but busy in the starting formation.
- The Lancer's move reach (6) and attack reach (6.1) are almost the same size, so the two areas overlap.
- The Fire Doomstar button is the only way to fire; there is no board click for it.

## Backlog
- **Stalls under the crew rule (needs an owner decision).** In bot games, needing a crew ship in the center to fire leaves many games drawn at the 60-round limit: 35% of balanced mirrors vs 8.5% with automatic firing (Round 5, 200 games each). Armies trade down early, then the last ships won't step into the center. Options to test, all as `DEFAULT_RULES` toggles: fire from anywhere inside a larger Doomstar zone; contesting does not stop firing; unspent charge keeps building so a late shot hits harder; a draw breaker such as Commands losing HP late in the game.
- **Slower artillery adds to the stalls.** With the old Nova and Prism speeds (4.5 and 3), balanced-mirror draws fall from 35% to 25.5% and games shorten from 28 to 23 rounds. Worth checking in human playtests before deciding.
- **Early brawl.** The first ship dies around round 4 and most ships are dead by round 15, before the stars matter. 33x33 is small for these move and range stats; try a 39x39 or 45x45 Proving Ground once the Doomstar rules settle.
- **Bot tuning.** The stronger star pull (session 3) helped the Balanced bot but raised Star Hunter mirror draws from 24% to 45.5%. Rusher mirrors draw 68-74% because Rushers ignore the objective.
- Map variety: more layouts and sizes once the mechanics settle.
- Human playtests (time per game, rules confusion).
- Setup phase with limited loadouts; networking.

## Done
- Rules engine separated from the UI (`engine.js`), shared by game, arena and lab.
- Bot with four personas; AI Arena; Balance Lab; headless simulation and test runners.
- Tile-free battlefield on a hidden fine grid, ship footprints, Nova splash unit (session 2).
