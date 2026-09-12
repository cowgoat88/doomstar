# Doomstar Playtest Notes

Simulated playtests run by Claude Code on 2026-09-12. Raw numbers are in `sim-results/*.json`; every experiment can be re-run with `python tools/simulate.py --suite <name>` or watched in `arena.html`.

## How the tests were run
- **Bot:** a greedy, one-turn-lookahead player (`ai.js`). Each decision scores every legal move and attack for every unit it may order, using material, Command health, the damage enemies could deal next turn, support from allies, progress toward stars and the enemy Command.
- **Play styles (personas):** Balanced, Rusher (charges the Command), Turtle (defends, avoids exposure) and Star Hunter (plays for stars).
- **Sample size:** 400 games per experiment. With 400 games a win rate is accurate to about ±5 percentage points, so differences under ~5 points are noise.
- **Common seeds:** game *n* of every experiment uses the same random seed, so experiments differ only by the rule being tested.
- **Limits of the bot:** it does not plan more than one turn ahead and it is not a strong player. Treat these results as a map of where to look, then confirm with human games. Where a result looked like a bot quirk rather than a rule effect, it is flagged.

## What is working
- **The core loop is clear and decisive.** Under the prototype rules (Classic), 98% of bot games end with a destroyed Command, in a median of 13 rounds.
- **The armies are fair.** Both sides get the same army rotated 180 degrees, and the Classic balanced mirror is close to even (Player 1 44.5%, Player 2 53.8%).
- **Units read well.** The shapes and colors are easy to tell apart. Roles come through in play: Scouts raid and die (28% lost per game), Lancers do the most damage per unit, and the Command is a real target.
- **The theme and look are strong** and match the "approachable space tactics" goal.

## Bugs fixed during the takeover
| Bug | Effect | Fix |
| --- | --- | --- |
| Prism line-of-sight loop | Selecting a Prism with an enemy at an L-shaped offset (for example 1 across, 2 down) froze the browser tab | New line-of-fire tracer in `engine.js` |
| No game over | Destroying a Command printed a message but play continued | The engine declares a winner and rejects further actions |
| Squashed tokens | Board tiles are buttons and inherited button padding, shrinking units to slivers (the open "board cell sizing" issue) | `button.cell { padding: 0 }` |
| Inert mechanics | Armor, the Orbiter cloak, stars and asteroids had no effect; moves ignored walls | Implemented as rule switches, see Rulesets in `AGENTS.md` |
| Unfair star layout | Prototype-map stars are closer to Player 2 (total distance 36 vs 44) | Added the symmetric `crucible` map |

## What needs help

### 1. In the prototype rules, waiting wins
With every unit acting each turn and no reason to leave home, the side that steps into range first loses units.

| Classic matchup (seats alternate) | Result |
| --- | --- |
| Turtle vs Rusher | Turtle wins 80% |
| Turtle vs Star Hunter | Turtle wins 70% |
| Turtle vs Balanced | Turtle wins 67% |
| Balanced vs Rusher | Balanced wins 63% |

A game where the best plan is "don't move" will not feel fun between two humans. The game needs a reason to advance.

### 2. Moving every unit every turn doesn't feel like chess
In Classic, the bots take about 4.8 unit actions per turn (about 140 per game) and must consider all nine units each turn. That is closer to a wargame than to chess, and it makes turns long for humans. Limiting each turn to 2 "orders" cuts that to about 2 actions per turn.

### 3. Limiting orders without an objective stalls the game
| Big board, no star scoring | Draws (60-round limit) |
| --- | --- |
| Every unit acts | 2% |
| 3 orders per turn | 46% |
| 2 orders per turn | 56% |
| 1 order per turn | 83% |

On the small Outpost map with 2 orders and no stars, 96% of games were draws. Fewer actions make each move matter, but only if there is something to fight over.

### 4. Star points fix stalling but turn the game into a race
Adding star points (first to 12) makes games decisive again, but on the big board almost nobody fights:
- 99% of Orders games end on star points, with only **1.3 attacks per game**.
- Only speed matters. Taking a Scout away from a player shifts the result by about 10 points. Taking away a Guard, Lancer, Orbiter or Prism changes nothing measurable.
- Parking a unit on a star inside the Orbiter's cloaking field makes it immune to ranged attacks; the bot won a narrated game this way without being challenged.

### 5. Star layout decides games
On the prototype map, where stars sit closer to Player 2, star points hand Player 2 **72%** of games. The symmetric crucible map brings it back to 55/45.

### 6. Smaller boards create fights, and a first-move edge
The 11x11 Outpost face-off gets units into contact by round 2 and averages 6-8 attacks per game, but:
- Player 1 wins 68% with 2 orders per turn, and 88% with 1 order per turn.
- **The Prism dominates:** about one kill per Prism per game, and it is lost only 3-5% of the time. Scouts die in 68-76% of games.

### 7. Guards rarely matter
Across every objective-based ruleset, Guards deal 0.02-0.12 damage per game and are almost never lost. Move 1 keeps them out of every fight except a pure siege, where the Turtle uses them well.

### 8. Strategies the bots found
- **Classic:** patience and counter-punching beat aggression (see 1). Rusher mirrors burn through Scouts (91% lost).
- **Orders with star points:** no single play style dominates; every pairing lands between 41% and 59%. Star Hunter beats Turtle 59-41, and Balanced beats Rusher 58-42. That spread is healthy; the problem is that it comes from racing, not fighting.
- **Scout-to-star openings** are the strongest move in any star mode.
- **The Orbiter plus a star** is a defensive lock against ranged units.

### Also noted
- `roster.html` and `make_roster_pdf.py` describe abilities that don't match the rules (armor, cloaking) and don't show armor. Update them once the rules settle.
- Command raids: in Classic a pair of Scouts can walk around the defense to an immobile Command and finish it off (seen in narrated games), because Guards (move 1) cannot get back in time.
- "Command moves 1" looked perfectly balanced on Outpost (49/51), but narrated games show the bot wasting orders shuffling its Command. Treat that result as a bot artifact, not a finding.

## Round 2: candidate fixes
All rows use 2 orders per turn, path movement, armor, the Orbiter field and the symmetric crucible map unless noted. 400 games each, balanced bot mirror.

| Change | P1 / P2 / draw % | Avg rounds | Attacks per game | How games end |
| --- | --- | --- | --- | --- |
| Star points (the `orders` preset) | 55.5 / 44.5 / 0 | 13.9 | 1.3 | points 99% |
| Points, Player 1 opens with 1 order | 46.3 / 53.8 / 0 | 14.5 | 1.6 | points 98% |
| **Points, contested stars** | **49.5 / 50.5 / 0** | 14.4 | 2.7 | points 99% |
| Doomstar instead of points | 56.3 / 43.8 / 0 | 18.1 | 2.6 | Doomstar 78%, Command 22% |
| Doomstar, Player 1 opens with 1 order | 49.5 / 50.3 / 0.3 | 18.5 | 2.8 | Doomstar 80%, Command 20% |
| **Doomstar, contested stars** | **49.3 / 50.8 / 0** | 18.1 | 3.7 | Doomstar 86%, Command 14% |
| Doomstar, charge 4 | 57.0 / 43.0 / 0 | 14.0 | 1.2 | Doomstar 97% |
| Doomstar, charge 8 | 55.8 / 44.3 / 0 | 20.7 | 3.8 | Doomstar 72%, Command 28% |
| Doomstar, Guard moves 2 | 52.0 / 48.0 / 0 | 17.2 | 2.0 | Doomstar 96% |
| Doomstar, Prism moves 2 | 54.8 / 45.3 / 0 | 19.4 | 4.7 | Doomstar 80%, Command 20% |
| Doomstar, Scout moves 2 | 52.3 / 47.8 / 0 | 22.6 | 3.4 | Doomstar 81%, Command 19% |
| Doomstar, 3 orders | 55.8 / 44.3 / 0 | 16.1 | 4.4 | Doomstar 65%, Command 35% |
| Outpost map + Doomstar | 51.3 / 35.3 / 13.5 | 22.3 | 8.0 | Doomstar 86%, draw 14% |
| Outpost + Doomstar, Prism range 2 | 47.5 / 45.0 / 7.5 | 19.9 | 10.2 | Doomstar 86%, draw 8% |
| Outpost + Doomstar, contested, P1 opens with 1, Prism range 2 | 45.8 / 48.3 / 6.0 | 21.1 | 12.2 | Doomstar 91%, draw 6% |

What this shows:
- **Contested stars are the best single fix.** One sentence of rules ("a star doesn't count while an enemy stands next to it") removes the first-move edge and roughly doubles the fighting, because you have to go and push enemies off stars.
- **Doomstar beats plain points.** It keeps one goal (destroy the enemy Command) and makes stars the way to get there, which fits the game's name. Games run a little longer (about 18 rounds) with more combat and some Command kills.
- **Charge 6 is the sweet spot.** Charge 4 turns into a pure race; charge 8 drags on.
- **"Player 1 opens with 1 order"** also fixes the first-move edge, but it isn't needed once stars are contested.
- **Outpost (11x11) has the most fighting but keeps drawing** (6-15% of games) as armies lock up on the cramped board; weakening the Prism to range 2 helps.
- **Still unsolved: combat is thin on the 15x15 board.** Even the best candidate averages under 4 attacks per game, and Guards, Prisms and Orbiters rarely act. The next lever is board size and starting distance (for example 13x13, or armies starting two rows closer), not more rules.

Pacing estimate for Doomstar with contested stars: about 18 rounds is 36 orders per player. At an assumed 10-20 seconds per order, that is roughly 12-24 minutes, inside the 10-20 minute target for experienced players.

## Round 3: stress-testing the Doomstar rules
The best candidate became the `doomstar` ruleset. Re-run with `python tools/simulate.py --suite doomstar --games 400 --parallel 5`.

### No play style dominates
| Matchup (seats alternate) | Result |
| --- | --- |
| Balanced vs Rusher | Balanced wins 63% |
| Balanced vs Turtle | Balanced wins 61% |
| Balanced vs Star Hunter | Balanced wins 54% |
| Rusher vs Turtle | Turtle 53%, even |
| Rusher vs Star Hunter | Star Hunter 51%, even |
| Turtle vs Star Hunter | Star Hunter wins 60% |

Compared with Classic, where the Turtle won 67-80%, waiting no longer wins. The best style is the adaptive, well-rounded one, which is what a game for repeat play should reward. One caution: when *both* players rush, Player 1 wins 62%, so check first-move advantage in aggressive human games.

### Only the Scout matters
Each row removes one unit from one side (baseline: Player 1 wins 49.3%).

| Unit removed | From Player 1: P1 wins | From Player 2: P1 wins | Value of the unit |
| --- | --- | --- | --- |
| Scout | 34.5% | 69.0% | about 17 points of win rate |
| Guard | 54.0% | 48.5% | none measurable |
| Lancer | 50.8% | 50.0% | none measurable |
| Orbiter | 53.8% | 50.3% | none measurable |
| Prism | 51.3% | 48.3% | none measurable |

With only 2 orders per turn, the bot spends them on the unit that can reach and contest stars fastest. A human may use the slower units better, but the pattern is consistent across every star ruleset tested. **The roster is the biggest open problem:** four of the five unit types don't change the result.

## Recommendations
1. **Make "2 orders per turn" the core turn.** It is the biggest step toward chess pacing and short turns. It only works alongside an objective; without one the game stalls into draws.
2. **Use the Doomstar with contested stars as the objective.** It gives one goal (destroy the enemy Command), a 49/51 split, no dominant play style and about 18 rounds. It is now selectable as the `doomstar` ruleset in the game, arena and lab.
3. **Keep maps symmetric.** The original star layout alone swung games to 72/28.
4. **Give the slow units a job before tuning anything else.** Ideas to test next, simplest first:
   - Scouts can contest stars but not hold them (recon, not occupation).
   - Guards move 2 (this already balanced Doomstar at 52/48 and tripled Guard activity).
   - A 13x13 board, or armies starting two rows closer, so Lancers and Prisms reach the fight within the order budget.
   - A Guard ability that interacts with stars, such as "enemies next to a Guard can't hold a star".
5. **Watch the Prism on small boards.** At 11x11, range 3 dominates; range 2 fixed most of it.
6. **Refresh `roster.html` and the PDF** once the rules settle.
7. **Playtest with humans.** Bots can't tell you whether contested stars are intuitive, whether the Orbiter field feels good, or how long a turn really takes. Suggested first session: three hot-seat games on the `doomstar` ruleset, timing each game and noting every rules question asked.

## Round 4: the open Field map
The `field` ruleset plays the Doomstar rules on the tile-free Expanse map: a hidden 45x45 grid, circular ranges, ship footprints and the new Nova. This round used 160 games per experiment, so differences under about 8 points are noise. Re-run with `python tools/simulate.py --suite field --games 400 --parallel 8`.

| Balanced mirror | Tile `doomstar` | `field` |
| --- | --- | --- |
| Player 1 / Player 2 wins | 49.3% / 50.8% | 59.4% / 40.6% |
| Average rounds | 18.1 | 18.9 |
| Attacks per game | 3.7 | 8.6 |
| First kill (round) | 9.5 | 8.2 |
| Ships destroyed per game | 1.5 of 16 | 4.6 of 18 |

What this shows:
- **More fighting in the same match length.** Attacks per game more than doubled and three times as many ships are destroyed, while games still last about 19 rounds.
- **Artillery earns its place.** Each Prism deals 1.9 damage and gets 0.9 kills per game; each Nova deals 2.0 damage, with splash working as intended. Guards now fight too (0.4 damage per game, 24% lost).
- **The first-move edge is back: 59/41.** On tiles, "Player 1 opens with 1 order" fixed the same edge; test it here next.
- **Star Hunter dominates.** It beats Balanced 81-19, Turtle 87-13 and Rusher 60-40. The flank stars are only a couple of Scout moves from each army, so grabbing stars pays better than fighting. Options: move the flank stars farther out, widen the contest reach, or stop Scouts from holding stars.
- **Unit value** (remove one ship from one side; value = average swing in win rate):

| Ship removed | From Player 1: P1 wins | From Player 2: P1 wins | Value |
| --- | --- | --- | --- |
| Nova | 51.3% | 69.4% | +9 |
| Scout | 52.5% | 65.0% | +6 |
| Prism | 63.8% | 61.3% | about 0 |
| Orbiter | 64.4% | 58.1% | about -3 |
| Guard | 65.0% | 51.9% | -7 |
| Lancer | 71.3% | 48.8% | -11 |

  The Nova is now the most valuable ship. Losing a Lancer or Guard appeared to *help* its owner, which is implausible as a rule effect. The likely cause is the bot walking those ships into return fire; the Lancer's move circle (6) and attack circle (6.1) nearly coincide. Confirm at 400 games before changing any stats.
- **Variants:** 3 orders per turn gave 57.5/42.5 with 10.8 attacks and 16.7 rounds. Turning contested stars off gave 62/38, so keep them. A smaller Nova blast (2) changed nothing.

**Verdict:** the Field map delivers the combat the tile board lacked, and every ship type now shows up in the damage numbers. Next: fix the first-move edge, rebalance star placement against the Star Hunter, and re-check the Lancer and Guard with more games.

## Watch these in the AI Arena
Open from disk or via `python -m http.server 8000`:
- `arena.html?rules=doomstar&p1=balanced&p2=hunter&seed=12&autoplay=1`: the recommended rules.
- `arena.html?rules=classic&p1=rusher&p2=turtle&seed=3&autoplay=1`: a Rusher attacking a Turtle under the prototype rules.
- `arena.html?rules=orders&p1=balanced&p2=balanced&seed=2&autoplay=1`: the star race with almost no combat.
