# V3.2 Psychology-led game-feel update

This update changes presentation and information design, not the Ludo house rules.

## Changes made

1. **Selective anticipation** – the TV dice now adds a short hidden-face hold only for consequential rolls rather than slowing every roll.
2. **Presentation ordering** – automatic token movement is delayed until the TV dice has finished revealing the result.
3. **Capture salience** – captures are deliberately stronger than six celebrations, especially for the victim.
4. **Shared-screen commentary** – the TV now calls attention to strategic states and social events so non-active players have information to watch.
5. **Danger readability** – the server calculates whether a track token can be captured by an opponent on a single future roll and sends that threat state to every client.
6. **Stable progress** – each token tracks cumulative travel. A pre-capture circuit can wrap around the board without making the progress bar appear to move backwards.
7. **Central motion timing** – dice, reveal holds, hops, capture impact, effects and winner timing share the same four speed profiles.
8. **Peak-end emphasis** – the final winner sequence now carries more visual weight and shows champion highlights and standings.
9. **Agency and explanation** – phone token cards state why a token cannot move and warn when it is exposed to capture.

## Progress behaviour

`travel` is cumulative while a token remains in play and is capped for progress scoring at one completed outer circuit. It resets only when that token is actually captured and sent home. HOME-lane and finished-token progress use their true final stages. A permanent capture-unlock component is also included in the player's progress score.

This makes the indicator a **progress measure**, not a claimed probability of winning.
