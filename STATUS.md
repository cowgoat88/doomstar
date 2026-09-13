# Doomstar Status

Tracks to-dos and implementation status. Update the table rows as work lands. Design history lives in `AGENTS.md`; simulation evidence in `PLAYTEST_NOTES.md`.

Last updated: 2026-09-12

## Current focus: mobile GUI, matched to similar games
Published: `https://cowgoat88.github.io/doomstar/` (branch `doomain`). The owner asked to match the mobile GUI to similar tactics games -- better button placement, features in menus instead of scrolling -- and then, after seeing it on a real device, reported the board was only about half the screen and should be full-screen: on a phone, the board is the only thing that matters.

### What landed
- **A persistent HUD, not a scrolled sidebar.** The turn banner and both sides' scoreboard live in a `.hud-bar` above the board, visible at every width; the status message sits in a strip right under the board.
- **Everything else moved into a menu.** Match setup, Play Online, Roster and How to play/Rules are in the sidebar: the same always-visible column on desktop, an off-canvas drawer below 1024px (hamburger button; closed by its own button, the backdrop, Escape, or picking a roster card/starting a new match).
- **The board now actually dominates the screen on a phone.** The first pass left a bug: a scoreboard width hint (`flex-basis: 320px`) became a *height* demand once the HUD bar stacked into a column on narrow screens, forcing the score cards to stretch to 320px tall and squeezing the board down to roughly a fifth of the screen. Fixed by not stacking the HUD bar at all -- it stays a single compact row (turn pill + both sides' HP/charge, no card padding, ships/stars rows and ship-icon strip dropped) -- and the board legend moved into the menu (a small `.sidebar-legend` copy) since it's reference info, not something needed mid-turn. Board now runs 56-72% of screen height depending on device, with zero horizontal or vertical overflow.
- **Lesson for next time:** the first pass "confirmed" the smaller board looked fine from headless-Chrome screenshots, which was wrong -- `--window-size` below ~500px is not reliable for `--dump-dom`/`--screenshot` in this environment (Chrome renders at a ~500px floor internally and crops the output to the requested size, which can look like correct narrow-width layout when it isn't). Verify narrow widths with an `<iframe style="width:NNNpx">` instead, which gets its own real browsing context sized by its own CSS; see `AGENTS.md`.
- **Verified**: `python tools/run_tests.py` 33/33 (unaffected, these files aren't part of that suite). A scripted headless-Chrome check via the iframe method: menu open/close through every trigger, roster selection, mouse-move and touch tap-preview/confirm regression, zero overflow, and the board-to-screen-height ratio, at six sizes from 360x780 to 1024x768.

### Needs the owner
- **Look at it on a real phone again** to confirm the board now reads as full-screen and the compact HUD text is legible.
- Still outstanding from the online-play work: a real two-network test (e.g. home Wi-Fi + a phone hotspot) and a real-phone play test -- see "Done" below.

### Standing direction
The map and art stay simple; the fun is the strategy.

## Previous focus: play online, and on a phone
The owner asked to make the game playable over the internet without any paid services, and then whether it works on a phone (it did, but not comfortably -- reading the code found rough edges, so phone support was folded into that pass; superseded by the mobile GUI pass above).

## Earlier focus: Doomstar charge and the Nova
Operator notes (2026-09-12, round 4, after human playtests):
1. Lower the charge needed to fire the Doomstar to 3.
2. The Nova isn't effective. Try a big move and attack range with weaker damage, so it is a nuisance but not deadly. (Alternative: remove the Nova and add another Prism.)

Owner instruction: no testing this round, just the changes.

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
- Setup phase with limited loadouts.
- **[operator, not started]** Add a small health bar with hitpoints remaining below each unit, instead of just the number.
- **[operator, incomplete note -- ask the owner]** "move the" -- this line in the backlog was cut off before this session started working. Left as-is rather than guessed at; ask the owner what it meant.

## Done
- Session 7: mobile GUI matched to similar games -- persistent HUD bar, a menu drawer for setup/online/roster/rules, a non-scrolling app shell below 1024px. Published to GitHub Pages (`https://cowgoat88.github.io/doomstar/`). See "Current focus" above.
- Session 6: online 1v1 (PeerJS, host-authoritative, rejoin/rematch/chat) and phone support (responsive layout, tap-to-preview touch input).
- Session 4 (operator notes round 3): no armor with rebalanced HP and damage; faster Nova and Prism; gunners fire while contested; no asteroids on the test map; sphere Command; Round 6 simulations (7.5% draws, 17-round games).
- Session 3 (operator notes round 2): git repository; the Doomstar crew mode; the Proving Ground test map; Orbiter, tile rules and old rulesets removed; terrain-shaped move and attack areas; Fire Doomstar button; Round 5 simulations.
- Session 2: tile-free battlefield on a hidden fine grid, ship footprints, the Nova splash unit.
- Session 1: rules engine separated from the UI; bot with four personas; AI Arena; Balance Lab; headless simulation and test runners.
