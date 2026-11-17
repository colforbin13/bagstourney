# 01 — Pure bags scoring module

Status: resolved
Type: task

Add `frontend/src/app/shared/bags-score.ts` and `bags-score.spec.ts`. No Angular, no
storage: settings + rounds in, game state out.

- `BagsSettings`: `mode: 'cancellation' | 'straight'`, `target: number` (default 21),
  `bust: 'off' | 13 | 15 | 'previous'`.
- `BagsRound`: per side, `in` and `on` (integers, in + on ≤ 4).
- `scoreGame(settings, rounds)` returns per-round results (raw points per side, points
  awarded, score after, which sides busted), the current scores, and the winner (or none).
- Validation: reject or clamp invalid rounds (negative, over 4 bags, non-integer) and any
  round entered after the game is already won.

Rules are in `../spec.md`. The specs must cover at least:

- cancellation: only the difference scores, only the higher side gets it, equal rounds
  score nothing;
- straight: both sides keep their points; both reaching the target in the same round
  (higher total wins, a tie plays on);
- no bust: reaching or passing the target wins;
- each bust option (13, 15, previous) under both modes, including both sides busting in a
  straight round, and an exact hit winning;
- a non-default target;
- replay determinism: the same rounds always give the same state, which is what undo and
  the refresh restore rely on.

## Answer

Done 2026-11-17: `frontend/src/app/shared/bags-score.ts` + `bags-score.spec.ts` (27 specs).
`scoreGame(settings, rounds)` throws a `RangeError` on bad settings, a bad round, or a round
after the win, which is the page's cue to start a fresh game when restoring from storage.
`isValidSettings` also rejects a 13/15 bust at or above the target.

One rule settled while building: a tie on the target under straight scoring goes to
**extra rounds with no bust rule**, until a round leaves the totals unequal. Without that,
two sides tied at 21 under "previous score" could never separate. `GameState.extraRounds`
flags it for the page.

Mutation-checked: removing cancellation, the "previous score" set-back, the tie rule, the
extra-rounds bust exemption, or the four-bag cap each fails at least one spec. Requiring an
exact hit vs. `>=` is an equivalent mutant: a bust already pulls the score back under the
target.
