# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the first-time organizer.** A volunteer running one fundraiser, party or
company outing who has never run a bracket before. They set the tournament up ahead of
time or at the door, then run it standing up at the venue, on their own phone, while also
greeting people and collecting money. When audiences pull in different directions, this
person's needs win (confirmed 2026-11-16).

Other audiences, all served by the same product:

- **Weekly venue hosts**: bars, breweries and wineries running a blind-draw night every
  week. The highest-value recurring customer.
- **Corporate and social groups** using random teams as an icebreaker.
- **Pickleball clubs and park districts** running drop-in mixers and leagues.
- **Existing leagues** with set teams and organizer-chosen seeding.
- **Players and spectators**, who never sign up: they register from a QR code, follow the
  bracket on their phones, and watch the TV display at the venue.
- **Scorekeepers and managers**, staff the organizer invites to one tournament.

## Product Purpose

Bracketway runs a tournament of two-player teams from sign-up to champion: sign-ups, team
draw, seeding, bracket, and live scoring. It replaces the whiteboard bracket that gets
redrawn every round. Success is an organizer who has never done this going from nothing
to a running bracket in a couple of minutes, and a venue full of people who can see who
plays next without asking.

It is a hobby-scale product being validated commercially: the paid tier is built and
priced, and no further scope gets added until organizers show they will pay.

## Positioning

The easiest way to run a casual or social tournament. Not a tool for serious competitive
circuits; that ground belongs to Scoreholio and is deliberately not contested (no player
stats, handicaps, seasons or ranking systems).

What Bracketway can truthfully claim:

- **Blind draw is the lead mechanism**: solo players are randomly paired into teams, then
  seeded and bracketed in one step. Set teams are supported too, so one tool covers a
  venue's casual night and its league.
- **Nothing to install for anyone.** Players and spectators need no app and no account.
- **Built for one-time organizers**: fast setup, and a one-time single-tournament purchase
  alongside the subscription.
- The pitch against Scoreholio is no-app simplicity and one-off events, **not price**:
  Scoreholio's free plan includes double elimination and 32-team brackets.

**Sport framing** (confirmed 2026-11-16): the app and the home page are sport-neutral, for
any game played by two-player teams. Cornhole and blind draw lead the search and guide
pages. A sport is named once on the home page and nowhere else in the core app.

## Operating Context

- Used at bars, breweries, backyards, school gyms and parks: on a phone, one-handed,
  often outdoors or in dim rooms, with interruptions.
- The venue itself is part of the product: a printed QR sign for sign-ups, a second QR for
  following the bracket, and a TV/kiosk display that auto-refreshes and shows now playing
  and up next.
- Scores are entered by the organizer or a scorekeeper from a screen listing only the
  games playable right now.
- Public brackets are shared by link in group chats and preview with the tournament's name.
- Every public bracket and TV view carries "Powered by Bracketway" and, for signed-out
  visitors, an invitation to run their own. Each tournament markets the product to its
  players.
- Launch geography is local (DuPage County, Illinois), then outward.

## Capabilities and Constraints

- **Teams are exactly two players.** Other team sizes are not supported.
- **Team entry**: blind draw (plain random, or a balanced A/B draw behind an Advanced
  option) or organizer-entered teams. A blind draw currently needs an even number of
  players.
- **Seeding**: automatic, manual, or pool play (Pro).
- **Formats**: single elimination (free), double elimination (Pro).
- **Free**: up to 32 players per tournament, single elimination, live scoring, QR
  sign-ups, posters, TV display, unlimited tournaments.
- **Pro**: up to 256 players, double elimination, pool play, board assignments with an
  up-next queue. $9.99/month or $99.99/year, or $12.99 once for a single tournament.
  Stripe is the price of record and the merchant of record.
- **A lapsed plan never breaks a running tournament.** Paid gates are checked only when a
  choice is made, never mid-event.
- Roles: super admin, organizer, and per-tournament owner, manager and scorekeeper.
- Tournaments are public or private; a private bracket is reachable by anyone holding its
  link.
- Public marketing pages are prerendered static HTML with no server-side rendering at
  runtime, and are baked without API data. Anything search engines must read has to live
  in the template.
- Terminology: **Blind draw** (never "random pairing") in the UI; the paid tier is
  **Pro**; the playing surface is organizer-named (board, court, lane, table, pit or
  field).
- No third-party trackers. The privacy policy promises it, and analytics are self-hosted,
  cookie-free daily counters.
- Undecided: odd-player handling (ghost partner), sponsor logos, best-of-3 finals,
  rotating partners, waitlists and participant entry fees are planned, not shipped. Do not
  describe them as available.

## Brand Commitments

- Name: **Bracketway**, at bracketway.com. The repo's older "Bag Bracket" / "bags" naming
  is internal only.
- "Powered by Bracketway" stays on every tournament, free or paid (decided 2026-10-15).
- Existing assets: the favicon's bracket mark, and the Open Graph card at
  `frontend/src/assets/og-card.png`.
- Voice, as the shipped copy already speaks: plain, short, concrete, organizer-to-
  organizer. Says what is free before what costs money ("Most tournaments never need to
  pay for anything"). No hype, no jargon from competitive play.
- Comparisons are even-handed: the Scoreholio page says when Scoreholio is the better
  pick and states non-affiliation. Competitor facts are re-checked before editing.

## Evidence on Hand

- The product itself: real screens, the free blind draw generator at
  `/blind-draw-generator`, live prices, and the public pages.
- Five seeded example tournaments (created 2026-10-27 by the examples account, user id 5)
  showing different formats. They are made up, and must always be labelled as examples
  and listed apart from real tournaments (`frontend/src/app/shared/examples.ts`).
- **No publishable proof exists yet** (confirmed 2026-11-16): no testimonials, organizer
  quotes, customer or venue logos, event photos, or usage numbers. Nothing has been sold.
  Future work must not invent any of these, nor imply a customer base.

## Product Principles

1. **The first-timer at the door is the test.** If someone who has never run a bracket
   can't do it one-handed at a noisy venue, it isn't done.
2. **Nothing to install, nothing to join.** Players and spectators never need an app or
   an account; any step that adds one needs a strong reason.
3. **Never break a live event.** Billing, plan changes and failures degrade toward the
   tournament continuing.
4. **The obvious path stays obvious.** The plain blind draw and single elimination are the
   default; advanced options are folded away, not removed.
5. **Stay casual.** Features that only serve competitive circuits are declined, even when
   a competitor has them.

## Accessibility & Inclusion

No formal standard has been adopted (undecided). Known needs from the operating context:
touch targets usable one-handed, text readable in sunlight and in dim bars, a TV display
legible across a room, and hints that never depend on hover, since the primary device is
a phone.
