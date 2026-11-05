# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## How labels are applied in this repo

This repo's issue tracker is local markdown (see `issue-tracker.md`), so there is no
label API. A ticket carries exactly one triage role at a time, written as a `Status:`
line near the top of the file:

```markdown
# 03 — Approval gate for pending registrations

Status: ready-for-agent
```

Applying a label means rewriting that line; removing one means replacing it with the new
role, not deleting the line. A ticket with no `Status:` line is treated as
`needs-triage`.
