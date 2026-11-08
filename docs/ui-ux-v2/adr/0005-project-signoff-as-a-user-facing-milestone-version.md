---
status: accepted
amended-by: root ADR 0096 §4.1 (2026-11, Owner #1400 / #1414) — default purpose and generated label, one-click save
---

# Project internal Signoff as a user-facing labeled Milestone Version

The target People's Literature Publishing House workflow exposes no Signoff/`签发` step. Editors use `保存为里程碑版本` and receive one immutable exact Deliverable/Manuscript version. The sheet opens with the purpose 阶段留档 chosen and an empty label saves as 「阶段留档 · 日期 时间」, so one click saves; the editor may change the label, choose 送审候选, 交付候选, 其他 or their own words, and add a note ([root ADR 0096 §4.1](../../adr/0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md#41-the-editors-own-choice-is-the-action)). For manuscript working state this first creates a Manuscript Checkpoint and Revision when needed. The same user interaction records milestone metadata and a separate internal Signoff Record asserting readiness only for the stated next use. Ordinary UI presents only milestone language. Later edits never inherit the designation, and milestones grant no Delivery, export, factual, or Public Release authority.

## Considered options

- A visible formal Signoff workflow was rejected because it does not match the target institution's editorial practice and adds unexplained approval friction to ordinary version work.
- Treating every native Journal Save shortcut (`Ctrl+S` on Windows, `⌘S` on macOS) or journal state as a milestone was rejected because persistence does not identify a meaningful immutable revision or stated next use.
- Creating only a version label with no separate internal stated-use record was rejected because Delivery Package and workflow evidence still require an exact human decision about which version is ready for a named next use.
- Automatically creating a milestone when a Workflow phase or Task completes was rejected because runtime/phase state cannot choose the editor's meaningful version, label, or intended use.

## Consequences

Editors receive familiar version-history behavior and never learn Signoff jargon, while the domain retains exact checkpoint, milestone metadata, and internal Signoff identities. Implementation must support one atomic user interaction producing separate records, multiple immutable milestones, a recorded label and purpose (defaulted, editable), post-milestone working changes, and Delivery selection of a fixed milestone. Other future Workflow Profiles may project Signoff differently, but the target-house profile has no separate signing screen.
