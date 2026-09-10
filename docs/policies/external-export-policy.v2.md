# External Export Policy v2

Status: **policy-version lifecycle `active`; repository authority is target-qualified; default deny with one local-filesystem policy-eligibility rule over five exact target kinds, their attached content, and a multi-file folder set**

The authority-bearing serialization of this immutable policy version is [`external-export-policy.v2.json`](external-export-policy.v2.json), validated by its policy-specific [`external-export-policy.v2.schema.json`](external-export-policy.v2.schema.json). Its `lifecycleStatus: "active"` value describes lifecycle inside the policy version only. Repository-level current/canonical authority exists only at an exact integrated `dev` commit that contains this JSON and whose same-tree [`active-policy-set.v5.json`](active-policy-set.v5.json) pin matches its identity, version, path, and SHA-256. On any task branch not yet integrated into `dev`, this record is `accepted-but-unintegrated`.

This Markdown file is the human-readable projection. It carries no independent authority; any difference from the canonical JSON is a defect and must be resolved by correcting the projection or issuing a new reviewed policy version, never by silently changing the meaning here.

The immutable [`v1`](external-export-policy.v1.json) record remains byte-preserved predecessor history under [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §3. It is no longer the selected version; v2 carries its per-file Effect safeguards unchanged.

## Identity and default

- Policy identity: `external-export-policy`
- Version: `v2`
- Predecessor: immutable v1
- Policy-version lifecycle status: `active`
- Default decision: **deny**
- Rules: exactly one, **eligible only**

V2 has exactly one policy-eligibility rule. The user must choose the local-filesystem destination through the platform-native selector, and each exact target object must be one of five kinds, exactly identified:

1. a Manuscript version (an Editorial Deliverable Revision);
2. a Production Document version;
3. a Book Delivery Package version;
4. a Report — a review, an evaluation, or a 审稿意见 ([ADR 0077](../adr/0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md));
5. a database export package — the `导出数据库` target kind of [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §1.7.

The rule does not cover a mutable working state, an unspecified revision, a directory-wide grant, or any other source or target kind. Network, cloud, and email destination kinds have no allow rule and are explicitly excluded: v2 still authorizes no network, cloud, email, remote-send, or other non-local destination.

## Attached content

What may leave with a file is enumerated; anything not enumerated stays.

- **批注** may leave with the target as comments, with their author names. They are included by default and the editor may exclude them (`不含批注`).
- **修改建议** may leave with the target as tracked changes. They are included by default and the editor may exclude them (`不含修改建议`).
- The file-level DOCX content retained with the Source Version may leave with the target: headers and footers, page setup, style sheets, text boxes, and images. It is restored on export; the manuscript surface edits only body text and marks ([ADR 0077](../adr/0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md)).
- **备注 never export.** Retained external sources and Evidence Links do not export in v2. These are hard exclusions, not defaults the editor can override.

## Multi-file exports and reports

A multi-file export — a 图书交付包 as a folder — is covered by one approval over the enumerated file set, with per-file receipts. The set is frozen and enumerated before approval, every member still requires its own frozen Local Export Preparation, and a set or member drift invalidates the approval and requires a new enumerated set. The enumerated set is never standing permission: unseen or future files are not covered, and no native apply-to-all choice may bind beyond the exact currently enumerated colliding files.

Reports export with the manuscript's formats and fidelity rules: DOCX primary, PDF optional, Markdown fallback.

## Policy eligibility is not Effect authority

A match against the rule says only that the exact local-file Effect is policy-eligible. It is not Effect Approval and is not evidence that a file was created or replaced. Every v1 per-file rule is carried unchanged. Each file separately requires this sequence:

1. After platform-native destination and collision resolution, create one frozen Local Export Preparation for the exact target object/version or revision, rendered format, filename, final local path, fidelity disposition, payload digest, create-or-replace disposition, and External Export Policy identity/version.
2. Persist a stable Effect Intent bound to that exact frozen preparation, target, payload digest, and policy version.
3. Obtain exact Effect Approval for that one unchanged Effect Intent before any target commit. For a folder set, the one approval covers exactly the enumerated members, each bound as above.
4. Stage the payload before target mutation, perform an atomic file commit, and verify the final local outcome.
5. For that file, persist an Effect Receipt only after verified success; otherwise persist the applicable classified outcome.

Any material target, payload, or policy drift invalidates the Local Export Preparation, Effect Intent, and Effect Approval. A changed final path or create/replace disposition must return through native resolution and create new frozen records. A native apply-to-all choice can cover only the exact currently enumerated colliding files; it is never standing overwrite permission for unseen or future files.

Cancellation is classified as `no-effect`: it creates no attempted file Effect and no Effect Receipt. An Ambiguous External Outcome requires reconciliation and must never trigger automatic retry. A platform response, renderer state, Harness result, tool result, or success toast is not an Effect Receipt.

## Separate authorities and outcomes

A verified local Effect Receipt proves only its exact local file outcome. Local export neither grants nor proves Public Release Permission, sending, delivery, or publication. Delivery Package identity, Book Delivery Package identity and Report identity also carry none of those authorities or outcomes. Provider Processing Policy remains separate and cannot authorize this export Effect.

## v2 consequence

V2 records the eligibility, attached-content and multi-file rules ADR 0079 §3 decides, over the unchanged v1 per-file safeguards. It implements no file operation, renderer or service path, conversion, format choice, native picker, provider call, network destination, or Public Release Permission. No code reads v2 yet; S64 (#413) implements the export surface and S86 (#434) the database export.

## Authority basis

This projection preserves the canonical JSON's provenance routes: the [Execution context](../domain/execution/CONTEXT.md), [ADR 0007](../adr/0007-separate-decisions-authority-and-effect-proof.md), [ADR 0018](../adr/0018-tiered-activation-for-agent-authored-revisions.md), [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md), [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md), [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §3, and the [Harness integration contract](../architecture-v2/HARNESS-INTEGRATION.md).
