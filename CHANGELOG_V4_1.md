# v4.1 — Synchronous dice display fix

- Host and phone now use the server's `lastRoll.finalFace` / `lastDice` as the single result source.
- Added a deterministic final result face shown after the 3D tumble, so the settled number is identical across different browsers and viewing perspectives.
- The full 3D cube remains visible while rolling; the exact result plate takes over only after landing.
- Dice pip colour is taken from the player who actually rolled, not the player whose turn follows.
- The “rolled N” label is attached to the actual roller rather than the newly active player.
- HTML pages are served with `Cache-Control: no-store` so Render deployments do not leave one device on an older host/controller build.
