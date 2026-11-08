---
status: accepted
amended-by: ADR 0096 §4.1 (2026-11, Owner #1400 / #1414) — adding or ending an exclusion is one click
---

# Enforce versioned Series Retrieval Exclusions immediately

A Series Retrieval Exclusion is a versioned append-only restriction with an exact member Book, Source Version, stable Series Knowledge Item, or stable knowledge class target plus scope, effective time, and optional reason. An item-targeted exclusion covers that item's current and future revisions, while a class-targeted exclusion covers later matching items. Once effective it refuses every later affected Series-scoped read, including work not yet performed by a queued, authorized, or active Run. The exclusion never rewrites that Run's frozen authorization or already fetched evidence, but the affected Run stops and may continue only through a Plan Revision plus renewed Run Authorization or be cancelled; completed history remains immutable and receives a later impact marker where applicable. Changing or ending an exclusion appends a superseding revision and never restores an old authorization or automatically resumes work.

Adding, changing or ending an exclusion — like adding or removing a Series member — is one editor action: the service computes the impact on future reads, current Runs and completed history at that action, records the revision against it and keeps the impact with the record, without a separate preview to confirm first ([ADR 0096 §4.1](0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md#41-the-editors-own-choice-is-the-action)). The immediate enforcement above is unchanged.

## Considered options

Applying exclusions only to newly authorized Runs would allow material the editor has explicitly restricted to continue flowing through active work. Treating exclusions as per-Task filters would lose the durable Series-level safety boundary. Immediate prospective refusal preserves the editor's current restriction without pretending that already supplied Provider data or historical outcomes can be erased.
