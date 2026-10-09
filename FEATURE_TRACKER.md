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

Note that **items 12 and 13 are feature complete but not yet earning** — their enforcement
plumbing has been live in production since 2026-08-13/14, and the Stripe billing half was
built 2026-09-08 (see each item's status note). They stay here rather than moving to Done
because nothing has been sold yet: the integration ships disabled until real Stripe keys,
prices and a live-mode webhook endpoint exist, and those are dashboard/business steps
rather than code. Every other item below is genuinely unstarted.

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

**Not yet earning.** The code ships disabled and needs Stripe keys, price ids and a
live-mode webhook endpoint — `docs/stripe-setup.md` is the walkthrough, including the
go-live items that are business rather than code (ToS, refund policy, accepting the Managed
Payments terms). Tax is no longer on that list: Managed Payments handles it.

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

**Not yet earning** — same as item 12: needs keys, prices and a live webhook endpoint. See
`docs/stripe-setup.md`.

Priority note: sequenced right after item 12 since it reuses item 12's gating mechanism
rather than introducing new feature gates of its own, and shares the same
organizer-pays-you billing model that's now the priority entry point for monetization.

### 16. Double-elimination brackets (paid feature)

Let an organizer choose double elimination when creating a tournament. Single elimination
stays the default and stays free; double elimination is gated to the paid tier. Added
2026-08-17 per Matt's request — it's the first *feature* gate for the paid tier, where
items 12/13 gate only a numeric cap, so it's what actually makes a subscription worth
buying rather than just raising a ceiling.

The engine is single-elimination throughout, not by configuration but by structure, so
this is the largest item in the tracker by implementation risk. Scoped below against the
code as it stands.

**Schema.** Three additions, all defaulting to today's behavior:

- `tournaments.format ENUM('single','double') NOT NULL DEFAULT 'single'` — follows the
  existing mode-column pattern (`seeding_mode`, `team_entry_mode`) and leaves every
  existing row on single elimination.
- `matches.loser_match_id` / `matches.loser_match_slot` — the crux. `matches` today has
  exactly **one** forward pointer (`next_match_id`/`next_match_slot`, "where winner
  advances to"). Double elimination needs a second edge for where the loser drops to.
- `matches.bracket_side ENUM('winners','losers','grand_final') NOT NULL DEFAULT 'winners'`
  — `round` alone can't order two trees. `MatchController::bracket()` groups results
  purely by `round`, so a winners round 2 and a losers round 2 would collide into one
  group and render as the same column.

**Backend.** `TeamController::generateBracket()` builds one tree; the losers tree is new
construction, not a variation:

- A losers bracket has 2×(rounds−1) rounds alternating *minor* rounds (losers-bracket
  survivors play each other) and *major* rounds (survivors play a team just dropped from
  the winners bracket). The drop-slot mapping has to be crossed/reversed on alternating
  rounds or teams get an immediate rematch of the game that dropped them.
- **Byes get materially harder.** Today the bracket rounds up to a power of two and byes
  exist only in round 1, handled inline. In double elimination a bye'd team that loses
  later drops into a losers round that may have no opponent waiting, so byes propagate
  into the losers tree as well.
- `cascadePropagate()` places the winner into one slot; it needs to place the loser too.
- **`cascadeClearDownstream()` is where the real bug risk is.** It's a single-pointer walk
  today. With two edges, editing an already-scored match must invalidate the winner's path
  *and* the loser's path — and those paths **re-converge** at the grand final. A naive
  recursive clear across both edges will wipe results in the other tree that never actually
  depended on the edited match. Build the affected set by walking both edges to a fixed
  point and clearing only matches whose current participants are genuinely descendants of
  the edited one. This is silent data-loss territory and needs tests, not a smoke check.
- **Finality detection changes.** `enqueueTournamentFinalizedNotifications()` is called
  from the `next_match_id IS NULL` branch, whose comment states that is "structurally
  always the final". That stops being true: the grand final may need a **reset match** —
  if the team arriving from the losers bracket wins, both sides have one loss and a second
  grand final is played. "No next match" no longer implies "tournament over", so the
  champion and the `status = 'complete'` transition need an explicit rule. Decide whether
  the reset match is always created and skipped, or created on demand.
- `TournamentController::list()`'s `LIST_STATS_SQL` aggregates (total rounds, current
  round, champion) assume a single tree and will misreport on the landing/tournament list.

**Frontend.**

- `bracket-view.component.ts` mirrors one tree into two halves for TV mode with
  hand-computed SVG connector geometry (`mirrorLayout()`, `mirrorConnectors()`). Showing
  a winners tree plus a losers tree is a real layout change, and kiosk mode's auto-fit
  scaling assumes one bracket's natural dimensions. Likely the single biggest chunk of
  frontend work in the item — consider stacked winners/losers sections rather than trying
  to extend the mirrored geometry.
- `roundLabel()` in `shared/bracket-labels.ts` counts back from the end (Final /
  Semifinal / Quarterfinal). It needs losers-bracket naming and grand-final/reset labels.
  That file exists specifically so the bracket view and score-entry screen can't disagree
  about presentation, so both consume the change automatically — but it does mean the
  labelling has to make sense in both places at once.

**Gating.** Reuse the item 12/13 mechanism rather than inventing one:

- A sibling helper to `effectiveParticipantCap()` in `api/middleware/auth.php`, reading
  the same `users.plan` and `tournaments.paid_override` flags. **This can ship before real
  billing exists**, gated on the manual super-admin flags, exactly as the cap enforcement
  did — so it is not blocked on Stripe.
- Enforce server-side at tournament creation *and* again at bracket generation; the
  frontend selector is UX only, per the standing rule that the backend is the authorization
  boundary.
- Format locks at bracket generation, same as `seeding_mode`/`team_entry_mode` — the
  `/how-it-works` page already tells organizers two of the creation choices lock when teams
  are drawn, so this needs adding to that copy and to the create-form hint text.
- **Open question — downgrade semantics.** If a subscription lapses or a super admin clears
  `paid_override` while a double-elimination tournament is in flight, does it keep working?
  Recommendation: **yes** — gate the *choice* at generation time, never the *running
  tournament*. A lapsed card breaking a live bracket mid-event at a venue is the worst
  available failure mode, and the tournament is already built by then.
- **Open question — which paid lever unlocks it.** Item 13's own open question is "which
  limits/features make sense as a one-time per-tournament unlock"; double elimination is
  the natural first answer, since the once-a-year big event is exactly when an organizer
  wants it and exactly who doesn't want a subscription. Suggest both levers unlock it,
  matching how the participant cap already works.

**Testing gap — now closed for single elimination (2026-08-21).** The original note here
said there was no PHP test framework and that `php -l` plus manual smoke tests would not be
enough for losers-bracket routing or the two-edge cascade-clear. That prerequisite has been
built as its own slice, ahead of any double-elimination logic:

- `api/lib/BracketBuilder.php` — bracket *shape* extracted out of
  `TeamController::generateBracket()` as a pure function with no PDO. The controller now
  only persists the returned plan (insert rows, then rewrite array indexes into match ids).
  This is the seam the losers bracket gets added to.
- PHPUnit via `tools/phpunit.phar` and `.\run-php-tests.ps1`, no Composer (production is
  still PHP 7.2). `tests/BracketBuilderTest.php` builds every field from 2 to 64 teams,
  plays each one out, and asserts the invariants: exactly N−1 games for N teams, one
  champion, each team eliminated at most once, every team entered exactly once, forward
  pointers always advancing exactly one round, and seeds 1 and 2 meeting only in the final.
  `tests/BracketPersistenceTest.php` covers the index → id translation with a recording PDO
  double. 23 tests, ~18k assertions, runs in ~20ms.

Double elimination adds its cases to this suite rather than starting from nothing: two
losses to elimination, byes dropping into the losers tree, and re-scoring a winners-bracket
match after the grand final is populated.

**When it ships**, update `AGENTS.md` and `README.md` — both currently describe Bracketway
flatly as a "single-elimination tournament manager", which stops being accurate.

Status: **Feature complete — all 5 slices done (2026-08-21/22).** Double elimination can be
chosen, generated, scored, and rendered. Migration `016` is applied to production and slices
2–3 are deployed; **slices 4 and 5 are built and verified but not yet deployed.**

Slice 4 added the paid-tier gate: `formatRequiresPaidPlan()` +
`tournamentHasPaidFeatures()` / `userHasPaidPlan()` in `api/middleware/auth.php`, reusing
items 12/13's `users.plan` and `tournaments.paid_override` levers (`effectiveParticipantCap()`
was refactored onto the same helper so there is one source of truth). Enforced at the two
moments the scope called for — choosing the format and generating the bracket — and never
while a tournament is being played. Plus the create-form and manage-screen selectors, a
`double elimination` badge, `plan` on the session payload, and `/how-it-works` copy.

One correction to the scope while implementing it: format must **not** lock on team count the
way `seeding_mode`/`team_entry_mode` do. Teams are drawn while a manual-seeding tournament is
still in `setup`, so a double-elimination tournament whose plan lapsed in that window could
neither generate its bracket nor drop back to single elimination — a dead end. It locks on
`status` leaving `'setup'` instead, which is exactly "before the bracket exists".

Slice 5 reshaped the bracket API to group by side then round, fixed champion detection in
`LIST_STATS_SQL` (which found the champion via `next_match_id IS NULL` — in double
elimination that is the *reset*, usually unplayed, so a finished tournament reported no
champion at all), taught `roundLabel()` to qualify both trees and name the grand final and
its deciding match, moved champion detection into the shared `bracket-labels.ts` alongside it,
and rendered the two trees as stacked sections. Single elimination still renders through the
mirrored/column layouts untouched.

The stacked layout is deliberately not an extension of the mirrored geometry, which assumes a
perfect halving tree; the losers bracket halves every *two* rounds. Rows are apportioned from
each round's real match count (which reduces to the same placement for a perfect tree) and
connectors are derived from real `next_match_id` links, since a losers major round takes only
one entrant from the previous round.

**Bug found in testing (2026-08-22, fixed):** `plan` was added to the login payload in
`AuthController::publicUser()` so the UI could unlock paid-tier controls, but the login query
feeding it was left selecting its original column list. The field was therefore always
missing, the fallback reported `free` for every session, and flipping a user to paid had no
visible effect on the create form no matter how many times they signed back in.
`tests/SessionPayloadTest.php` now asserts every field `publicUser()` emits is actually
selected — a structural check, because the failure mode is structural.

**Known follow-up, not blocking:** TV/kiosk mode fits the whole three-section stack correctly
but scales it down noticeably, because stacking triples the height while leaving most of the
width unused. Placing the winners and losers brackets side by side in kiosk mode would roughly
double the on-screen size. Worth doing if double elimination gets real TV use.

Slice 2 (2026-08-21) added migration `016_double_elimination.sql` —
`tournaments.format ENUM('single','double') DEFAULT 'single'`, `matches.loser_match_id` /
`loser_match_slot` (+ self-FK), `matches.bracket_side ENUM('winners','losers','grand_final')
DEFAULT 'winners'`, and `matches.is_reset`. All additive and defaulted, so every existing
row keeps today's behaviour. `TeamController::generateBracket()` now takes a `$format`
argument, branches to the right builder, and writes both edges in one UPDATE; an
unrecognised value falls back to single elimination so a pre-migration row can never be read
as double. `TournamentController` deliberately does **not** accept `format` on create or
update — exposing it before slice 3 would let an organizer build a bracket that score entry
cannot advance.

Sequenced deliberately engine-first rather than schema-first (2026-08-21, per Matt): the
migration's column shape falls out of what the engine actually needs, and migrations here
are append-only files applied to prod, so a guessed shape would cost a corrective migration.
Slice 1 touched no schema and shipped nothing.

Slices 4 (gating + UI) and 5 (two-tree rendering) are described in the status note above.

Slice 3 (2026-08-21) made the match-state machine two-edge aware. `cascadePropagate()` now
places the loser as well as the winner, and stops short of the reset when the winners-bracket
side wins the grand final. `cascadeClearDownstream()` follows both edges with a visited guard
(they re-converge at the grand final) and recurses only where a team was actually withdrawn.
Finality moved out of the `next_match_id IS NULL` rule into `championOf()` — reset winner if
the reset was played, else the grand final's winner but only when the winners-bracket side
took it. `enqueueRoundCompletedNotifications()` is now scoped by `bracket_side`, since round
numbers restart per side and matching on `round` alone would treat winners round 2 and losers
round 2 as one round.

Tested in `tests/MatchCascadeTest.php` against an in-memory SQLite database — the cascade
reads back state it just wrote, which a statement recorder cannot cover. **Validated by
mutation**, which is worth repeating for any future change here: breaking the loser edge in
the clear, removing the loser drop, removing the reset guard, or letting `championOf()` ignore
the reset each fails at least one test.

One correction to the scope's framing, found during that mutation run: a *naive* clear that
walks every downstream edge regardless of state turns out to be **equivalent** to the
data-driven one in any reachable state, because each slot has exactly one feeder and a match
cannot hold a result unless both slots were filled — so nothing downstream survives an
ancestor being withdrawn. The data-driven guards are worth keeping (they stop the walk early
and stay correct if a partially-populated shape ever appears), but they are not fixing a live
bug, and the scope's "silent data-loss territory" warning was aimed at a risk that the
single-feeder-per-slot invariant already rules out. The real regressions to guard against are
the four the mutation battery covers.

What slice 1 settled, which slice 2's migration followed:

- `matches.loser_match_id` / `loser_match_slot` — as scoped. The grand final uses **both**
  edges to feed the reset match (winner into slot 1, loser into slot 2), so the reset needs
  no special-case source plumbing.
- `matches.bracket_side ENUM('winners','losers','grand_final')` — as scoped, plus a flag
  distinguishing the reset from the grand final itself (`is_reset`, or a fourth enum value).
- **The reset match is always created**, answering the open question in the scope above. It
  simply goes unplayed when the winners-bracket side wins the grand final, which is a
  runtime decision, so the builder stays a static structure and persistence stays a
  straight insert of what it returns.
- **Byes turned out to be far less invasive than feared.** Because seeds are contiguous,
  every winners round-1 match has at least one entrant, so every later winners match is a
  real game with a real loser — meaning only winners round 1 can produce byes, and the
  shortfall reaches at most two losers rounds. Losers matches that can only ever receive one
  team are removed outright and their live feeder is rerouted to that match's own target, so
  there are **no run-time walkovers in the losers tree at all**. The two-edge cascade in
  slice 3 does not need to handle them.
- One scoped invariant is **false and should not be asserted**: "no team meets the same
  opponent twice before the grand final" is impossible in double elimination — in a 4-team
  field the losers final is necessarily a rematch of a winners round-1 game. What the
  reversal actually guarantees, and what the suite asserts, is that a team dropping from
  winners round r does not land on the survivor of the losers match its own two feeders fell
  into.

Verified: 38 tests / 45,665 assertions across the three bracket test files, ~80ms. Double
elimination is played out at every field size from 2 to 48 under two scenarios (chalk, and
a losers-bracket win in the grand final), asserting exactly 2N−2 games without a reset and
2N−1 with one, every eliminated team on exactly two losses, one champion, every edge
pointing strictly forward, and no two matches feeding the same slot.

Earlier prerequisite work: the pure-function extraction and PHPUnit harness (see the
testing-gap note above) shipped and was verified against production 2026-08-21.

Verified live against the production database 2026-08-21 via the `run-bag-bracket` stack,
using throwaway private tournaments driven through the real HTTP API at three field shapes
— 5 teams (3 byes), 8 teams (no byes), 9 teams (7 byes). Every persisted row matched
`BracketBuilder`'s plan exactly, including `next_match_id` after the array-index → id
translation. Also confirmed live: playing out gives N−1 games for N teams; re-scoring a
round-1 match in a finished tournament clears the final's winner **and** reopens the
tournament to `active` (the pre-existing status bug fixed by `syncTournamentStatus()`);
replaying re-completes it. All test data hard-deleted afterwards — row counts and max ids
back to baseline, and a SHA-256 fingerprint of every pre-existing row in `tournaments` /
`participants` / `teams` / `matches` was identical before and after, with no orphans left
in `tournament_members`, `audit_log`, or `notification_queue`. **Not yet deployed.**

Priority note: placed after items 12/13 because it's the feature that gives their paid tier
something worth paying for, but it is **not blocked by them** — it can ship against the
existing manual `users.plan`/`paid_override` flags and start earning the moment billing
lands. Placed ahead of items 10/11 since those are the much larger Stripe Connect
marketplace build. Be aware this is a bigger engine change than anything shipped so far;
if it needs to be split, the natural seam is single-elimination-preserving schema and
gating first, then the losers-bracket construction, then the two-tree rendering.

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

### 8. Match scheduling (location and start time)

Let organizers assign a physical location (court, field, lane, etc.) and a scheduled
start time to each match, rather than matches being location/time-agnostic as they are
today.

- Define a pool of locations for a tournament (e.g. "Court 1", "Field A") that matches
  can be assigned to.
- Assign a location and a scheduled start time per match, settable/editable by
  tournament staff.
- Surface the assigned location and time on the public bracket view so participants and
  spectators know where and when to show up.
- Open question: how this interacts with bracket regeneration/re-seeding (item 3) and
  byes — a match's schedule assignment shouldn't need to be redone by hand every time
  the bracket structure changes upstream of it.

Status: Planned — not yet scoped in detail; added 2026-08-10 per Matt's request.

Priority note: a real, directly-requested organizer feature with no dependencies, but
ranked below the monetization chain — per Matt's 2026-08-12 call, no further feature
work beyond hobby scope until monetization has a clear path.

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

## Done

Built and verified. The top entries are **built but not yet deployed** — they've accumulated
since the 2026-08-13/14 `deploy.ps1` run, and the next deploy should carry all of them.
Everything below them is live in production.

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
  change, no migration. Built and browser-verified 2026-08-17; **not yet deployed**.
  [Full notes](FEATURE_ARCHIVE.md#sport-neutral-copy-and-the-sports-page)
- **Score-entry screen, spectator bracket QR, and printable signs** — a scorekeeper screen
  at `/admin/tournament/:id/score` listing only the matches playable right now, a bracket
  QR code spectators can scan to follow along without signing up, and a print-ready venue
  sign at `/poster/:uuid/:kind` for both QRs. Built and
  browser-verified 2026-08-14; **not yet deployed**.
  [Full notes](FEATURE_ARCHIVE.md#score-entry-screen-and-spectator-bracket-qr)
- **Mirrored bracket layout and TV/kiosk mode** — the bracket now plays inward from both
  edges to a final in the middle, halving its height and roughly doubling its width, and a
  new `?kiosk=1` mode scales the whole thing to fill a screen for a TV at the venue. Also
  fixes auto-refresh never actually starting on page load. Phone layout unchanged. Built
  and browser-verified 2026-08-14; **not yet deployed**.
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
