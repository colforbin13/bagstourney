# Free bags scorekeeper page

Started 2026-11-17 from `FEATURE_TRACKER.md` item 24. A public, no-login page for keeping
score of one game of bags, round by round. Frontend only: nothing is saved to or sent to
the server. It doubles as a search landing page ("cornhole score keeper", "bags score
calculator") that ends by inviting the visitor to run a whole tournament on Bracketway,
the same job the blind draw generator does.

## Rules (decided 2026-11-17 with Matt)

- **Points:** a bag in the hole is 3, a bag on the board is 1. Each side throws four bags
  a round, so a side's in + on can't exceed 4.
- **Cancellation scoring, on by default.** Only the difference between the two sides'
  round points counts, and only the side ahead scores it. A toggle switches to straight
  scoring, where both sides keep everything they scored that round.
- **Target score: editable, defaults to 21.**
- **Without a bust rule (the default):** the first side to reach or pass the target wins.
  Under straight scoring both sides can pass it in the same round; the higher total wins.
  A tie goes to extra rounds, played with no bust rule, until a round leaves the totals
  unequal (otherwise two sides tied at the target under "previous score" could never
  separate).
- **Bust rule: off by default, optional.** When it's on, a side has to land on the target
  exactly. A side that goes over it is set back to one of three choices:
  - **13**
  - **15**
  - **Previous score**: the round doesn't count for that side, so their score goes back to
    what it was before the round.

  Under straight scoring each side is checked on its own, so both can bust in the same
  round.
- **Fixed for the game:** the scoring mode, target and bust rule are set before the first
  round and can't change after it. Changing them means starting a new game. This keeps the
  history consistent with the running score.

## Page

- Two teams, named by the players: free text, with team names or bag colours as the hint.
  Defaults are "Team 1" / "Team 2".
- Each round: for each side, a big stepper or tap row for bags **in** (0–4) and bags **on**
  (0–4, capped so in + on ≤ 4), then a single "Score round" action.
- The running score is large and readable outdoors. Below it is the round history:
  round number, each side's in/on, points awarded, the score after the round, and a marker
  on a bust.
- **Undo the last round**, repeatable back to round 1.
- When a side wins: a clear winner state, "New game" (keeps the team names), and the
  invite to run a tournament on Bracketway.
- Phone first and one-handed. Check the first screen fits at 402x680, the iPhone 16 Pro's
  clear area in Safari.
- **Survives a refresh:** the game is kept in `localStorage`, wrapped in try/catch, and is
  only read when `isPlatformBrowser`, because the page is prerendered. A missing or corrupt
  stored game falls back to a fresh one.
- Rules and how-to text live in the template, so search engines see them in the
  prerendered HTML. The page names bags/cornhole outright, which PRODUCT.md allows for
  search and guide pages.

## Shape

- `shared/bags-score.ts`: a pure function from settings plus a list of rounds to the
  scores, per-round results, busts and winner, with exhaustive specs. Undo and refresh then
  come for free: the stored state is just settings + rounds, replayed on load. This mirrors
  how `shared/blind-draw.ts` backs the generator page.
- `bracket/bags-scorekeeper.component.ts`: the page, built on the Door Flyer sheet head and
  `.ruled` sections, like the other Persuade pages.
- Route: `/cornhole-score-keeper` (the search phrase). Wire it in everywhere
  `/blind-draw-generator` is: `app.routes.ts` (with `title` + `data.description`),
  `app.routes.server.ts`, `frontend/src/.htaccess`, `sitemap.xml`, `api/lib/PageView.php`
  `PAGES` (plus `tests/PageViewTest.php`), the name in `admin/traffic.component.ts`, and
  `FOOT_LINKS` in `footer.component.ts`.

## Out of scope

Saving games to an account, sharing a live score, multi-game matches, linking to a
tournament match or feeding scores into one, player stats/PPR, and a home page tab (footer
only for now; revisit if traffic earns it).

## Issues

1. `issues/01-scoring-logic.md`: the pure scoring module and its specs.
2. `issues/02-scorekeeper-page.md`: the page, storage and undo.
3. `issues/03-public-page-wiring.md`: prerender, routes, sitemap, analytics, footer.
