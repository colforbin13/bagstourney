# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Relationship to the roadmap docs

This repo already tracks work in three root-level markdown files, and they are **not**
the issue tracker:

- `FEATURE_TRACKER.md` — planned work in priority order, shipped work one line each, plus
  an "Evaluated and declined" section. Read it before opening any new issue, so a ticket
  doesn't duplicate or contradict what's planned or re-propose something already rejected.
- `FEATURE_ARCHIVE.md` — full implementation notes and verification history per shipped
  item. Check it for prior art before writing a spec that touches an area again.
- `USER_MANAGEMENT_PLAN.md` — historical design doc for the completed RBAC work.

The split: `FEATURE_TRACKER.md` is the roadmap (what to build, in what order);
`.scratch/<feature-slug>/` is the working queue for a feature that's actually being
specced and broken into tickets. When a tracker item moves into active work, create
`.scratch/<feature-slug>/spec.md` for it rather than expanding the tracker entry in place;
when it ships, summarise it back into `FEATURE_TRACKER.md` and `FEATURE_ARCHIVE.md`.

`.scratch/` is not in `.gitignore`, so issue files are committed alongside the code they
describe. Keep the same hygiene as the rest of the repo: no credentials, no database
config, no deploy paths in issue bodies.

## Issue numbers

There is no global number space. A bare "issue 03" is ambiguous across features — always
refer to a ticket by its path (`.scratch/self-registration/issues/03-approval-gate.md`)
unless the feature directory is already unambiguous from context.
