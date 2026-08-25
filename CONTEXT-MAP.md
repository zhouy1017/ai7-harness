# Context Map

## Contexts

- [AI7 Editorial](./docs/domain/editorial/CONTEXT.md) — Book, manuscript, source, revision, proposal, and publication language.
- [AI7 Execution](./docs/domain/execution/CONTEXT.md) — Task Intent, Task Skill, Task Ledger, Run, authority, Effect, command, continuation, and exact Harness Session binding language.
- [Deferred Word Integration](./docs/domain/word-integration/CONTEXT.md) — intentionally empty contingency context; Word is outside Standalone-only V1 and has no promoted domain terms.

## Cross-context policy documents

- [Learning Eligibility Policy](./docs/policies/learning-eligibility-policy.md) — current design baseline for material-selection authority, bounded automation, revision evidence, and rollback.
- [Factual Verification Policy](./docs/policies/factual-verification-policy.md) — current design baseline for factual-evidence authority, provenance, independent verification statuses, and conflict handling.
- [Provider Processing Policy v1](./docs/policies/provider-processing-policy.v1.json) — authority-bearing canonical serialized minimum baseline; see its [human projection](./docs/policies/provider-processing-policy.md) and [policy-specific schema](./docs/policies/provider-processing-policy.v1.schema.json).
- [External Export Policy v1](./docs/policies/external-export-policy.v1.json) — authority-bearing canonical serialized minimum baseline; see its [human projection](./docs/policies/external-export-policy.md) and [policy-specific schema](./docs/policies/external-export-policy.v1.schema.json).
- [Active policy set v1](./docs/policies/active-policy-set.v1.json) — exact version, path, and SHA-256 selection pins for those two concrete baselines; [`docs/policies/README.md`](./docs/policies/README.md) owns the artifact routes and validation instructions.

Provider Processing Policy and External Export Policy remain separate Execution-context Policy Documents and remain separate from Public Release Permission. Provider Processing v1 authorizes zero live transmissions. External Export v1 makes only one exact user-selected local-filesystem file Effect policy-eligible and is never Effect Approval or outcome proof. These policy-only baselines authorize no provider/model call, local-export implementation, or network/cloud/email destination.

## Implementation-facing specifications

- [V2 architecture baseline](./docs/architecture-v2/README.md) — DSH-first product/process topology and containment seams; shared terms remain owned by the contexts above and root ADRs 0041/0042.
- [V2 UI/UX baseline](./docs/ui-ux-v2/README.md) — presentation and interaction design for the same domain meanings; its local context and glossary do not compete with root definition owners.

## Relationships

The context boundaries are accepted, and the inheritance interview is complete: every topic cluster was resolved by a named question and its terms promoted. Source definitions that were never promoted remain evidence rather than inherited truth.

- **AI7 Editorial → AI7 Execution**: Professional Editorial Knowledge, exact source revisions, approved memory, and Editorial Dimensions are assembled by the Editorial Intelligence Layer for governed Foundation Model use.
- **AI7 Execution → AI7 Editorial**: Model results remain proposals/evidence until Editorial-owned review and publication authority accepts them.
