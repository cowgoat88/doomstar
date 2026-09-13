# Doomstar Status

Tracks to-dos and implementation status. Update the table rows as work lands. Design history lives in `AGENTS.md`; simulation evidence in `PLAYTEST_NOTES.md`.

Last updated: 2026-09-12

## Current focus: play online, and on a phone
The owner asked to make the game playable over the internet without any paid services, and then whether it works on a phone (it did, but not comfortably -- reading the code found rough edges, so phone support was folded into the same pass).

### What landed
- **Online 1v1**, peer-to-peer via PeerJS (free public signaling server + Google's free STUN), hosted from a public GitHub Pages repo once the owner publishes it (see "Needs the owner" below). Host a match, share the invite link or room code; the other player's browser connects directly. Host-authoritative: the host runs the rules engine and is the only copy of the truth; see "Online play" in `AGENTS.md` for the protocol.
- **Rejoin, rematch, chat**: a dropped connection or refresh rejoins the same match from `localStorage`; a finished match offers a rematch with seats swapped; a small chat panel (last 50 lines, 200 chars each).
- **Phone support**: the board comes first below 1024px wide; Fire Doomstar/End Turn move to a bottom bar below 720px; a tap previews a move and a second tap on the same spot confirms it; ship hit-testing gets slack on touch; inputs are 16px so iOS doesn't zoom in on focus.
- **Tests**: `serializeState`/`deserializeState`/`applyActionAs` and the slack-widened `unitNear`, plus a full `tests/online-tests.js` suite (loopback transport: a complete bot game through the protocol, rejects, disconnect+rejoin, wrong token, rematch, chat) -- all run via `python tools/run_tests.py` (33/33 passing). A scripted headless-Chrome check confirmed the mouse click flow is unchanged and the touch preview/confirm flow works, at four widths from 360px to 1440px, with no horizontal overflow.
- Docs: `AGENTS.md` (protocol, rejoin, touch input), `README.md` (new), `.nojekyll`.

### Needs the owner (not something this session can do on its own)
1. **Publish**: create a free GitHub account and a public repository, `git remote add origin <url>` and `git push -u origin main`, then turn on Pages (Settings -> Pages -> Deploy from branch `main`, folder `/`). The site is then at `https://<user>.github.io/<repo>/`.
2. **Real-network test**: after publishing, open the Pages URL from two different networks (e.g. home Wi-Fi and a phone hotspot) and play a full match, including a refresh mid-game. The headless tests can't exercise real WebRTC.
3. **Real phone test**: open the site on an actual phone and play a bot game, to confirm the touch/layout choices feel right (this session only verified them in headless Chrome at phone-sized viewports).

### Standing direction
The map and art stay simple; the fun is the strategy.

## Previous focus: Doomstar charge and the Nova
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
- Session 6: online 1v1 (PeerJS, host-authoritative, rejoin/rematch/chat) and phone support (responsive layout, tap-to-preview touch input). See "Current focus" above.
- Session 4 (operator notes round 3): no armor with rebalanced HP and damage; faster Nova and Prism; gunners fire while contested; no asteroids on the test map; sphere Command; Round 6 simulations (7.5% draws, 17-round games).
- Session 3 (operator notes round 2): git repository; the Doomstar crew mode; the Proving Ground test map; Orbiter, tile rules and old rulesets removed; terrain-shaped move and attack areas; Fire Doomstar button; Round 5 simulations.
- Session 2: tile-free battlefield on a hidden fine grid, ship footprints, the Nova splash unit.
- Session 1: rules engine separated from the UI; bot with four personas; AI Arena; Balance Lab; headless simulation and test runners.
