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
PSYCHOLOGY_GAME_FEEL_UPDATE.md
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
npm install --registry=https://registry.npmjs.org --no-audit --no-fund
```

Start command:

```bash
npm start
```

Use HTTPS for a public deployment. Keep one server instance unless shared state and a Socket.IO adapter are later moved to Redis.


## V3 presentation and controller model

- The television is the only dice renderer. Phones provide a Roll button and receive the result as text.
- Adjustable Relaxed, Standard, Quick and Turbo animation speeds are synchronised by the server.
- Screen Wake Lock is requested on the host where supported.
- Token hopping, capture return, three-sixes foul, HOME completion and winner effects are host-rendered.
- Completing a token now awards the specified extra turn.
- Phone vibration uses the Web Vibration API where supported. iOS may not expose vibration to web pages; the interface remains fully functional without it.

## V3.3 fairness, pacing and information-design changes

The house rules remain unchanged. This release tightens who can see tactical assistance, makes turns animation-safe, slows the default pace slightly and replaces the shared TV dice presentation.

- Capture-risk assistance is private. The TV never marks exposed tokens and never publishes calculated threat counts. When enabled, only the owner receives a warning on their phone about their own vulnerable token(s).
- The host can switch **Private capture-risk warnings** ON or OFF during the match. The default is ON.
- The host player cards show **HOME lane LOCKED** or **HOME lane UNLOCKED** for every active player, based on the player-wide mandatory-capture gate.
- The server now locks interaction through the full presentation cycle. Rolls move through authoritative rolling, movement/resolution and turn-gap phases before the next roll can be requested. A phone cannot get ahead of the TV animation.
- Standard speed is slightly slower. Relaxed, Standard, Quick and Turbo still scale the same central timing model.
- The TV dice has been replaced by a premium 3D cube with a physical-looking tumble, hop/bounce and exact final orientation for the server-generated result. Phones do not render a competing animated die.
- High-stakes rolls retain a restrained anticipation beat, while ordinary rolls remain comparatively quick.
- Automatic movement still waits for the TV dice presentation, and captures/HOME/foul effects finish before control is released.
- Board Progress remains cumulative across pre-capture track wrapping, so completing a circuit does not create a false progress regression.
- Captures still reduce progress because the captured token genuinely returns to its yard.
- The TV remains a shared public-information stage. Tactical calculations that are not naturally public remain on the relevant player's controller only.
- Phone token cards continue to explain why a token cannot move, including capture-lock, exact-finish and mandatory-capture restrictions.
