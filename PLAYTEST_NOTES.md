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

## Round 6: no armor, faster artillery, open map
Changes after human playtests: no armor (HP and damage rebalanced), Nova move 5, Prism move 4, gunners fire even when contested, and no asteroids on the Proving Ground. Same bot as Round 5, 200 games per experiment.

### Headline numbers
| Balanced mirror | Round 5 | Round 6 |
| --- | --- | --- |
| Player 1 / Player 2 / draw | 31.5 / 33.5 / 35 | 45.5 / 47 / 7.5 |
| Median rounds | 28 | 17 |
| First kill (round) | 4.5 | 3.5 |
| Doomstar shots per game | 1.2 | 3.0 |
| How games end | Command 39%, draw 35%, Doomstar 26% | Command 58%, Doomstar 34.5%, draw 7.5% |

What this shows:
- **The stalls are fixed.** Draws fell from 35% to 7.5%, and the median game dropped from 28 to 17 rounds, about 34 orders per player. At 10-20 seconds per order that is roughly 11-23 minutes, close to the 10-20 minute target.
- **Still no first-move edge:** 45.5% vs 47%.
- **Firing while contested is not what fixed it.** Blocking contested gunners again (the Round 5 rule) gives 5% draws and 17 rounds, the same as the new default. The fix came from the other changes together. Only the artillery speed was tested on its own: with the Round 5 speeds, draws rise to 12.5%.
- **Most games are still won by attacking the Command directly (58%), not with the Doomstar (34.5%).** The design goal is a fight over the Doomstar with only a small chance to raid an undefended Command, so this is the main open question (see the variants).

### Play styles
| Matchup (seats alternate) | Result |
| --- | --- |
| Balanced vs Rusher | Balanced 54.5%, Rusher 42.5%, draw 3% |
| Balanced vs Turtle | Balanced 50.5%, Turtle 47%, draw 2.5% |
| Balanced vs Star Hunter | Balanced 65.5%, Star Hunter 32%, draw 2.5% |
| Rusher vs Turtle | Turtle 50.5%, Rusher 44%, draw 5.5% |
| Rusher vs Star Hunter | Star Hunter 63.5%, Rusher 35%, draw 1.5% |
| Turtle vs Star Hunter | Turtle 59.5%, Star Hunter 36.5%, draw 4% |

No style dominates; Balanced and Turtle are close to even. Mirror-match draws fell too: Rusher 6.5% (was 68%), Turtle 9%, Star Hunter 4.5%.

### Ship value
Same method as Round 5 (baseline: Player 1 45.5%, Player 2 47%).

| Ship removed | From Player 1: P1 / P2 wins | From Player 2: P1 / P2 wins | Value |
| --- | --- | --- | --- |
| Lancer | 22.5 / 72.5 | 74.5 / 21.5 | 52 |
| Prism | 28 / 67.5 | 65 / 31 | 37 |
| Guard | 30.5 / 61 | 60.5 / 33 | 29 |
| Nova | 40 / 55.5 | 49 / 44 | 10 |
| Scout | 45 / 48 | 45.5 / 47.5 | about 0 |

- **The faster Prism now pulls its weight** as the second most valuable ship.
- **The Nova is still weak** despite the extra speed. Its 2 damage needs 2 hits to destroy a light ship and 5 for a Guard.
- **Scouts no longer change results** in bot games. They can't charge, their 2 damage needs 8 hits to destroy a Command, and armies meet by round 3-4, so their speed buys little. Watch them in human games; a possible lever is Scout damage 3.

### Rule variants
| Change (balanced mirror) | P1 / P2 / draw % | Median rounds | Doomstar shots | How games end |
| --- | --- | --- | --- | --- |
| **Baseline** | 45.5 / 47 / 7.5 | 17 | 3.0 | Command 58%, Doomstar 34.5%, draw 7.5% |
| Charge 3 | 51 / 45 / 4 | 15 | 3.4 | Doomstar 60.5%, Command 35.5%, draw 4% |
| Charge 6 | 41 / 50.5 / 8.5 | 20 | 2.1 | Command 76%, Doomstar 15.5%, draw 8.5% |
| Doomstar damage 4 | 48.5 / 43 / 8.5 | 19 | 3.0 | Command 73%, Doomstar 18.5%, draw 8.5% |
| Doomstar damage 8 | 51.5 / 47 / 1.5 | 13 | 2.4 | Doomstar 85.5%, Command 13%, draw 1.5% |
| Command HP 10 | 52.5 / 45 / 2.5 | 12 | 2.3 | Doomstar 81.5%, Command 16%, draw 2.5% |
| Contested gunners cannot fire (Round 5 rule) | 50 / 45 / 5 | 17 | 2.7 | Command 61%, Doomstar 34%, draw 5% |
| Fires without crew | 50.5 / 49.5 / 0 | 13 | 3.7 | Doomstar 85.5%, Command 14.5% |
| Stars not contested | 52 / 43.5 / 4.5 | 17 | 2.9 | Command 60%, Doomstar 35.5%, draw 4.5% |
| Player 1 opens with 1 order | 55.5 / 40 / 4.5 | 17 | 2.9 | Command 56.5%, Doomstar 39%, draw 4.5% |
| 3 orders per turn | 41.5 / 48 / 10.5 | 15 | 2.2 | Command 71.5%, draw 10.5%, Doomstar 18% |
| Nova 3.5 / Prism 2.5 move (Round 5) | 42.5 / 45 / 12.5 | 19 | 3.0 | Command 44%, Doomstar 43.5%, draw 12.5% |

What this shows:
- **A two-shot Doomstar kill makes the Doomstar the main way to win.** Doomstar damage 8, or Command HP 10 with the current damage 5, ends 81-86% of games with the Doomstar in 12-13 rounds, with even seats and almost no draws. Games get shorter, about 8-16 minutes by the estimate above.
- **Charge 3 is a milder step:** the Doomstar ends 60.5% of games, in 15 rounds.
- **Avoid charge 6, Doomstar damage 4 and 3 orders per turn.** Each pushes games back toward Command kills and more draws.
- **"Player 1 opens with 1 order" gave Player 1 more wins (55.5/40)**, the opposite of its purpose. Treat it as a bot quirk, not a reason to adopt it; the seats are already even.

### Verdict
The playtest changes fixed the stalling: 7.5% draws, 17-round games, even seats and no dominant play style. Two questions for the owner:
1. **How central should the Doomstar be?** Most wins are still direct Command kills. If the Doomstar should be the main path, the strongest candidate is a two-shot kill (Doomstar damage 8, or Command HP 10). Charge 3 is a smaller step.
2. **Scouts and Novas** barely affect bot results. Check them in human play before tuning.

## Watch these in the AI Arena
Open from disk or via `python -m http.server 8000`:
- `arena.html?p1=balanced&p2=balanced&seed=8&autoplay=1`: Player 2 wins with the Doomstar in round 12.
- `arena.html?p1=balanced&p2=balanced&seed=1&autoplay=1`: Player 2 wins by destroying the Command directly in round 19.
- `arena.html?p1=balanced&p2=balanced&seed=1&autoplay=1&rules={"doomstarDamage":8}`: the same seed with a two-shot Doomstar; Player 2 wins with the Doomstar in round 11.
