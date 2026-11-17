# 02 — Scorekeeper page, storage and undo

Status: resolved
Type: task
Blocked by: 01

Build `frontend/src/app/bracket/bags-scorekeeper.component.ts` (+ spec) on top of
`shared/bags-score.ts`, following `../spec.md` (Page section):

- Settings panel (mode, target, bust) editable until the first round is scored, then
  locked, with "New game" to change them.
- Team names, an in/on entry per side with big tap targets (in + on capped at 4), "Score
  round", the large running score, the round history with bust markers, and undo of the last
  round.
- Winner state with "New game" (keeps the names) and the invite to run a tournament on
  Bracketway.
- Persist `{ settings, names, rounds }` to `localStorage` behind `isPlatformBrowser`, in
  try/catch, and restore by replaying. A corrupt value means a fresh game.
- Rules and how-to copy in the template. Door Flyer sheet head and `.ruled` sections, as on
  the blind draw generator.
- Check the first screen at 402x680 in the browser.

## Answer

Done 2026-11-17: `frontend/src/app/bracket/bags-scorekeeper.component.ts` + spec (13 specs).

- Two side-by-side team cards, each with an editable name, the big running score, and
  44px steppers for in the hole / on the board (+ disables at four bags). A line under the
  board previews the round ("Team 1 scores 3 (7 to 4)"), then "Score round N" and Undo.
- Undo drops the last round and puts its bags back in the steppers, so a mistyped round is
  fixed and rescored rather than retyped.
- Settings (mode, play-to, going over) show until the first round, then collapse to a
  one-line summary. "New game" mid-game takes a second tap; after a win it's one tap and
  keeps the names. Lowering the target to or below a 13/15 bust switches the bust to
  "previous score" rather than refusing the target.
- `localStorage` key `bb_bags_game` holds `{ v: 1, settings, names, rounds }`. It's read only
  in the browser and replayed through `scoreGame`; anything invalid starts a fresh game.
- Rules copy (points, cancellation, straight, busting, how to use it) and the tournament
  invite are in the template.

The client route in `app.routes.ts` went in early, to check the page in a browser. Ticket 03
still owns prerendering, `.htaccess`, sitemap, analytics and the footer.

Checked in Chrome at 402x680: the whole tool, through "Score round", fits the first
screen (button bottom at 669 of 678px), no sideways scroll, no console errors. Played a game
to a win, reloaded mid-game and got it back, and started a new game. `npm run test:ci`:
587 passing.
