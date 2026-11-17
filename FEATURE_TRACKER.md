# Feature Tracker

Planned work, in priority order, below. Shipped work is summarized in one line each
under Done — full implementation notes, design decisions, and verification history for
each item live in [FEATURE_ARCHIVE.md](FEATURE_ARCHIVE.md). Ideas researched and then
decided against sit under Evaluated and declined, in between the two, so they don't get
re-argued from scratch.

## Planned

Listed in priority order — reordered 2026-08-11 as a preliminary pass, then again
2026-08-12 per Matt: no further feature work beyond hobby scope until there's a clear
path to monetization, and within the monetization chain, prove organizers will pay
before building the harder registration-fee marketplace flow. Expect it to keep
shifting as items get scoped in detail. The numeric labels are stable IDs assigned when
each item was first added, not a priority ranking (this is also why the order no longer
matches numeric order — e.g. item 12 outranks items 5/7/8 despite the higher number).

Note that **items 12 and 13 are live in production** — their enforcement plumbing since
2026-08-13/14, and Stripe billing (built 2026-09-08) with live keys, prices and webhook by
2026-11-16 (see each item's status note and `docs/stripe-setup.md`). They stay here rather
than moving to Done until they have earned: the open question they answer is whether
organizers will pay. Every other item below is genuinely unstarted.

Items 24 and 25 were added 2026-11-17 per Matt, after items 19-23, which keeps their place
in the order: a free scorekeeper page that also brings people to the site, and splitting the
long double-elimination / pool-play bracket page into views.

Items 19-23 were added 2026-10-23 from a comparison with Scoreholio, the best-known
cornhole tournament app, in the order Matt approved. Scoreholio features that serve
competitive leagues (player stats and PPR, handicaps, Swiss and King of the Court formats,
multi-week seasons, custom dashboards) were left out at the time. Since 2026-11-17 PRODUCT.md
treats league features as deferred rather than ruled out: worth revisiting once organizers
show they will pay. "You're up next" alerts, start times (item 8) and entry-fee payments (items 10/11)
were already here.

**Reordered 2026-11-17** while Bracketway is proving organizers will pay (PRODUCT.md).
Items 12 and 13 stay on top, live and earning their place. Then, in order: cheap work that
brings organizers in or fixes a failure at the door (24, 19); work that makes Pro worth
paying for (25, 20, 21); items that wait until an organizer asks (23, 8, 22, 5); and the
registration-fee marketplace (10, 11), held until subscriptions show organizers pay. League
features such as item 22 are deferred, not ruled out, per PRODUCT.md. Double elimination
(16) moved to Done; configurable team size (7) moved to Evaluated and declined.

### 12. Freemium tiers with usage limits

Gate some features/limits behind a free vs. paid tier, as a monetization lever for
organizers who don't want to charge participants a registration fee.

- Starting point per Matt: caps on tournament size — number of teams/participants per
  tournament — as the free tier's limit, with a paid tier raising or removing it.
  `ParticipantController::MAX_PARTICIPANTS_PER_TOURNAMENT` (64, added for item 6's
  self-registration abuse mitigation) is a related existing constant, though it's an
  abuse guard rather than a tier boundary today — worth checking whether it should
  become the free-tier ceiling or stay separate.
- Other candidate gates to consider once the first limit is proven out: number of
  concurrent/active tournaments per organizer account, number of staff/managers per
  tournament (Toornament, a competitor, gates this at 3/10/unlimited admins by tier), or
  paid-only features (item 8's match scheduling, item 3's direct team entry, custom
  branding).
- Needs a plan/tier concept on the `users` table and recurring billing to charge for an
  upgrade. Unlike item 10/11's registration-fee flow, this is a plain single-merchant
  Stripe Checkout subscription — the organizer pays the platform directly, no Connect,
  no routing money to third parties, no participant-refund entanglement — so it's a
  materially smaller integration to stand up first.
- **Decided 2026-08-12: both account-level and tournament-level.** Per Matt, an
  organizer subscription (this item) raises the cap on every tournament they own, and a
  one-time per-tournament unlock (item 13) works independently — a free-plan organizer
  can still unlock a single big event without subscribing. Free-tier cap set at **32
  participants**; paid tier raised to a fixed **256** ceiling (not literal-unlimited, to
  bound roster growth/abuse) — both per Matt.
- **Enforcement plumbing built and live-verified 2026-08-12, ahead of real billing.**
  No payment integration exists yet (per Matt: "let's get the plumbing going before
  worrying about payment"), so both levers are super-admin-settable manual flags for
  now — `users.plan` (`free`/`paid`) and `tournaments.paid_override` (boolean) — added
  by migration `013_freemium_participant_caps.sql`, standing in for what Stripe will
  flip automatically once item 10/12/13's billing ships. `effectiveParticipantCap()` in
  `api/middleware/auth.php` computes the effective cap (paid if *either* flag is set)
  and is enforced at all three places a participant can be added: organizer manual add
  (`ParticipantController::create()`, previously **uncapped** entirely), public
  self-registration (`ParticipantController::selfRegister()` — this supersedes and
  replaces the old, separate 64-participant self-registration-only abuse cap from item
  6), and direct team entry (`TeamController::createDirect()`, previously also
  uncapped). `TournamentController::update()` only lets a genuine `super_admin` set
  `paid_override` — an owner/manager reaching the same endpoint cannot self-grant it.
  Frontend: `/admin/users` has a Plan column (super-admin-editable), and
  `TournamentManageComponent` shows a participant-count/cap badge to any staff role
  plus a super-admin-only override toggle.

Status: Plumbing done — migration applied to the production database and enforcement
live-tested against it 2026-08-12 via the `run-bag-bracket` local stack (backed up
`users`/`tournaments` first). Verified on a throwaway tournament: 32 participants
succeed, a 33rd is correctly blocked with the plan-limit message; a non-super-admin
owner attempting to grant their own `paid_override` correctly gets 403; a super admin
granting it raises the cap to 256 and unblocks the 33rd; removing the tournament
override and instead setting the owner's account `plan` to `paid` independently raises
the same tournament's cap, confirming the two levers are genuinely independent as
designed; test tournament and its 33 participants fully deleted afterward, `users`/
`tournaments` row counts confirmed back to baseline. `php -l` clean, 182/182 frontend
tests passing (10 new), `npm run build:prod` clean, `git diff --check` clean. **Deployed
to the production host 2026-08-13/14** by the full `deploy.ps1` run that shipped the email
provider split — the enforcement half is now live, not just applied to the production
database.

**Billing half built 2026-09-08** (shared with item 13 — see the Stripe billing note under
that item for the whole design, since one integration serves both levers). For item 12
specifically: a `mode=subscription` hosted Checkout session, monthly and/or annual, whose
lifecycle events set and clear `users.plan` automatically. `users.plan_source` is the new
piece that makes automation safe — Stripe may only revoke a grant Stripe made, so a
super-admin comped account is never downgraded by a cancellation. Cancel/update-card lives
in Stripe's hosted billing portal rather than in our UI.

Two judgement calls worth knowing: a `past_due` subscription **keeps** the plan (Stripe is
still retrying the card, and cutting an organizer off mid-dunning — possibly the evening of
their event — is worse than carrying them through the retry window), and a lapse never
touches tournaments the organizer already owns, matching the standing rule that the gates
read the plan only at the moment of a *new* choice.

**Live by 2026-11-16.** Testing, validation and live-mode setup are complete, and
production runs with live Stripe values. `docs/stripe-setup.md` holds the walkthrough and
the history, including the business steps (ToS, refund policy, the Managed Payments terms).
Tax is Stripe's: Managed Payments handles it.

Priority note: promoted to the front of the monetization chain on 2026-08-12 — the
simplest payment integration of the four monetization items (single merchant, no
marketplace payouts/KYC), making it the fastest way to validate that organizers will
actually pay before committing to item 10's much bigger build.

### 13. One-time per-tournament paid upgrade

Let an organizer pay a one-time fee to unlock premium features/limits for a single
tournament, as an alternative to item 12's recurring subscription — modeled on a
competitor (Toornament)'s "Boost" tier, a one-time per-tournament purchase alongside
their monthly-subscription tiers.

- Fits an organizer who runs one big local event a year and doesn't want an ongoing
  subscription, versus item 12's tiers which assume repeat/ongoing usage.
- Likely shares most of its plumbing with item 12 (whatever gets built to gate
  features/limits by tier needs an "unlocked" state either way) — the difference is
  billing model (one-time charge on a specific tournament vs. a recurring plan on the
  organizer account), not the feature gates themselves. Also a plain single-merchant
  Stripe charge, same as item 12 — no Connect/marketplace complexity.
- Open question: which of item 12's candidate limits/features make sense as a one-time
  per-tournament unlock vs. only being worth it as a recurring subscription.

Status: Plumbing done, same as item 12 (see its status note for full detail) — the two
were built and live-verified together 2026-08-12, since they share one gating mechanism
(`effectiveParticipantCap()`) and one migration (`013_freemium_participant_caps.sql`).
This item's specific lever is `tournaments.paid_override`, confirmed independent of item
12's account-level `users.plan` (either one alone raises the cap).

**Billing built 2026-09-08.** One Stripe integration serves both items, since they differ
only in billing model, exactly as this item predicted. Single merchant, hosted Checkout —
no card data reaches the server, so there is no PCI surface. Hand-rolled against Stripe's
REST API rather than the SDK, per Matt: `AGENTS.md` asks for Composer to be raised before
being added, and with hosted Checkout the only security-critical code is webhook signature
verification, which is ~30 lines and now sits in `api/lib/StripeSignature.php` with its own
test battery.

**Merchant of record: Stripe Managed Payments** (decided 2026-09-08). Stripe handles sales
tax/VAT/GST in 80+ countries, fraud, dispute liability and buyer support, for 3.5% above
standard processing (~6.4% + $0.30 on a US card). Two things settled the call: at validation
volume the surcharge is single-digit dollars a month, against compliance work that is
unbounded and fails silently; and **existing subscriptions cannot be migrated to Managed
Payments later**, so it is much cheaper to adopt before the first subscriber than after.
Toggled by `BB_STRIPE_MANAGED_PAYMENTS` (defaults true — off silently makes *us* merchant of
record, so the default deliberately fails in the loud direction). The integration shape is
unchanged: same Checkout Sessions API, same webhooks. `applyManagedPayments()` adds
`managed_payments[enabled]` and strips `invoice_creation`, which Stripe forbids because it
issues receipts itself. Rejected: standard + Stripe Tax, which charges for calculation while
leaving registration, remittance and filing with us — the tedious half.

Shape of it:

- `api/lib/StripeSignature.php` — HMAC verification of the `Stripe-Signature` header. This
  is the *entire* access control on the webhook endpoint, which is necessarily public.
- `api/lib/BillingIntent.php` — pure translation of an event into what it means. It
  deliberately never decides *whose* plan to change; it returns Stripe's identifiers and
  `BillingController` resolves the target from rows we wrote ourselves, so metadata echoed
  back in a request is corroboration rather than authority.
- `api/services/StripeClient.php` — curl wrapper, same shape as PostmarkClient/BrevoClient.
- `api/controllers/BillingController.php` + `/billing/*` routes.
- Migration `017_stripe_billing.sql` — `plan_source`/`paid_override_source` (who granted
  it), Stripe ids on `users`, and `billing_checkouts` / `billing_events` for reconciliation
  and webhook idempotency.
- Frontend: `billing.service.ts`, `/admin/billing`, and an "Upgrade this tournament" button
  on the manage screen for owners.

Answering this item's open question — *which limits/features make sense as a one-time
unlock* — the answer is both existing ones, unchanged: the 256-participant cap and double
elimination. That falls out of reusing `tournamentHasPaidFeatures()` rather than inventing
a third entitlement concept, and matches item 16's recommendation that both levers unlock
double elimination.

Three design points worth not re-deriving later:

- **Fulfilment happens twice, idempotently.** Stripe's redirect back and Stripe's webhook
  race, and either can win; relying on the webhook alone means an organizer who just paid
  lands on an unchanged page. Whichever arrives second is a no-op.
- **A refund revokes only what Stripe granted**, and only on a *full* refund. A partial
  refund can only have been issued by hand in the dashboard, so it is left for a human
  rather than guessed at.
- **The `billing_events` row is claimed before processing**, keyed on Stripe's event id, so
  at-least-once delivery cannot double-grant. A row left in `error` is deliberately
  reprocessable, so a transient failure heals on one of Stripe's three days of retries.

**Live by 2026-11-16** — same as item 12: live keys, prices and webhook are in place. See
`docs/stripe-setup.md`.

Priority note: sequenced right after item 12 since it reuses item 12's gating mechanism
rather than introducing new feature gates of its own, and shares the same
organizer-pays-you billing model that's now the priority entry point for monetization.

### 24. Free bags scorekeeper page

A public helper page for keeping score of one game of bags, round by round. Two teams are
named by the players (team names or bag colours), each round they enter how many bags went
in the hole and how many landed on the board for each side, and the page works out the
round's points and the running score. Everything stays in the browser: no account, nothing
saved, nothing sent to the server.

- Doubles as a marketing page, like the blind draw generator: a free tool that people find
  by search ("cornhole score keeper", "bags score calculator") and that ends by inviting
  them to run a whole tournament on Bracketway.
- Bags scoring to settle before building: in = 3, on = 1, and with the usual cancellation
  scoring only the difference between the two sides counts each round. The game goes to 21.
  Open questions: offer straight (non-cancellation) scoring as an option; whether to support
  a "bust" rule (going over 21 drops you back, a common backyard variation); whether the
  target score is editable.
- Phone first, one-handed, readable outdoors: big tap targets for each count, the running
  score large, a round history below, and an undo for a mistyped round. Should survive a
  page refresh mid-game (browser storage only).
- Prerendered and in the sitemap like the other marketing pages, so the instructions and
  rules text are in the HTML for search engines. Needs an entry in `PageView::PAGES`, the
  footer's sheet-foot index (`FOOT_LINKS`) and the home page's tabs if it earns a place there.
- Sport naming: PRODUCT.md keeps the core app sport-neutral but lets search and guide pages
  lead with cornhole, so this page can be about bags by name.

Status: Planned — added 2026-11-17 per Matt. Small, frontend only.

### 19. Odd player handling (ghost partner)

Today a blind draw refuses an odd number of players (`TeamController::draw()`), so the
organizer has to turn someone away or find a 'filler' at the door, the worst moment of the
night. Scoreholio solves it with a "ghost": the odd player gets a placeholder partner.

- Likely shape: an option at the draw when the count is odd, adding a ghost participant
  who is paired like anyone else. Their team plays a person short (the real player throws
  both turns, the common house rule), or the organizer swaps in a real player later.
- Alternative: the organizer joins as the extra player. Cheaper, but doesn't help an
  organizer who can't play.
- Open questions: does a ghost team count toward the plan's player cap; how it's labelled on
  the bracket; whether `BlindDraw::pair()` should avoid putting the ghost with an A player
  in a balanced draw.

Status: Planned — added 2026-10-23 from the Scoreholio comparison. Small.

Priority note: first of the Scoreholio-derived items because it fixes a real failure at
the venue for every blind draw, free tier included.

### 25. Split the bracket page into views for double elimination and pool play (Pro)

In double elimination, and more so with pool play in front of it, the public bracket page
is very long: pool standings and rounds, then the winners bracket, losers bracket and grand
final stacked one under another. A spectator has to scroll a long way to find their game,
and in TV mode everything is scaled down to fit one screen, so each part is hard to read.

- On the bracket page: a row of buttons (pool play, winners, losers, finals; or by round)
  that shows one part at a time at full width, defaulting to whichever part is being played
  right now. Single elimination without pool play keeps today's single view.
- In TV mode: cycle through the same parts on a timer, each at full screen width, so every
  part is readable from across the room. Open questions: how long each part stays up; whether
  to skip finished parts; whether the boards / up-next panel stays fixed on every view.
- Builds on what's there: `bracket()` already returns the bracket grouped by side
  (`sides`), and `bracket-view` already lays each side out separately (`sideLayouts()`), so
  this is mostly a presentation change. Pool play renders through `PoolStandingsComponent`.
- Related, found 2026-11-16: the double-elimination example in TV mode at 1080p renders the
  bracket very small under the boards panel, with much of the screen unused.
- Free tournaments (single elimination, no pool play) are unaffected, so this only ever
  appears for tournaments using Pro formats.

Status: Planned — added 2026-11-17 per Matt. Medium, frontend only.

### 20. Sponsor logos on the bracket and TV view (Pro)

Board sponsors are how fundraisers raise money, and the fundraiser guide
(`/cornhole-fundraiser`) tells organizers to sell them. Show sponsor logos on the public
bracket and in TV mode, so a sponsor's sign is on the screen everyone watches.

- Upload a few images per tournament (size and type limits; stored on disk or in the DB,
  to decide), shown in a strip on the bracket and rotating in TV mode.
- Scoreholio gives one logo free and unlimited on its top plan. A Pro feature here, with
  maybe one logo free, fits our tiers.
- "Powered by Bracketway" stays regardless (decided 2026-10-15).

Status: Planned — added 2026-10-23. Small, apart from the first image upload in the app.

### 21. Best-of-3 finals

Scoreholio offers best-of 3/5/7 brackets. The common ask is narrower: play the final (or
semifinals and final) as best of three.

- A per-tournament setting for which rounds are best-of-3. A match then records games won
  per side (and optionally each game's score), and the winner is first to two.
- Touches the score-entry screen, the bracket display and `MatchController`'s completion
  rule; the cascade only needs "who won", so it should be untouched.
- Open question: in double elimination, does the grand final reset also become best-of-3.

Status: Planned — added 2026-10-23. Small to medium.

### 23. Sign-up cap with a waitlist

Organizers cap a fundraiser at a number that fits their boards and time slot. Today a full
tournament refuses new sign-ups; a waitlist would queue them instead, and promote the next
one when someone drops out. Scoreholio has waitlists on its top plan.

- Builds on self-registration's `pending` state (item 6): a capped tournament puts extra
  sign-ups on a waitlist, shown to the organizer in order.
- Open questions: is the cap the organizer's own number or only the plan cap; does the
  waitlist promote automatically or wait for the organizer; notify the promoted player by
  email if they gave one.

Status: Planned — added 2026-10-23. Medium.

### 8. Match scheduling (start times)

Board assignments, the first half of this item, shipped 2026-10-16 (see Done). What remains
is clock-based scheduling: a planned start time per game, for leagues and events that run
to a timetable rather than to board availability. Bar nights don't, which is why boards
came first.

- Open question: how a timetable interacts with the board queue (a game with a start time
  shouldn't be put on a board early), and with bracket regeneration and byes.
- A "You're up on Board 3" email or text through the existing notification system is a
  natural follow-up to boards, deliberately left out of v1.

Status: Planned — the board half is done; start times not yet scoped.

### 22. Rotating partners (Switcholio-style)

Players get a new partner every round and are ranked individually, which is what weekly
winter leagues and social nights run on. Scoreholio's version is "Switcholio". Also item 6 of
the marketing plan ("rotating partners").

- Needs per-player standings (wins, point differential) — Bracketway has only team
  results today — and a round generator that avoids repeat partners and opponents.
- Could reuse pool play's round generation (`api/lib/PoolPlay.php`) with players instead
  of teams. Optional finish: the top players by standings go into a bracket.
- This is the first real "league" building block, and the feature that gives bar and
  brewery outreach something concrete to offer.

Status: Planned — added 2026-10-23. Large.

### 5. Revisit default participant notification settings

Reconsider the current defaults for the score-notification email feature (item 1) now
that it's live, rather than treating the initial ship as final.

- All three categories (match completed, round completed, tournament finalized) default
  to **on** the moment a participant confirms their email — worth revisiting once there's
  real usage/feedback on whether that's the right default mix, or whether it's too much
  email for a casual local tournament.
- Email content/tone is currently minimal (plain subject + short body) — worth a pass
  once real recipients have seen a few of them.
- Sending domain has since moved off the bare `irishguys.org` to `bracketway.com`
  (observed 2026-08-12 while verifying item 9) — worth confirming DKIM/Return-Path/DMARC
  are actually verified on the new domain in Postmark, not just assumed, since that
  migration doesn't seem to have been tracked anywhere when it happened. **Confirmed on
  the Brevo side 2026-08-13** (`authenticated: true, verified: true` via DNS); the
  equivalent check against Postmark is still outstanding.
- Bulk sending moved to Brevo 2026-08-13, so the "is this too much email?" question now
  has a hard ceiling attached: the free tier allows 300/day, and a full 32-participant
  tournament uses roughly half of that. Revisiting the default category mix is now a
  cost question as well as a UX one.

Status: Planned — no urgency, revisit after the feature has been live for a bit and
there's actual participant feedback to act on rather than guessing upfront.

Priority note: low-cost, low-urgency polish — worth slotting into a quiet moment rather
than dedicating a planning cycle to it.

### 10. Payment provider integration for tournament registration fees

Let an organizer charge participants a registration fee to enter a tournament, with the
money going to that organizer rather than staying with the app.

- Nothing payment-related exists in the codebase today — no provider SDK, no fee/amount
  fields on `tournaments`/`participants`, no webhook handling. This is greenfield, unlike
  item 9's email verification which can reuse the existing Postmark/double-opt-in work.
- Open question: since fees need to reach individual organizers rather than one house
  account, this likely needs a marketplace-style integration (e.g. Stripe Connect) rather
  than a single merchant account — a materially bigger integration than a normal
  checkout, and probably the biggest driver of scope here.
- Open question: how this gates participant self-registration (item 6) — does payment
  happen before a participant lands `pending`, at organizer-approval time, or is it
  decoupled from the roster entirely? Also need a refund story for a rejected or
  withdrawn participant.
- Open question: who sets the fee amount and who absorbs the processor's cut — organizer
  sets a flat per-tournament fee, does the platform take an additional percentage, is it
  passed through untouched?
- Card data must never touch our servers directly — use the provider's hosted
  checkout/Elements rather than collecting card fields ourselves, to stay out of PCI
  scope.

Status: Planned — added 2026-08-11 per Matt's request. Not yet scoped; needs a provider
choice and answers to the open questions above before implementation.

Priority note: deferred behind items 12/13 as of 2026-08-12 — this is the biggest,
riskiest build in the whole tracker (Stripe Connect-style marketplace payouts, KYC per
connected organizer account, refund handling tied to the participant roster), and it's
worth proving organizers will pay for the platform at all (via 12/13's simpler
integration) before investing in the harder participant-fee revenue-share model. Item 11
is still fully blocked on this shipping first.

### 11. Platform transaction fee on registration fees

Take a percentage of the registration fees organizers collect through item 10's payment
integration, as an additional monetization mechanism alongside item 12/13.

- Fully dependent on item 10 shipping first — there's no fee to take before there's a
  payment flow collecting money. Not meaningful to scope in detail until the provider
  and account model (e.g. Stripe Connect) from item 10 are decided.
- Likely implemented via the payment provider's built-in application-fee mechanism
  (e.g. Stripe Connect's `application_fee_amount` on a destination charge) rather than a
  separate invoicing step, so the platform's cut is taken automatically at the same time
  the organizer gets paid.
- Open question: flat percentage vs. tiered by volume vs. flat fee per registration.
- Open question: whether the fee is shown to participants as an add-on at checkout or
  silently absorbed out of what the organizer receives.
- Open question: Toornament (a competitor) explicitly markets "paid registrations, no
  fee!" on its pricing page — they monetize via subscription/one-time tournament unlocks
  (see items 12/13) instead of skimming registration fees, and use "no fee" as a selling
  point. Worth deciding deliberately whether a transaction fee is still the right lever
  here versus leaning more on items 12/13, rather than assuming it by default.

Status: Planned — added 2026-08-11 per Matt's request. Blocked on item 10; no further
scoping useful until then.

Priority note: sequenced right after item 10 since it's a small add-on once payments
exist; both now sit behind items 12/13 in the overall order (see item 10's priority
note).

## Evaluated and declined

Ideas that were researched in enough depth to make a call, then decided against. Kept
here so they don't get re-litigated from scratch — each entry records what was found and,
crucially, **what would have to change for the answer to flip**.

### 17. Pinball tournament support

Adding pinball as a supported tournament type alongside the existing bag-toss/two-player-team
formats. Researched 2026-08-18 per Matt; **declined the same day.**

#### How pinball tournaments actually work

The format landscape is nothing like a bracket sport. Events are near-universally
**two-phase** — a long qualifying phase producing a leaderboard, then a short finals phase —
and essentially all the variety lives in qualifying:

- **Match play** (most common) — groups of 4 on one machine, points by finishing position.
  Competing scoring schemes: IFPA `7/5/3/1`, PAPA `4/2/1/0`, Pinburgh `3/2/1/0` (three-player
  groups get their own variants). Repeats for N rounds, **regrouping players by live standings
  each round**.
- **Knockout / strikes** — groups of 4, bottom finishers take a strike, out at 3. Variants:
  fair strikes (`0/1/1/2`, out at 5), progressive (`0/1/2/3`, out at 9).
- **Best game / card-based (PAPA-style)** — solo play, best score per machine ranked against
  the field. No opponents at all.
- **Pingolf** — each machine has a par score, count balls used to reach it, low strokes wins.
- **Flip Frenzy** — continuous 1v1 queue, no synchronized rounds, unequal game counts per player.
- **Round robin / head-to-head** — small fields only.

Finals are seeded brackets (often **4-player group elimination** — top 2 of 4 advance — not
1v1), ladders (bottom 4 seeds play, low score out, next seed enters), or Pinburgh-style group
play. A finals "match" is normally best-of-3/5/7 *games spread across different machines*, with
the higher seed choosing machine or play order.

Two forces shape all of it:

1. **Machines are the scarce resource.** Every format is fundamentally a scheduling problem —
   assign players to machines without collisions and balance so nobody repeats a game. First-class
   concern, not a detail.
2. **IFPA TGP.** World ranking points (WPPRs) scale with how many meaningful games each player
   plays, so organizers design formats backwards from a game-count target, and results must be
   submitted to IFPA within 45 days to count for anything.

#### Why this is a second engine, not a feature

Every core assumption in the current model is wrong for pinball:

- `teams` is hardcoded to exactly two members (`participant1_id`/`participant2_id`, both
  `NOT NULL`) — pinball is singles. Overlaps item 7, but item 7's "3s and 4s" framing doesn't
  cover it either; pinball needs *one* player per competitor and 3–4 competitors per match.
- `matches` has exactly two sides with one integer score each. Pinball needs 3–4 players per
  match, each carrying both a raw machine score *and* a derived placement point value.
- `TeamController::generateBracket()` (`api/controllers/TeamController.php:389`) builds the whole
  single-elimination tree once, up front, from fixed seeds. Match play rebuilds every round's
  groupings from live standings — there is no tree to generate.
- No machine/venue entity, no standings table, no notion of a match containing multiple games.

Minimum viable pinball support:

1. Player-based competitors (generalize `teams` or add a parallel singles path).
2. A `match_players` join table — `match_id`, `player_id`, position, `raw_score`, `points` —
   replacing the two-column layout.
3. A machines/arenas table plus a per-round assignment algorithm that balances players across
   machines.
4. Multi-game matches (a match becomes a container of 2–4 games on different machines).
5. **A standings engine** — running points/strikes per player plus the pairing logic that derives
   round N+1 from standings. This is the real work and shares nothing with existing code.
6. Configurable scoring schemes (IFPA/PAPA/Pinburgh) as data.
7. Strike tracking and elimination for knockout.
8. IFPA player IDs and a results export — non-negotiable for any TD who wants a ranked event.

The one transferable asset is the score-entry screen and QR flow (see Done) — player self-entry
of scores is exactly what pinball wants. Everything in the bracket path would sit unused.
Realistically a ground-up second tournament type sharing only auth, users, and the item 12/13
freemium plumbing; months, not a sprint.

#### Competitive landscape

**Match Play Events** (app.matchplay.events, running since 2015) is the de facto standard and is
not a soft target:

- ~20 formats covering every one listed above, plus arena banks, series/leagues, RSVP and
  registration, wait lists, player-submitted scores, live player-facing standings, and Scorbit +
  Pinball Map integrations.
- **Official IFPA partnership** — pulls IFPA player IDs via API, seeds by IFPA ranking, and IFPA
  actively recommends it for specific formats. IFPA is also routing other apps' results through
  Match Play's ratings system.
- Pricing: **free tier covers the popular formats and up to 32 players**; $50/yr Premium unlocks
  11 premium formats, series, and registration; $30/yr player tier; $75/yr patron tier.

That free tier is the disqualifying detail: 32 players free is *exactly* the free cap set in
`013_freemium_participant_caps.sql`. The entire paid proposition here is something a stronger
incumbent already gives away.

Also in the space: **Brackelope** (iOS — knockout, single/double elim, random doubles, multi-arena),
**Neverdrains DTM** (best-game/card-style niche), **Scorbit** (backbox hardware streaming live
scores into Match Play and DTM), plus legacy PAPA Scoring Software.

Market size, for the record — IFPA sanctioned **14,038 events in 2025** (+10% YoY), **42,936**
unique active players, **318,576** total attendances. Healthy growth, but if even a third of those
TDs pay $50/yr that's the whole addressable pool, and Match Play owns it.

#### Decision

**Declined.** The moat isn't features, it's the IFPA integration plus the fact that every TD's
history, ratings, and muscle memory already live in Match Play. Brackets — the thing this codebase
is good at — are the least important part of a pinball tournament. Directly contrary to the
2026-08-12 rule that no feature work happens beyond hobby scope without a clear monetization path;
this would be the largest build in the tracker aimed at the most defended niche.

**What would flip this:** the one real gap is **spectator/venue display**. The TV/kiosk mode and
printable QR posters (see Done) are unusual, and Match Play's strength is the organizer/player
*phone* experience, not the big screen in the bar. If that were ever pursued, the shape is a
companion display that *reads from* Match Play — selling to its users rather than replacing it —
which is a much smaller build and requires none of the eight engine pieces listed above. Still a feature rather
than a product, so it needs its own monetization answer before it becomes an item.

### 7. Configurable team size (beyond 2 participants per team)

Support tournaments where a "team" isn't always exactly 2 participants — other
bag-toss/cornhole-adjacent formats, or other sports/game types entirely, may use
singles, 3s, 4s, or a variable roster size per team.

- Touches `teams.participant1_id`/`participant2_id` (currently `NOT NULL`, hardcoded to
  exactly two), the notification feature (item 1, which addresses "the 4 participants of
  that match"), and the custom-team-name-participant display (item 2) — all three
  currently assume exactly 2 participants per team.

Status: Planned — deliberately deferred out of item 3 (added 2026-08-10) rather than
solved there. Item 3's direct team entry keeps the 2-participants-per-team invariant on
purpose, specifically to avoid this scope. Revisit as its own item once there's a
concrete format that needs a different team size.

Priority note: ranked last — no concrete tournament format needs this yet, so it's
speculative scope until one does. Pinball was evaluated 2026-08-18 as a candidate driver
(it needs singles, i.e. one participant per competitor) but was declined on competitive
grounds — see item 17 — and would have required a separate engine regardless, so it
doesn't unblock or justify this item.

**Declined 2026-11-17.** PRODUCT.md makes two-player teams a fixed product truth: the blind
draw, the positioning and the copy all rest on it, and no format in the audience needs a
different size. **What would flip this:** a paying segment that needs another team size, for
example singles or threes at a club already on Pro, enough to justify reworking the
two-participant team model and everything built on it (blind draw, notifications, name
display).

## Done

Built and verified. Everything below is live in production as of the 2026-11-16 `deploy.ps1`
run, which shipped the whole current build. New entries go at the top, marked **not yet
deployed** until the next deploy carries them.

- **Door Flyer follow-ups** (2026-11-16) — the flyer now covers every public page: How it
  works, Pricing, Sports, the generator, the fundraiser guide and the comparison print a green
  sheet head and end on a green "sheet foot" (closing line and action, the other pages as
  ruled rows, legal links), which replaced a tear-off strip that read as a second footer. A
  plain-language pass took out em dashes, stock phrases and three lines implying customers
  that don't exist yet ("two-player teams" everywhere). Every described page now previews
  with the share card (`og:image` + Twitter card). The How it works tour video was re-rendered
  in the new look. All of that deployed 2026-11-16. **Not yet deployed:** the example brackets
  moved into their own band under the start page's steps, named for what each shows; How it
  works and Pricing link to them; an example's bracket page says "In progress", never "Live".
  [Full notes](FEATURE_ARCHIVE.md#door-flyer-follow-ups)

- **New look: "The Door Flyer"** (2026-11-16) — replaced the cream, brick-red and Bebas Neue look, which read as
  generic. Green sheet header on every screen, white pages, black type in one typeface (Archivo), pink for
  "Live" only, square corners, sentence case throughout (round names are now "Winners round 1", "Grand
  final"). The home page is rebuilt as a flyer: a working example sign-up sheet that draws teams, and a strip
  of tear-off tabs. Seeded example tournaments (owned by user id 5, `shared/examples.ts`) are listed apart as
  "Example brackets" and labelled on their bracket page. New share card, sourced from
  `frontend/scripts/og-card.html`. Emails moved to the new palette, and match/round emails now name rounds
  like the bracket ("Winners round 2", not "Round 2"; `api/lib/RoundLabel.php`). No migration. Product and
  design records are `PRODUCT.md` and `DESIGN.md`. Finish review: ship. Deployed 2026-11-16.
  [Full notes](FEATURE_ARCHIVE.md#new-look-the-door-flyer)

- **Traffic page for super admins** (2026-10-23) — Admin → Traffic: visits per day, top
  pages, where visits came from (referring site or a `?utm_source=` tag), and organizer
  activity (signups, tournaments, players, Pro subscribers) from the real tables. Self-hosted
  instead of Google Analytics: no cookies, no IPs, daily totals only, so the privacy policy
  only needed one sentence. Bots, admin screens and signed-in super admins aren't counted.
  Migration 022. [Full notes](FEATURE_ARCHIVE.md#traffic-page-for-super-admins)
- **Bracketway vs Scoreholio page** (2026-10-23) — `/scoreholio-alternative`, an even-handed
  comparison for the "Scoreholio alternative" search: a side-by-side, when each is the better
  pick, a not-affiliated line. Scoreholio facts checked October 2026 from their site and docs
  (`CHECKED` in the component); re-check before editing. Notable: Scoreholio's free plan
  includes double elimination and 32-team brackets, so the pitch is no-app simplicity and
  one-off events, not price. Prerendered, in the sitemap; not in the footer. Frontend only.
- **Cornhole fundraiser guide** (2026-10-23) — `/cornhole-fundraiser`, the first marketing
  guide page: planning timeline, format choices, entry fees and sponsors, equipment, sign-ups,
  running the day, then a sign-up CTA. Prerendered, in the sitemap, linked from the footer.
  Timed for winter, when schools, churches and clubs plan spring fundraisers. Frontend only.
- **Balanced (A/B) blind draw** (2026-10-18) — an opt-in "Advanced" option on the Team Entry
  card: the organizer taps players to mark them A, and the draw pairs every A with a random B
  so weak players can't end up together. Uneven groups still draw (extras pair within their
  group). The plain random draw stays the default and the option stays folded away. Also in
  the free generator as two lists. Free on every plan. Migration 021.
  [Full notes](FEATURE_ARCHIVE.md#balanced-ab-blind-draw)
- **Free blind draw generator** (2026-10-18) — `/blind-draw-generator`, a public no-login
  tool: paste names, draw random two-player teams, see the seeded bracket with byes, copy the
  teams, then "Run it live" leads to sign-up. Runs entirely in the browser; prerendered with
  how-a-blind-draw-works copy so it can rank, and linked from the footer. Same day: the
  prerendered pricing page now carries the Pro prices ($9.99/mo, $99.99/yr, $12.99 one
  tournament). Marketing handoff item 3. Frontend only.
  [Full notes](FEATURE_ARCHIVE.md#free-blind-draw-generator)

- **Prerendered public pages for search** (2026-10-17) — `/`, `/how-it-works`, `/pricing`,
  `/sports` and the three legal pages are now built as finished HTML with their own title,
  description and canonical link, so search engines can read and rank them; the app takes
  over in the browser and swaps in signed-in content. Plus `sitemap.xml` and `robots.txt`.
  Static files only, no Node server. **Deploy note:** `.htaccess` changed (new fallback
  shell `index.csr.html`), so deploy the whole build, not just changed files. Marketing
  handoff item 4, first step. [Full notes](FEATURE_ARCHIVE.md#prerendered-public-pages-for-search)

- **Sign-up invite in the footer** (2026-10-16) — signed-out visitors see "Run your own
  tournament free" above "Powered by Bracketway" on every page, linking to organizer sign-up,
  so each public bracket and TV view invites its players and spectators to run one. Hidden for
  signed-in organizers and in print. First share-loop step from the marketing handoff (item 1);
  "Powered by Bracketway" stays on every tournament, paid or free. Frontend only.

- **Board assignments** (2026-10-16, item 8) — the organizer sets how many boards the venue
  has, and each playable game goes to the next free board automatically as boards open up:
  earliest round first, never a team on two boards, never a later pool round before an
  earlier one. A game keeps its board until it has a result. Score entry lists games by board
  with a "Move to board" control for staff (scorekeepers included); the public bracket shows
  "Board N" on live games and a Now playing / Up next panel, also on the TV view. Works for
  pool play and both bracket formats. Pro, checked only when turning boards on or changing
  the count. Organizers pick what to call them (board, court, lane, table, pit or field;
  free on any plan). **Migrations 019 and 020.** [Full notes](FEATURE_ARCHIVE.md#board-assignments)

- **Pool play to set bracket seeds** (2026-10-15, item 18) — a third seeding mode, Pro only
  like double elimination. Every team plays 2 to 5 pool games (default 3) in a round robin
  cut off after that many rounds (no rematches; an odd field gives one team a bye each
  round), and the standings become the bracket's seeds. Ranked by win %, then point
  differential per game, points scored per game, head-to-head for a two-way tie, then a
  stable random draw. The tournament is Live during the pool; everyone advances; pool
  results lock once the bracket is generated. Standings show on the manage screen, the
  public bracket page and the TV view. Pool games live in a new `pool_matches` table
  (**migration 018**). [Full notes](FEATURE_ARCHIVE.md#pool-play-to-set-bracket-seeds)

- **Fast blind-draw setup** (2026-10-15) — organizers can paste a whole list of names into
  the manage screen instead of adding players one at a time: one per line, a spreadsheet
  column or row, or a single comma-separated line, with list numbers and bullets stripped.
  The box shows a live count, flags names already on the roster (skipped, not doubled) and
  warns on an odd total; it opens by default while the roster is empty. New
  `POST /participants/bulk`, parsing in `api/lib/NameList.php` (15 tests, mirrored by
  `shared/name-list.ts` for the preview). The random-pairing mode is now labelled
  **Blind draw** in the UI to match what organizers search for. No migration.
  [Full notes](FEATURE_ARCHIVE.md#fast-blind-draw-setup)

- **16. Double-elimination brackets** (2026-08-21/22, Pro) — an organizer can choose double
  elimination: a losers bracket, a grand final and a reset match when the losers-side team
  wins it. Single elimination stays the free default. The engine work is in
  `api/lib/BracketBuilder.php` and `MatchController`'s cascade, gated by
  `formatRequiresPaidPlan()` at the two moments a format is chosen or a bracket generated,
  never mid-event. Migration `016`. Listed under Planned until 2026-11-17 by oversight.
  [Full notes](FEATURE_ARCHIVE.md#16-double-elimination-brackets-paid-feature)
- **Link previews for shared bracket URLs** (2026-08-22) — sharing a bracket link in
  iMessage, Slack or WhatsApp previewed as an unlabelled "Bracketway" for every tournament,
  because the app is a single-page app served from one static `index.html` and none of those
  crawlers run JavaScript. `/bracket/...` is now rewritten to `api/preview.php`, which serves
  the same shell with per-tournament Open Graph/Twitter tags injected and the generic
  `<title>` replaced. Tag-building is pure (`api/lib/LinkPreview.php`, 15 tests); the shim
  fails safe to an untouched `index.html` on any error, so a preview problem can never take
  the bracket page down. `og:image` is a static brand card generated once with GD from the
  favicon geometry and Bebas Neue — production needs neither GD nor the font. Private
  tournaments are described like public ones, per Matt: the link already grants full access,
  so withholding the name would protect nothing. Verified end to end against the production
  database through a local mirror of the deployed URL layout.

- **Sport-neutral copy and a `/sports` page** — the public copy no longer describes
  Bracketway as a bag-toss tool ("boards"/"throws" gone from the hero, landing steps, and
  `/how-it-works`); the hero now says "tournament manager for two-player teams", names six
  example games once, and links to a new public `/sports` page listing 21 games across
  yard, racket, bar, and partner-card groups. Copy and one new route only — no backend
  change, no migration. Built and browser-verified 2026-08-17; deployed by 2026-11-16.
  [Full notes](FEATURE_ARCHIVE.md#sport-neutral-copy-and-the-sports-page)
- **Score-entry screen, spectator bracket QR, and printable signs** — a scorekeeper screen
  at `/admin/tournament/:id/score` listing only the matches playable right now, a bracket
  QR code spectators can scan to follow along without signing up, and a print-ready venue
  sign at `/poster/:uuid/:kind` for both QRs. Built and
  browser-verified 2026-08-14; deployed by 2026-11-16.
  [Full notes](FEATURE_ARCHIVE.md#score-entry-screen-and-spectator-bracket-qr)
- **Mirrored bracket layout and TV/kiosk mode** — the bracket now plays inward from both
  edges to a final in the middle, halving its height and roughly doubling its width, and a
  new `?kiosk=1` mode scales the whole thing to fill a screen for a TV at the venue. Also
  fixes auto-refresh never actually starting on page load. Phone layout unchanged. Built
  and browser-verified 2026-08-14; deployed by 2026-11-16.
  [Full notes](FEATURE_ARCHIVE.md#follow-on-mirrored-bracket-layout)
- **Landing content and richer tournament list on the main page** — `/` now shows a hero,
  how-it-works strip, and feature row to every visitor (a new `/tournaments` route, which
  the signed-in nav links to, is the bare list), and the tournament list
  itself groups Live/Setup/Completed with team counts, round-and-match progress, and the
  champion for finished tournaments (new aggregates on `GET /tournaments`). Also adds
  player-facing instructions to the self-registration page (random pairing, approval
  gate, email double opt-in) and fixes its gate to match the backend's. Rounded out with
  organizer onboarding: hint text on the create form's mode choices (previously
  touch-invisible `title` tooltips), a mode-aware setup checklist on the manage screen,
  and a public `/how-it-works` walkthrough. Committed as 27fe2ae; browser-verified
  against production data 2026-08-14.
  [Full notes](FEATURE_ARCHIVE.md#landing-content-and-richer-tournament-list-on-the-main-page)
- **15. Super-admin audit log viewer** — the `audit_log` table had been written to since
  the RBAC work but had no read path at all; adds a super-admin-only `GET /audit-log`
  (searchable, filterable by action, sortable, paginated) and an `/admin/audit-log` page
  behind `superAdminGuard`. No migration — a new read endpoint only. Deployed and verified
  live against production 2026-08-13/14.
  [Full notes](FEATURE_ARCHIVE.md#15-super-admin-audit-log-viewer)
- **14. Daily digest for organizers with pending self-registration approvals** — one
  batched email per organizer per day listing every tournament they own or manage that has
  participants waiting on approval, so an ignored sign-up keeps resurfacing instead of
  going unnoticed. Piggybacks on the existing 3-minute notification cron via a new
  `scheduled_jobs` table (migration `014_scheduled_jobs.sql`) rather than a second crontab
  entry. Deployed and verified live against production 2026-08-13/14.
  [Full notes](FEATURE_ARCHIVE.md#14-daily-digest-for-organizers-with-pending-self-registration-approvals)
- **Email provider split — bulk mail moved to Brevo** — bulk notification mail now sends
  via Brevo's free tier (300/day) while fail-closed auth mail stays on Postmark; adds
  quota-aware retry parking so a 429 can't silently drop a tournament's mail. Deployed and
  verified live against production 2026-08-13/14. [Full notes](FEATURE_ARCHIVE.md#email-provider-split--bulk-notification-mail-moved-to-brevo)
- **9. Prevent bot/abusive organizer self-registration** — public organizer registration
  now requires clicking an emailed verification link (account created `disabled` until
  then) instead of being instantly active; deployed and verified live against
  production 2026-08-12. [Full notes](FEATURE_ARCHIVE.md#9-prevent-botabusive-organizer-self-registration)
- **Tournament soft-delete and recovery** — deleting a tournament now sets `deleted_at`
  instead of cascading a hard delete; a super admin can list and restore deleted
  tournaments from the new Deleted Tournaments admin screen. [Full notes](FEATURE_ARCHIVE.md#tournament-soft-delete-and-recovery)
- **Role-based access and tournament permissions** — super admin/organizer/manager/
  scorekeeper roles, tournament ownership and staff management, capability-aware
  frontend. Detailed plan: [USER_MANAGEMENT_PLAN.md](USER_MANAGEMENT_PLAN.md). Full
  notes: [FEATURE_ARCHIVE.md#role-based-access-and-tournament-permissions](FEATURE_ARCHIVE.md#role-based-access-and-tournament-permissions)
- **2. Display participant names for custom-named teams** — bracket and score-entry
  views show muted participant names beneath any team name that's been customized from
  its generated default. [Full notes](FEATURE_ARCHIVE.md#2-display-participant-names-for-custom-named-teams)
- **4. Public and private tournament visibility** — tournaments can be public or
  private, with a stable UUID as the access grant for the public bracket URL; also
  closed a real bypass where several tournament-scoped endpoints had no visibility
  check at all. [Full notes](FEATURE_ARCHIVE.md#4-public-and-private-tournament-visibility)
- **1. Participant score-update email notifications** — double opt-in match/round/
  tournament-finalized emails, sent by a cron worker with per-category kill switches;
  live in production. Originally shipped on Postmark; bulk sending moved to Brevo
  2026-08-13 (see the email provider split above). [Full notes](FEATURE_ARCHIVE.md#1-participant-score-update-email-notifications)
- **6. Participant self-registration** — a public per-tournament registration link lets
  attendees add themselves as pending participants for organizer approval before the
  draw, with abuse mitigations sized to a single in-person event. [Full notes](FEATURE_ARCHIVE.md#6-participant-self-registration)
- **3. Configurable team entry and seeding** — organizers can choose manual vs.
  automatic seeding and auto-draft vs. direct team entry per tournament, shipped in two
  phases; deliberately keeps the 2-participants-per-team invariant (see item 7).
  [Full notes](FEATURE_ARCHIVE.md#3-configurable-team-entry-and-seeding)
