# Doomstar Status

Tracks to-dos and implementation status. Update the table rows as work lands. Design history lives in `AGENTS.md`; simulation evidence in `PLAYTEST_NOTES.md`.

Last updated: 2026-09-12

## Current focus: Doomstar charge and the Nova
Operator notes (2026-09-12, round 4, after human playtests):
1. Lower the charge needed to fire the Doomstar to 3.
2. The Nova isn't effective. Try a big move and attack range with weaker damage, so it is a nuisance but not deadly. (Alternative: remove the Nova and add another Prism.)

Owner instruction: no testing this round, just the changes.

Standing direction: the map and art stay simple; the fun is the strategy.

### Design decisions (assumptions; change them here if they are wrong)
- **Charge:** `doomstarCharge` 4 -> 3. In Round 6 bot games this variant ended 60.5% of games with the Doomstar, in 15 rounds.
- **Nova:** move 5 -> 7 (between the Lancer's 6 and the Scout's 9), range 7 -> 10 (now the longest; the Prism has 8), damage 2 -> 1 (its blast also deals 1). HP 4 and blast radius 3.5 unchanged. It now needs 4 hits to destroy a light ship.
- **Prism** text no longer claims the longest range; it is the heaviest hitter.
- Tried the Nova rework first rather than the second-Prism swap.

### Tasks
| # | Task | Status |
| --- | --- | --- |
| 1 | Doomstar charge 3 | done |
| 2 | Nova: move 7, range 10, damage 1; ability text | done |
| 3 | Rule tests read the charge from the rules instead of assuming 4 | done, not run |
| 4 | Unit guide PDF script, lab variants, `AGENTS.md` | done |
| 5 | Run rule tests and a Round 7 simulation | not started (owner: no testing this round) |

### Current stats
| Ship | Move | Range | HP | Damage | Crew |
| --- | --- | --- | --- | --- | --- |
| Scout | 9 | 3 | 4 | 2 | no |
| Guard | 4.5 | 1.5 | 9 | 4 | yes |
| Lancer | 6 | 5 | 4 | 4 | yes |
| Prism | 4 | 8 | 4 | 5 | yes |
| Nova | 7 | 10 | 4 | 1, blast 3.5 | yes |
| Command | 0 | 1.5 | 15 | 2 | no |

Doomstar: charge 3, damage 5, gunners may fire while contested; charging needs an uncontested holder.

### Known rough edges
- The move area has holes around allied ships (you can't stop on them). Accurate, but busy in the starting formation.
- The Lancer's move reach (6) and attack reach (6.1) are almost the same size, so the two areas overlap.
- The Fire Doomstar button is the only way to fire; there is no board click for it.
- With range 10, the Nova's red attack area covers much of the board when selected.

## Backlog
- **Check the round 4 changes.** Run `python tools/run_tests.py`, then `python tools/simulate.py --suite doomstar --games 200 --parallel 8` for Round 7 when the owner wants numbers. The lab suite already compares against charge 4 and the Round 6 Nova.
- **Nova alternative.** If the nuisance Nova doesn't work in play: remove the Nova and field a second Prism (a setup change on the Proving Ground).
- **How central is the Doomstar?** Round 6: with charge 4, 58% of bot games ended with a direct Command kill. Charge 3 was the owner's pick; a two-shot kill (Doomstar damage 8, or Command HP 10) is the stronger option if the Doomstar should dominate further.
- **Scout value.** In Round 6, removing a Scout changed nothing in bot games. Watch it in human games; a possible lever is Scout damage 3.
- **Early brawl.** The first ship dies around round 3-4 on the 33x33 map. Try a larger Proving Ground once the rules settle.
- Map variety: more layouts and sizes once the mechanics settle; bigger maps can bring obstacles back.
- Human playtests: time per game, rules confusion.
- Setup phase with limited loadouts; networking.

## Done
- Session 4 (operator notes round 3): no armor with rebalanced HP and damage; faster Nova and Prism; gunners fire while contested; no asteroids on the test map; sphere Command; Round 6 simulations (7.5% draws, 17-round games).
- Session 3 (operator notes round 2): git repository; the Doomstar crew mode; the Proving Ground test map; Orbiter, tile rules and old rulesets removed; terrain-shaped move and attack areas; Fire Doomstar button; Round 5 simulations.
- Session 2: tile-free battlefield on a hidden fine grid, ship footprints, the Nova splash unit.
- Session 1: rules engine separated from the UI; bot with four personas; AI Arena; Balance Lab; headless simulation and test runners.
