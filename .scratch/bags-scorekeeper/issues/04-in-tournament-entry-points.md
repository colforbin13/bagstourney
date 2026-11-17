# 04 — Make the score keeper easy to find during a tournament

Status: resolved
Type: task
Blocked by: 03

Players at an event never see the marketing pages, so the only link (the sheet foot) misses
them. Add the link where players actually look:

1. **Board panel on the public bracket page:** a "Keep score" link on each now-playing
   board, opening `/cornhole-score-keeper?a=<team>&b=<team>` with both names filled in.
   Hidden in TV mode (`large`), where nobody can tap it.
2. **Quiet footer:** "Score keeper" in the link row, so every bracket page, the sign-up
   page and the working screens carry it.
3. **Sign-up confirmation** (`/register/:uuid`): one line after "you're on the list".

The scorekeeper reads `a`/`b` only in the browser (never while prerendering) and then
clears them from the address bar, so a reload or a later rename isn't overwritten. Names
that differ from the saved game's start a fresh game, keeping the saved settings (a
group's house rules). The same names resume the saved game, so tapping the link again
mid-game loses nothing. The names are already public on the bracket, and PageView drops
query strings.

Still out of scope: sending a result back to the bracket.

## Answer

Done 2026-11-17, narrowed per Matt to items 2 and 3. **No board link:** the bracket page
serves any doubles game, the score keeper only knows cornhole, and PRODUCT.md keeps the app
sport-neutral, so Matt chose to skip it rather than gate it on the venue label. With no
board link there is nothing to prefill, so the `a`/`b` query parameters were not built
either. (The board panel is Pro-only anyway, so free tournaments would never have seen it.)

- Quiet footer: "Score keeper" after "Blind draw generator" in the link row, so every
  bracket page, the sign-up page and the working screens carry it.
- Sign-up confirmation: "Keeping score? Try our free score keeper." Neutral wording: the
  app doesn't name a sport, the page it opens does.

Verified: footer and sign-up specs updated (28 passing), full `npm run test:ci` 588 passing.
