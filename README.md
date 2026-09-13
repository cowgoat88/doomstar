# Doomstar: Sector Clash

A browser prototype for a quick, one-screen space tactics game. Charge the Doomstar at stars
spread across the map, then fire it from the center to destroy the enemy Command. Plain HTML and
classic scripts -- no build step, no server, no accounts.

## Play

- **Hot-seat**: open [`index.html`](index.html) and pass the device between two players, or set
  Player 2 to a bot.
- **Online, with a friend**: one of you clicks **Host online game** and sends the other the invite
  link (or reads out the room code). It's peer-to-peer -- your two browsers connect directly once
  the free public signaling server introduces them, and no game data passes through any server in
  between. Works on a phone as well as a computer: a first tap previews a move, tap the same spot
  again to confirm it.
- If the connection drops, refreshing the page rejoins the same match automatically.
- **AI Arena** (`arena.html`): watch two bots play. **Balance Lab** (`lab.html`): run batches of
  bot-vs-bot games to compare rule changes. **Unit Guide** (`roster.html`): the printable reference.

## Run it locally

Open `index.html` directly, or serve the folder so relative paths behave exactly like the hosted
site:

```
python -m http.server 8000
```

then visit `http://localhost:8000`.

## Repository layout

See [`AGENTS.md`](AGENTS.md) for the architecture, current rules and design history, and
[`STATUS.md`](STATUS.md) for what's in progress.

## License

The vendored [`vendor/peerjs.min.js`](vendor/peerjs.min.js) is MIT-licensed; see
[`vendor/peerjs.LICENSE.txt`](vendor/peerjs.LICENSE.txt).
