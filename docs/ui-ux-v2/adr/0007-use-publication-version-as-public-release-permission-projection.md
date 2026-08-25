---
status: accepted-candidate
---

# Use “发稿版本” as the user-facing projection of Public Release Permission

The target-house UI uses `设为发稿版本` and `发稿版本` instead of `公开发布候选`, `公开发布许可`, or a generic approval workflow. A Publication Version is a special exact-version designation over one immutable Milestone Version, not a free-form label. The same deterministic interaction creates or links a separately identified internal Public Release Permission bound to that exact version, identified publication scope/public channel, actor, time, and basis. The designation and permission remain distinct records even though ordinary users experience one familiar action.

Ordinary local export neither displays nor requires this interaction and cannot create or imply the permission. A Publication Version means only that its exact content version may be used for the stated publication purpose. It does not authorize an export Effect, prove that a file was sent, or mean that AI7 published anything. AI7 V1 remains local-export-only. Materially changed content requires another exact Publication Version designation; replacement or withdrawal appends history rather than rewriting the earlier record.

## Considered options

- A separate visible Public Release Permission page was rejected because it adds unfamiliar approval language and workflow overhead to the target publisher's ordinary version practice.
- Treating `发稿版本` as only a free-form Milestone Version label was rejected because it would provide no distinct release authority record and could not preserve the frozen Public Release Permission boundary.
- Inferring permission from package preparation, local export, Workflow completion, or an Effect Receipt was rejected because none of those decisions proves that public use was authorized.
- One familiar Publication Version action with separate internal records was accepted because it reduces user burden while preserving exact authority, history, and later extensibility.

## Consequences

The UI must prevent `发稿版本` from looking like `已发布`: exact version, scope, actor/time, basis, and `AI7 不会自动发布或发送` remain available in compact detail. Later material edits show a Publication Version Change Notice and never inherit the designation. Version history preserves earlier publication designations and their internal permission identities. If a later release adds actual publishing or external transmission, it still requires a separate exact Effect Approval and Effect Receipt; the Publication Version record is permission evidence, never execution evidence.

## Later refinement

Root [ADR 0040](../../adr/0040-preserve-post-designation-maintenance-as-versioned-cases.md) assigns Correction, Errata, Supersession, Withdrawal, Reissue and Archive to stable Maintenance Cases with immutable revisions. Correction proceeds through Proposal/Apply/new content revision, Supersession/Reissue references a separately designated newer Publication Version, and Withdrawal/Archive remains internal AI7 status only. The original Publication Version and Public Release Permission remain exact historical records and no maintenance status proves external recall, takedown, delivery or publication.
