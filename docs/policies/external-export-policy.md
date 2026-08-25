# External Export Policy v1

Status: **active minimum baseline; default deny with one local-filesystem policy-eligibility rule**

The authority-bearing Policy Document is the canonical serialized [`external-export-policy.v1.json`](external-export-policy.v1.json), validated by its policy-specific [`external-export-policy.v1.schema.json`](external-export-policy.v1.schema.json) and selected by the digest-pinned [`active-policy-set.v1.json`](active-policy-set.v1.json). This Markdown file is its human-readable projection. It carries no independent authority; any difference from the canonical JSON is a defect and must be resolved by correcting the projection or issuing a new reviewed policy version, never by silently changing the meaning here.

## Identity and default

- Policy identity: `external-export-policy`
- Version: `v1`
- Lifecycle status: `active`
- Predecessor: none
- Default decision: **deny**

V1 has exactly one policy-eligibility rule. The user must choose one local-filesystem file destination through the platform-native selector, and the exact target object must be either one exact Delivery Package version or one exact Editorial Deliverable Revision. The rule does not cover a mutable package, an unspecified revision, a directory-wide grant, or any other source or target kind.

Network, cloud, and email destination kinds have no allow rule and are explicitly excluded. V1 does not authorize AI7 to implement or mediate any network, cloud, email, remote-send, or other non-local destination.

## Policy eligibility is not Effect authority

A match against the sole rule says only that the exact local-file Effect is policy-eligible. It is not Effect Approval and is not evidence that a file was created or replaced. Each file separately requires this sequence:

1. After platform-native destination and collision resolution, create one frozen Local Export Preparation for the exact target object/version or revision, rendered format, filename, final local path, fidelity disposition, payload digest, create-or-replace disposition, and External Export Policy identity/version.
2. Persist a stable Effect Intent bound to that exact frozen preparation, target, payload digest, and policy version.
3. Obtain exact Effect Approval for that one unchanged Effect Intent before any target commit.
4. Stage the payload before target mutation, perform an atomic file commit, and verify the final local outcome.
5. For that file, persist an Effect Receipt only after verified success; otherwise persist the applicable classified outcome.

Any material target, payload, or policy drift invalidates the Local Export Preparation, Effect Intent, and Effect Approval. A changed final path or create/replace disposition must return through native resolution and create new frozen records. A native apply-to-all choice can cover only the exact currently enumerated colliding files; it is never standing overwrite permission for unseen or future files.

Cancellation is classified as `no-effect`: it creates no attempted file Effect and no Effect Receipt. An Ambiguous External Outcome requires reconciliation and must never trigger automatic retry. A platform response, renderer state, Harness result, tool result, or success toast is not an Effect Receipt.

## Separate authorities and outcomes

A verified local Effect Receipt proves only its exact local file outcome. Local export neither grants nor proves Public Release Permission, sending, delivery, or publication. Delivery Package identity also carries none of those authorities or outcomes. Provider Processing Policy remains separate and cannot authorize this export Effect.

## v1 consequence

This baseline records only the minimum eligibility and safeguards for a future separately authorized local-export implementation. It implements no file operation, renderer or service path, conversion, format choice, native picker, provider call, network destination, or Public Release Permission.

## Authority basis

This projection preserves the canonical JSON's provenance routes: the [Execution context](../domain/execution/CONTEXT.md), [ADR 0007](../adr/0007-separate-decisions-authority-and-effect-proof.md), [ADR 0018](../adr/0018-tiered-activation-for-agent-authored-revisions.md), [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md), [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md), and the [Harness integration contract](../architecture-v2/HARNESS-INTEGRATION.md).
