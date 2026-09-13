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
- Playable with a friend over the internet for free (no accounts, no paid services) and comfortably on a phone, alongside hot-seat and vs-bot play.

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
| `tools/run_tests.py` | Runs `tests/engine-tests.html` headlessly (engine tests and online-session tests together). |
| `online.js` | Host-authoritative online session protocol (`Doomstar.Online` -> `window.DoomstarOnline`). No DOM, no networking library; the transport is injected so it can be unit tested with an in-memory loopback. |
| `net.js` | Wraps `vendor/peerjs.min.js` as the transport `online.js` expects: hosts a room under a short code, joins one, reconnects on drop. |
| `vendor/peerjs.min.js` | Vendored PeerJS (MIT, see `vendor/peerjs.LICENSE.txt`) so the game does not depend on a CDN at runtime; only the free public PeerJS signaling server is used at connection time. |
| `README.md` | How to play (hot-seat, bot, online, phone) and how to run the site locally. |

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
- Touch input (`board.js` `wireInput`, `game.js` `handleBoardClick`): a tap sends both the exact ship under the finger and a slack-widened `nearUnit` (`D.unitNear(state, x, y, 0.8)`), since a fingertip lands less precisely than a mouse cursor. Priority is: an exact hit selects or attacks; otherwise a legal move spot nearby starts a tap-to-preview (a ghost marker, "Tap again to move here."), confirmed by a second tap on the same spot; otherwise the nearby ship. A mouse click is unaffected (`nearUnit` equals the exact hit, and a move spot commits immediately, no preview).

## Layout: a persistent HUD, a menu drawer, the board fills the screen on mobile
- **Always visible, at every width:** the `.hud-bar` (turn banner + both sides' Command HP and Doomstar charge, `#turnBanner`/`#objectivePanel`) sits above the board as a single compact row; the status strip (`#statusPanel`) sits directly under it. A player never has to open a menu mid-turn to see game state or the last action's feedback.
- **Everything else lives in the sidebar** (`#sidebar`): Match setup (Player 2, New Match, nav links), Play Online, Roster, How to play/Rules, and (below 1024px only, where the board's own legend is hidden) a compact `.sidebar-legend` copy of the board legend. On a desktop-width screen (>1024px) the sidebar is the plain always-visible left column it has always been. Below 1024px it becomes an off-canvas drawer (`position: fixed`, slid off with `transform`, toggled by the `.open` class), opened by the hamburger `#menuBtn` and closed by `#closeMenuBtn`, the `#sidebarBackdrop`, Escape, or (as a convenience) picking a roster card or starting a new match. It can scroll within itself if its content runs long -- that's an intentional, contained exception to the no-scrolling rule below.
- **The board dominates the screen on a phone, by design.** Below 720px the HUD bar is kept to one compact row (no card padding, the turn pill truncates with an ellipsis, the ships/stars stat rows and ship-icon strip are dropped) rather than stacked, and the board's own legend is hidden (moved to `.sidebar-legend`) -- every one of those is height any narrower design would have handed to chrome instead of the board. **Pitfall already hit once:** `.hud-bar .scoreboard`'s flex-basis is a *width* hint when the HUD bar is a row (the normal case at every width); do not add a rule that turns the HUD bar into a `flex-direction: column` on narrow screens without also zeroing that basis, or the same number gets reinterpreted as a *height* and the score cards balloon to that many pixels tall, crushing the board into a sliver. Prefer shrinking the row's contents (as done here) over stacking it.
- **No scrolling on the main mobile screen:** below 1024px, `.page-shell` is a `100dvh` flex column (`html, body { overflow: hidden }`) and the board (`flex: 1 1 auto; min-height: 0` plus `aspect-ratio: 1` and `max-width/max-height: 100%`) absorbs whatever vertical space is left after the fixed-height header/HUD/status/legend, so it always fits without the page scrolling -- currently 56-72% of screen height depending on device. Below 720px, Fire Doomstar and End Turn additionally move into a bar fixed to the bottom of the screen, with matching bottom padding reserved on `.page-shell`.
- **Testing narrow widths in headless Chrome:** `--window-size` below roughly 500px is not reliable for `--dump-dom`/`--screenshot` in this environment (Chrome silently renders at a ~500px-wide viewport regardless of the requested size, then crops the screenshot to it, which looks like correct layout but is actually a crop of a wider one -- this is exactly how the flex-basis bug above passed an earlier visual check). Load the page in an `<iframe style="width:NNNpx">` inside a wrapper page instead -- the iframe gets its own real browsing context sized by its own CSS, independent of the outer headless window -- and measure `iframe.contentWindow.innerWidth`/`document.documentElement.scrollWidth`/element heights from there. Don't trust a `--screenshot` at a sub-500px `--window-size` as confirmation of anything.

## Online play
- **Model:** host-authoritative peer-to-peer. The host's browser is the only copy of the truth: it runs `engine.js`, validates every action (its own and the guest's, via `applyActionAs`), and broadcasts a full state snapshot after each one. The guest never applies an action itself, only renders whatever snapshot it was last sent -- the two copies cannot drift apart, and rejoining is just "send the latest snapshot". Doomstar has no hidden information, so a full snapshot never reveals anything a legal query couldn't already.
- **`online.js`** (`window.DoomstarOnline`): `createHost`/`createGuest` take an injected `transport` (`{ send, onMessage, onOpen, onClose }`) so the protocol can be unit tested with an in-memory loopback (`tests/online-tests.js`) independent of real networking. Messages (`hello`, `welcome`, `action`, `state`, `reject`, `chat`, `rematch`, `ping`/`pong`) all carry a protocol version `v`. A rejoin presents a token from the previous `welcome`; a mismatched token while someone is already connected is refused as room-full. Rematch swaps which seat the host and guest each hold and starts a fresh game; the seat swap rides on the next `state` message so the guest picks it up without an extra round trip.
- **`net.js`** wraps a vendored PeerJS (`vendor/peerjs.min.js`) as that transport. A room code is the PeerJS peer id `doomstar-` plus 6 characters; Google's free STUN servers are used for NAT traversal. No accounts, no server to run -- only the free public PeerJS signaling server, used solely to introduce the two browsers before they connect directly.
- **Rejoin:** both sides save `{ role, code, data }` to `localStorage` after every update (`data` from `session.snapshotForResume()`); on load, a saved session resumes automatically (matching a `?join=CODE` link's code takes priority over a stale save for a different room). A host re-registers the same peer id and retries on `unavailable-id` for up to 60s (the old id can take a while to free up); a guest reconnects with its saved token.
- **`game.js`** picks one of three modes: hot-seat, vs a bot, or online (`session` set). `isInputLocked()` generalizes the old bot-turn check: locked on the bot's turn, or online when it isn't this seat's turn or the opponent isn't connected. Chat is rendered with `textContent`, never `innerHTML` (it's text from the other player).

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
- 2026-09-12, session 6: play over the internet, free, and on a phone.
  - Engine: `serializeState`/`deserializeState` and `applyActionAs` (a networked guest's actions rejected out of turn before they reach `applyAction`); `unitNear` takes an optional slack for touch hit tests.
  - `online.js` (host-authoritative session protocol) and `net.js` (PeerJS transport), with `vendor/peerjs.min.js` vendored so the game does not depend on a CDN at runtime.
  - `index.html`/`game.js`: an Online panel (host/join, invite link, chat, rematch), rejoin after a refresh or dropped connection via `localStorage`, and a `?join=CODE` link that auto-joins.
  - Phone support: the board comes first below 1024px wide; Fire Doomstar/End Turn move to a bottom bar below 720px; touch taps preview a move and confirm on a second tap, with slack added to ship hit-testing; `button:hover` only applies where a real hover device is present.
  - `tests/test-harness.js` extracted so `tests/engine-tests.js` and the new `tests/online-tests.js` share one results report; `tools/run_tests.py` is unchanged but now covers both.
  - `.nojekyll` and `README.md` added for GitHub Pages.
- 2026-09-12, session 7 (owner: match the mobile GUI to similar games; menus, not scrolling):
  - Pulled the turn banner and scoreboard out of the sidebar into a persistent `.hud-bar` above the board, visible at every width; the status message moved to a strip directly under the board.
  - The sidebar (Match setup, Online play, Roster, How to play/Rules) is unchanged on desktop but becomes an off-canvas menu drawer below 1024px, opened by a hamburger button.
  - Below 1024px the game is a fixed, non-scrolling `100dvh` app screen: the board flexes to fill whatever space is left after the header/HUD/status/legend. The menu drawer and chat log can still scroll within themselves.
  - `board.js`'s `scoreboardHtml` gained `stat-ships`/`stat-stars`/`stat-charge` classes so the compact HUD can hide the secondary rows without touching the desktop sidebar view.

## Workflow
- Change rules only in `engine.js`, and add new mechanics as `DEFAULT_RULES` toggles first so they can be compared in simulation.
- After editing `engine.js` or `ai.js`, run `python tools/run_tests.py`.
- Compare rules with `python tools/simulate.py --suite doomstar --games 200 --parallel 8`; suites are defined in `lab.js`.
- Bot results measure rules as played by a heuristic bot. Use them to shortlist changes, then confirm with human playtests.
- Keep `STATUS.md` current; record design decisions here and findings in `PLAYTEST_NOTES.md`.
