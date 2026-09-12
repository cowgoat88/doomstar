# Doomstar Playtest Notes

Simulated playtests run by Claude Code with the bot in `ai.js`. Raw numbers for the current rules are in `sim-results/doomstar.json`. Re-run with `python tools/simulate.py --suite doomstar --games 200 --parallel 8`, or watch games in `arena.html`.

## How the tests are run
- **Bot:** a greedy, one-turn-lookahead player. Each decision scores every legal move, attack and Doomstar shot for the ships it may order, using material, Command health, the damage enemies could deal next turn, support from allies, and progress toward stars, the Doomstar and the enemy Command.
- **Play styles (personas):** Balanced, Rusher (charges the Command), Turtle (defends, avoids exposure) and Star Hunter (plays for the stars and the Doomstar).
- **Sample size:** 200 games per experiment, so a win rate is accurate to about ±7 percentage points. Treat smaller differences as noise.
- **Common seeds:** game *n* of every experiment uses the same random seed, so experiments differ only by the rule being tested.
- **Limits of the bot:** it plans one turn ahead and is not a strong player. Results show where to look; human games decide. Results that look like bot quirks are flagged.

## Earlier rounds (rulesets since removed)
Rounds 1-4 tested the original tile rules and the first open-field map. Those rulesets were removed in session 3. The full write-up and raw results are in git history (commit `f77c122`). What carried forward:
- **Waiting wins** when every unit acts each turn and nothing needs holding. Fix: 2 orders per turn plus an objective.
- **Limiting orders without an objective stalls** into draws. Star points alone turned the game into a race with about 1 attack per game.
- **Contested stars were the best single fix.** They removed the first-move edge and doubled the fighting.
- **The Doomstar beat plain points:** one goal (destroy the enemy Command), with stars as the way to get there.
- **Symmetric maps matter.** An uneven star layout alone swung games to 72/28.
- **On tiles, only the Scout mattered.** The open field map (Round 4) made every ship fight (8.6 attacks per game) but brought back a 59/41 first-move edge. The Star Hunter dominated (beat Balanced 81-19) because stars were a short Scout run from each army. That fed operator notes round 2: Scouts no longer charge, stars moved to the flanks, and firing needs a crew ship in the center.
- **Bugs fixed during the takeover:** the Prism line-of-sight freeze, no game over, squashed tokens, and mechanics that were described but inert.

## Round 5: crew rules on the Proving Ground
Rules: 2 orders per turn; Guards, Lancers, Prisms and Novas charge at the two flank stars (+1 per star per turn, up to 4) and fire from the central Doomstar (2 damage); Scouts range 3 but cannot charge or fire; 33x33 map.

### Bot fix found along the way
The first run of the suite drew 44.5% of balanced mirror games. Narrated games showed why: after an early brawl, each side was left with a lone Prism that stood off out of range for 35 rounds while an empty star sat a few moves away. The bot's pull toward stars was half its pull toward the enemy Command, so a lone ship never went to charge. Strengthening the star pull (in `ai.js`) cut balanced-mirror draws to 35% and doubled Doomstar shots (0.7 to 1.2 per game), but pushed Star Hunter mirror draws from 24% to 45.5%. The tables below use the fixed bot.

### Headline numbers
| Balanced mirror | Round 4 (open field, old rules) | Round 5 (Proving Ground) |
| --- | --- | --- |
| Player 1 / Player 2 / draw | 59.4 / 40.6 / 0 | 31.5 / 33.5 / 35 |
| Median rounds | 18 | 28 |
| First kill (round) | 8.2 | 4.5 |
| Doomstar shots per game | not tracked | 1.2 |
| How games end | Doomstar 94%, Command 6% | Command 39%, draw 35%, Doomstar 26% |

What this shows:
- **The first-move edge is gone:** 31.5% vs 33.5%, down from 59/41.
- **No play style dominates, and the well-rounded one wins.** Balanced beats every other style, and the Star Hunter no longer runs away with games (it beat Balanced 81-19 in Round 4; now Balanced leads 43.5-30).
- **Every ship matters** (table below).
- **But a third of games stall.** 35% end in a draw at the 60-round limit, and the median game lasts 28 rounds, about 56 orders per player. That is longer than the 10-20 minute target.
- **The crew requirement causes most of the stalls.** With automatic firing, draws fall to 8.5% and games last 19 rounds. Armies trade down early (first kill in round 4.5), and the bot won't send its last ships into the center. Humans may do better, so test in person before changing the rule.
- **Slower artillery adds to it.** With the old Nova and Prism speeds, draws fall to 25.5% and games last 23 rounds.

### Play styles
| Matchup (seats alternate) | Result |
| --- | --- |
| Balanced vs Rusher | Balanced 44%, Rusher 12.5%, draw 43.5% |
| Balanced vs Turtle | Balanced 43%, Turtle 24.5%, draw 32.5% |
| Balanced vs Star Hunter | Balanced 43.5%, Star Hunter 30%, draw 26.5% |
| Rusher vs Turtle | Turtle 40.5%, Rusher 26%, draw 33.5% |
| Rusher vs Star Hunter | Star Hunter 48.5%, Rusher 20.5%, draw 31% |
| Turtle vs Star Hunter | Turtle 47.5%, Star Hunter 17.5%, draw 35% |

Mirror matches draw often: Rusher 68%, Turtle 47%, Star Hunter 45.5%. Rushers ignore the stars, so neither side charges.

### Ship value
Each row removes one ship from one side. Value is the average drop in the owner's wins minus losses, in percentage points (baseline: Player 1 31.5%, Player 2 33.5%).

| Ship removed | From Player 1: P1 / P2 wins | From Player 2: P1 / P2 wins | Value |
| --- | --- | --- | --- |
| Guard | 12.5 / 59 | 62.5 / 11.5 | 49 |
| Lancer | 15.5 / 53 | 50 / 13.5 | 37 |
| Prism | 23.5 / 51.5 | 57.5 / 18.5 | 34 |
| Scout | 25 / 42 | 43 / 18 | 21 |
| Nova | 24 / 41 | 36 / 23.5 | 15 |

The Guard, the weakest ship in Round 4, is now the most valuable: it survives on stars and in the Doomstar. The Nova, the strongest in Round 4, is now the weakest, likely because it is slower and its low damage is soaked by armor.

### Rule variants
| Change (balanced mirror) | P1 / P2 / draw % | Median rounds | Doomstar shots | How games end |
| --- | --- | --- | --- | --- |
| **Baseline** | 31.5 / 33.5 / 35 | 28 | 1.2 | Command 39%, draw 35%, Doomstar 26% |
| Charge 3 | 33.5 / 32 / 34.5 | 28 | 1.2 | Command 42.5%, draw 34.5%, Doomstar 23% |
| Charge 6 | 27 / 27 / 46 | 42 | 0.8 | draw 46%, Command 40.5%, Doomstar 13.5% |
| Doomstar damage 3 | 30.5 / 36 / 33.5 | 27 | 1.0 | Doomstar 38%, draw 33.5%, Command 28.5% |
| Fires without crew (old rule) | 45.5 / 46 / 8.5 | 19 | 2.5 | Doomstar 75%, Command 16.5%, draw 8.5% |
| Scouts crew too | 15 / 77.5 / 7.5 | 13 | 3.8 | Doomstar 67%, Command 25.5%, draw 7.5% |
| Stars not contested | 30.5 / 35 / 34.5 | 28 | 1.2 | Command 42.5%, draw 34.5%, Doomstar 23% |
| Player 1 opens with 1 order | 38.5 / 28.5 / 33 | 30 | 1.1 | Command 41%, draw 33%, Doomstar 26% |
| 3 orders per turn | 42.5 / 26 / 31.5 | 25 | 0.9 | Command 49%, draw 31.5%, Doomstar 19.5% |
| Scout range 1.5 (old) | 32.5 / 28 / 39.5 | 34 | 1.1 | Command 40.5%, draw 39.5%, Doomstar 20% |
| Nova 4.5 / Prism 3 move (old) | 40 / 34.5 / 25.5 | 23 | 1.2 | Command 52.5%, draw 25.5%, Doomstar 22% |

What this shows:
- **Automatic firing is the only change that fixes the stalls**, but it removes the fight over the center that the crew rule was meant to create.
- **Letting Scouts crew makes games fast but hands Player 2 77.5% of them.** A likely cause: Scouts race to the stars, and the side that moves second picks them off. Keep Scouts off the crew.
- **Charge 3, turning off contested stars and the opening-order limit change nothing measurable.** Charge 6 makes stalls worse, and 3 orders per turn brings back a first-move edge (42.5/26).
- **Scout range 3 is fine:** going back to 1.5 adds draws.

### Verdict
The crew rules fixed the Round 4 problems: no first-move edge, no dominant play style, and every ship matters. The open problem is stalling. Under the crew rule a third of bot games run out the clock, and the rest run long. Before changing the rules, play a few human games to see whether people push gunners into the center better than the bot does. If they stall too, test these as rule toggles, in order: a larger Doomstar zone, firing that ignores contesting, and a draw breaker. Also consider giving the Nova and Prism back some speed.

## Watch these in the AI Arena
Open from disk or via `python -m http.server 8000`:
- `arena.html?p1=balanced&p2=balanced&seed=4&autoplay=1`: Player 2 wins with the Doomstar in round 21.
- `arena.html?p1=balanced&p2=balanced&seed=3&autoplay=1`: an early brawl that ends in a stand-off draw at round 60.
- `arena.html?p1=balanced&p2=balanced&seed=2&autoplay=1`: crew rule; Player 2 fires once and wins by destroying the Command in round 40.
- `arena.html?p1=balanced&p2=balanced&seed=2&autoplay=1&rules={"doomstarNeedsCrew":false}`: the same seed with automatic firing; three Doomstar hits end it in round 19.
