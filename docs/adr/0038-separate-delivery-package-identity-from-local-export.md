---
status: accepted
amended-by: ADR 0096 §4.1 (2026-11, Owner #1400 / #1414) — the native Save choice is the Effect Approval
---

# Separate Delivery Package identity from local export

AI7 versions a Delivery Package as a destination- and format-independent prepared content manifest bound to one exact immutable Editorial Deliverable Revision, optionally identified by an exact Milestone Version, plus its stated purpose, included Editorial Artifacts, applicable gate/signoff references, exclusions, and limitations. Each local export separately creates a Local Export Preparation that binds its format, filename, final path, fidelity disposition, payload digest, create-or-replace disposition, and applicable External Export Policy before exact Effect Approval, followed by one per-file Effect Receipt or classified outcome. The editor's choice of the place in the native Save or folder dialog is that approval: AI7 freezes the preparation against the returned target and records the Effect Approval and receipt in the same step, with no second in-app export confirmation ([ADR 0096 §4.1](0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md#41-the-editors-own-choice-is-the-action)). Changing an export format or destination never mutates or re-versions the package. The package copies no gate, signoff, export, delivery, or publication authority and may be exported repeatedly without becoming proof of sending, handoff, release, or publication.

## Considered options

A format-bound package would require a new package version for DOCX, PDF, or Markdown even when its editorial content was unchanged. A path-bound package would make filesystem placement part of editorial identity. Keeping both concerns in Local Export Preparation preserves one stable content package while retaining exact authority and outcome evidence for every concrete file Effect.
