# Context Map

## Contexts

- [AI7 Editorial](./docs/domain/editorial/CONTEXT.md) — Book, manuscript, source, revision, proposal, coverage-aware analysis/result-set, and publication language.
- [AI7 Execution](./docs/domain/execution/CONTEXT.md) — Task Intent, native DSH artifact, Task Ledger, Run, foreground/background authority, Effect, AI7 Apply, command, continuation, and exact Harness Session binding language.
- [Deferred Word Integration](./docs/domain/word-integration/CONTEXT.md) — intentionally empty contingency context; Word is outside Standalone-only V1 and has no promoted domain terms.

## Cross-context policy documents

- [Learning Eligibility Policy](./docs/policies/learning-eligibility-policy.md) — current design baseline for material-selection authority, bounded automation, revision evidence, and rollback.
- [Factual Verification Policy](./docs/policies/factual-verification-policy.md) — current design baseline for factual-evidence authority, provenance, independent verification statuses, and conflict handling.
- [Provider Processing and active policy selection](./docs/policies/README.md) — the policy index owns the target-qualified scope map, exact JSON/schema/projection paths and selected digests. Historical version numbers are not current launch pins.
- [External Export Policy](./docs/policies/README.md) — selected separately from Provider Processing and from Public Release Permission; an eligible export still requires its exact preparation, approval and outcome receipt.

Trusted build/launch authority binds one operational scope. A policy's internal lifecycle status, ordinary setting, installed artifact or configured Provider does not select a scope or grant processing, Apply, export or publication authority. The context definitions own domain meaning; [PROGRESS](./PROGRESS.md) records implemented selectors and capabilities.

## Successor authority routes

- [ADR 0089](./docs/adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) separates repository Orca dispatch, development-only evidence reuse and ordinary business inference. The [policy index](./docs/policies/README.md) owns its implemented successors; [Orca dispatch](./docs/agents/orca-dispatch.md) owns repository roles.


- [ADR 0045](./docs/adr/0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) preserves native DSH Skill/Plugin/Bundle/Profile/Agent Preset carriers behind AI7 provenance, compatibility, scope, authority, audit, rollback, staged activation, update, and Apply seams.
- [ADR 0046](./docs/adr/0046-separate-provider-processing-by-operational-scope.md) owns the trusted Provider operational-scope split.
- [ADR 0047](./docs/adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) separates ranked retrieval candidates plus Exact Fetch from deterministic covered manuscript analysis and durable result sets.
- [ADR 0048](./docs/adr/0048-enroll-and-evaluate-background-manuscript-analysis.md) owns Background Analysis Enrollment, baseline/optional analysis, and analysis feedback/metrics.

The presence of these records does not grant implementation, Provider, plugin/dependency installation, Apply, release, or `main` authority.

## Implementation-facing specifications

- [V2 architecture baseline](./docs/architecture-v2/README.md) — DSH-first product/process topology and containment seams; shared terms remain owned by the contexts above and root ADRs 0041/0045–0048.
- [V2 UI/UX baseline](./docs/ui-ux-v2/README.md) — presentation and interaction design for the same domain meanings; its local context and glossary do not compete with root definition owners.

## Relationships

The context boundaries are accepted, and the inheritance interview is complete: every topic cluster was resolved by a named question and its terms promoted. Source definitions that were never promoted remain evidence rather than inherited truth.

- **AI7 Editorial → AI7 Execution**: Professional Editorial Knowledge, exact source revisions, approved memory, and Editorial Dimensions are assembled by the Editorial Intelligence Layer for governed Foundation Model use.
- **AI7 Execution → AI7 Editorial**: DSH Analysis Contracts may shape covered execution, but AI7 Editorial owns Coverage Manifests, Analysis Units, durable Manuscript Analysis Result Sets/Revisions, feedback, and currentness. Model results remain proposals/evidence until Editorial-owned review accepts them, and every formal agent-originated Manuscript mutation still crosses one exact single-use AI7 Apply.
