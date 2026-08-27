# Context Map

## Contexts

- [AI7 Editorial](./docs/domain/editorial/CONTEXT.md) — Book, manuscript, source, revision, proposal, coverage-aware analysis/result-set, and publication language.
- [AI7 Execution](./docs/domain/execution/CONTEXT.md) — Task Intent, native DSH artifact, Task Ledger, Run, foreground/background authority, Effect, AI7 Apply, command, continuation, and exact Harness Session binding language.
- [Deferred Word Integration](./docs/domain/word-integration/CONTEXT.md) — intentionally empty contingency context; Word is outside Standalone-only V1 and has no promoted domain terms.

## Cross-context policy documents

- [Learning Eligibility Policy](./docs/policies/learning-eligibility-policy.md) — current design baseline for material-selection authority, bounded automation, revision evidence, and rollback.
- [Factual Verification Policy](./docs/policies/factual-verification-policy.md) — current design baseline for factual-evidence authority, provenance, independent verification statuses, and conflict handling.
- [Provider Processing Policy v1](./docs/policies/provider-processing-policy.v1.json), [v2](./docs/policies/provider-processing-policy.v2.json), and [v3](./docs/policies/provider-processing-policy.v3.json) — immutable serializations selected by trusted operational scope for development/CI, exact fixture recording, and ordinary production respectively; each keeps its own schema and human projection.
- [External Export Policy v1](./docs/policies/external-export-policy.v1.json) — canonical serialization of the immutable v1 policy record; see its [human projection](./docs/policies/external-export-policy.md) and [policy-specific schema](./docs/policies/external-export-policy.v1.schema.json).
- [Active policy set v3](./docs/policies/active-policy-set.v3.json) — the closed trusted scope map and exact version/path/SHA-256 pins for Provider Processing v1/v2/v3 plus unchanged External Export v1. Immutable [active-set v1](./docs/policies/active-policy-set.v1.json) and [v2](./docs/policies/active-policy-set.v2.json) remain byte-preserved predecessor history. [`docs/policies/README.md`](./docs/policies/README.md) owns target qualification, artifact routes, and validation.

The JSON `lifecycleStatus: "active"` value is internal to each policy version. Repository-current/canonical authority exists only at an exact integrated `dev` commit that contains the canonical JSON and whose same-tree active-set entry matches trusted operational scope, identity, version, path, and SHA-256. The same record on any unintegrated task branch is `accepted-but-unintegrated`. Trusted build/launch authority binds exactly one Provider scope per launch; no ordinary setting, environment variable, Provider, artifact/Plugin, or cross-scope fallback may select it, and the policy records do not claim that executable selector exists.

When current at such a qualifying target, Provider Processing Policy and External Export Policy remain separate Execution-context Policy Documents and remain separate from Public Release Permission. Provider v1 denies all live development/CI transmission. Provider v2 remains default-deny and makes only exact `sample1` local manual fixture recording policy-eligible under [ADR 0044](./docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md). Provider v3 permits only eligible exact ordinary-production Runs: a newly user-initiated Task through direct authorization or a matching Default Execution Rule, or a new manuscript-analysis dispatch under a matching active Background Analysis Enrollment. Setup, import, artifact installation and enablement grant none. External Export v1 makes only one exact user-selected local-filesystem file Effect policy-eligible and is never Effect Approval or outcome proof. These records create no provider/model implementation, current recording, launch selector, local-export implementation, network/cloud/email destination, formal Manuscript Apply, learning, publication, Public Release Permission, or outcome proof.

## Successor authority routes

- [ADR 0045](./docs/adr/0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) preserves native DSH Skill/Plugin/Bundle/Profile/Agent Preset carriers behind AI7 provenance, compatibility, scope, authority, audit, rollback, staged activation, update, and Apply seams.
- [ADR 0046](./docs/adr/0046-separate-provider-processing-by-operational-scope.md) owns the trusted Provider operational-scope split.
- [ADR 0047](./docs/adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) separates ranked retrieval candidates plus Exact Fetch from deterministic covered manuscript analysis and durable result sets.
- [ADR 0048](./docs/adr/0048-enroll-and-evaluate-background-manuscript-analysis.md) owns Background Analysis Enrollment, baseline/optional analysis, and analysis feedback/metrics.

These Issue #86 successor records and their normalized projections are repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere they remain accepted-but-unintegrated. Their presence does not grant implementation, Provider, plugin/dependency installation, Apply, release, or `main` authority.

## Implementation-facing specifications

- [V2 architecture baseline](./docs/architecture-v2/README.md) — DSH-first product/process topology and containment seams; shared terms remain owned by the contexts above and root ADRs 0041/0045–0048.
- [V2 UI/UX baseline](./docs/ui-ux-v2/README.md) — presentation and interaction design for the same domain meanings; its local context and glossary do not compete with root definition owners.

## Relationships

The context boundaries are accepted, and the inheritance interview is complete: every topic cluster was resolved by a named question and its terms promoted. Source definitions that were never promoted remain evidence rather than inherited truth.

- **AI7 Editorial → AI7 Execution**: Professional Editorial Knowledge, exact source revisions, approved memory, and Editorial Dimensions are assembled by the Editorial Intelligence Layer for governed Foundation Model use.
- **AI7 Execution → AI7 Editorial**: DSH Analysis Contracts may shape covered execution, but AI7 Editorial owns Coverage Manifests, Analysis Units, durable Manuscript Analysis Result Sets/Revisions, feedback, and currentness. Model results remain proposals/evidence until Editorial-owned review accepts them, and every formal agent-originated Manuscript mutation still crosses one exact single-use AI7 Apply.
