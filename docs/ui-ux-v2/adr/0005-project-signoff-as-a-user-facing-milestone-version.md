---
status: accepted-candidate
---

# Project internal Signoff as a user-facing labeled Milestone Version

The target People's Literature Publishing House workflow exposes no Signoff/`签发` step. Editors use `保存为里程碑版本`, provide a label and stated next-use purpose, and receive one immutable exact Deliverable/Manuscript version. For manuscript working state this first creates a Manuscript Checkpoint and Revision when needed. The same user interaction records milestone metadata and a separate internal Signoff Record asserting readiness only for the stated next use. Ordinary UI presents only milestone language. Later edits never inherit the designation, and milestones grant no Delivery, export, factual, or Public Release authority.

## Considered options

- A visible formal Signoff workflow was rejected because it does not match the target institution's editorial practice and adds unexplained approval friction to ordinary version work.
- Treating every `Ctrl+S` or journal state as a milestone was rejected because persistence does not identify a meaningful immutable revision or stated next use.
- Creating only a version label with no separate internal stated-use record was rejected because Delivery Package and workflow evidence still require an exact human decision about which version is ready for a named next use.
- Automatically creating a milestone when a Workflow phase or Task completes was rejected because runtime/phase state cannot choose the editor's meaningful version, label, or intended use.

## Consequences

Editors receive familiar version-history behavior and never learn Signoff jargon, while the domain retains exact checkpoint, milestone metadata, and internal Signoff identities. Implementation must support one atomic user interaction producing separate records, multiple immutable milestones, explicit label/purpose, post-milestone working changes, and Delivery selection of a fixed milestone. Other future Workflow Profiles may project Signoff differently, but the target-house profile has no separate signing screen.
