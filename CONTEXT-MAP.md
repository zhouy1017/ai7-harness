# Context Map

## Contexts

- [AI7 Editorial](./docs/domain/editorial/CONTEXT.md) — Book, manuscript, source, revision, proposal, and publication language.
- [AI7 Execution](./docs/domain/execution/CONTEXT.md) — Task Intent, Task Skill, Task Ledger, Run, authority, Effect, command, continuation, and exact Harness Session binding language.
- [Deferred Word Integration](./docs/domain/word-integration/CONTEXT.md) — intentionally empty contingency context; Word is outside Standalone-only V1 and has no promoted domain terms.

## Cross-context policy documents

- [Learning Eligibility Policy](./docs/policies/learning-eligibility-policy.md) — current design baseline for material-selection authority, bounded automation, revision evidence, and rollback.
- [Factual Verification Policy](./docs/policies/factual-verification-policy.md) — current design baseline for factual-evidence authority, provenance, independent verification statuses, and conflict handling.
- [Provider Processing Policy v2](./docs/policies/provider-processing-policy.v2.json) — canonical serialization of the immutable v2 successor; see its [own human projection](./docs/policies/provider-processing-policy.v2.md) and [policy-specific schema](./docs/policies/provider-processing-policy.v2.schema.json). Immutable [v1](./docs/policies/provider-processing-policy.v1.json) remains predecessor history with its unchanged [projection](./docs/policies/provider-processing-policy.md) and [schema](./docs/policies/provider-processing-policy.v1.schema.json).
- [External Export Policy v1](./docs/policies/external-export-policy.v1.json) — canonical serialization of the immutable v1 policy record; see its [human projection](./docs/policies/external-export-policy.md) and [policy-specific schema](./docs/policies/external-export-policy.v1.schema.json).
- [Active policy set v2](./docs/policies/active-policy-set.v2.json) — exact version, path, and SHA-256 selection pins for Provider Processing v2 and unchanged External Export v1; immutable [active-set v1](./docs/policies/active-policy-set.v1.json) remains predecessor history. [`docs/policies/README.md`](./docs/policies/README.md) owns the target-qualification rule, artifact routes, and validation instructions.

The JSON `lifecycleStatus: "active"` value is internal to each policy version. Repository-current/canonical authority exists only at an exact integrated `dev` commit that contains the canonical JSON and whose same-tree active-set entry matches identity, version, path, and SHA-256; the same record on any unintegrated task branch is `accepted-but-unintegrated`.

When current at such a qualifying target, Provider Processing Policy and External Export Policy remain separate Execution-context Policy Documents and remain separate from Public Release Permission. Provider Processing v2 remains default-deny and makes only exact `sample1` local manual fixture recording policy-eligible under [ADR 0044](./docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md); it does not configure or dispatch a call. External Export v1 makes only one exact user-selected local-filesystem file Effect policy-eligible and is never Effect Approval or outcome proof. These policy records create no provider/model implementation, current recording, local-export implementation, network/cloud/email destination, learning, publication, Public Release Permission, or outcome proof.

## Implementation-facing specifications

- [V2 architecture baseline](./docs/architecture-v2/README.md) — DSH-first product/process topology and containment seams; shared terms remain owned by the contexts above and root ADRs 0041/0042.
- [V2 UI/UX baseline](./docs/ui-ux-v2/README.md) — presentation and interaction design for the same domain meanings; its local context and glossary do not compete with root definition owners.

## Relationships

The context boundaries are accepted, and the inheritance interview is complete: every topic cluster was resolved by a named question and its terms promoted. Source definitions that were never promoted remain evidence rather than inherited truth.

- **AI7 Editorial → AI7 Execution**: Professional Editorial Knowledge, exact source revisions, approved memory, and Editorial Dimensions are assembled by the Editorial Intelligence Layer for governed Foundation Model use.
- **AI7 Execution → AI7 Editorial**: Model results remain proposals/evidence until Editorial-owned review and publication authority accepts them.
