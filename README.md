# Ludo Multiplayer – TV Host and Phone Controllers

A server-authoritative Pakistan-style Ludo game for 2–4 players. The board runs on a television or laptop and each player controls their own colour from a phone.

## Final rules

- Turn order is Yellow → Blue → Red → Green, skipping colours not in the match.
- Four tokens per player.
- Roll 6 to leave home.
- An unusable 6 ends the turn.
- A 6 or capture grants another roll.
- Three consecutive 6s undo the complete turn chain and end the turn.
- START and STOP for all four colours are always safe.
- Capturing sends every opposing token on that square home.
- A capturing token stays locked until the player's overall turn ends, unless it is the only legal token.
- A player must capture at least once before any of their tokens can enter the home lane.
- The mandatory-capture rule has no fallback and tokens continue looping until a capture is made.
- The five-square home lane and final centre require an exact roll.
- Opening boost token choices are automatic except when the bonus roll is 6, where the player chooses Option A or B.
- The match continues for placements. Once only one unfinished player remains, that player is assigned last place automatically.

## Project structure

```text
server.js
package.json
README.md
public/
  index.html
  host.html
  play.html
test/
  integration.test.js
```

## Run locally

```bash
npm install
npm start
```

Open:

- Host board: `http://localhost:3000/host`
- Phone controller: `http://localhost:3000/play`

Phones on the same Wi-Fi use the computer's local IP, for example `http://192.168.1.20:3000/play`.

## Tests

```bash
npm test
```

The integration test checks room creation, secure host control, player session tokens, turn order, late-join rejection and reconnection protection.

## Online persistence

Rooms, game state and player photographs are saved atomically to:

```text
data/rooms.json
```

Set `DATA_DIR` to a durable mounted disk in production:

```bash
DATA_DIR=/var/data npm start
```

For Render, attach a persistent disk and set `DATA_DIR` to its mount path. Without a persistent disk, Render or another host may erase saved rooms when the container is replaced.

Useful environment variables:

- `PORT` – web server port, default `3000`.
- `DATA_DIR` – persistent storage directory, default `./data`.
- `TURN_TIMEOUT_MS` – disconnected player's grace period, default `90000`.
- `ROOM_TTL_MS` – abandoned room retention, default 12 hours.

## Multiplayer protections included

- Private host token required for host commands.
- Private player token required for reconnection and photo uploads.
- New joins blocked after a match starts.
- Live removals become forfeits without changing game indices.
- Disconnected current players are skipped after the grace period.
- Host can manually skip a stuck turn.
- Server-side name, colour and image validation.
- Event and upload rate limits.
- Cryptographically secure dice generation.
- Persistent host recovery after a browser refresh.

## Deployment

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Use HTTPS for a public deployment. Keep one server instance unless shared state and a Socket.IO adapter are later moved to Redis.

## Version 1.1 improvements

- Optional phone vibration alerts for the player's turn, every six, captures, fouls and winners.
- Distinct card-suit identities for the four tokens: A/heart, B/diamond, C/club and D/spade.
- Four live animation speeds controlled by the host: Relaxed, Standard, Quick and Turbo.
- Finishing any token keeps the player's turn and grants another roll; finishing the fourth token ends that player's game immediately.
- Screen Wake Lock support on the host display to reduce TV/laptop dimming during play.
- Stronger token-home and full-winner celebrations.
- No sound effects are included in this version.

Vibration depends on browser support. Android browsers generally support it; iPhone/iPad browsers may ignore vibration requests. Visual alerts remain available on every phone.

The Wake Lock API requires HTTPS, which Render provides. A browser or operating system may still release the lock in low-power mode; the host automatically requests it again when the page becomes visible.
