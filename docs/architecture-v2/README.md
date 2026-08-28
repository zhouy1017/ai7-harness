# AI7 V2 architecture baseline

Status: **Owner-approved Issue #86 implementation-facing successor; repository-current only in an exact integrated `dev` commit containing this revision; accepted-but-unintegrated elsewhere; design authority only**

The Issue #86 normalization is repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. It creates no implementation or external-action authority and must not be read as proof that the currently implemented provider-free J-01/J-02/J-08 journeys implement the successor seams.

This package describes one simple architecture:

- AI7 owns the product, domain model, UI/UX, policies, authority, capabilities, Effects, Task Ledger, scheduling, providers, persistence, and lifecycle.
- **DeepSeek Harness (DSH)** is the sole production **Primary Agent Harness**, composed inside the AI7 Node service from the ADR 0020 baseline `0.1.0-rc.6` and an exactly pinned public npm package subset — full composition capability behind a narrow AI7 tool surface, never the `@deepseek-ai/dsh` CLI aggregate.
- **DeepSeek is primary but not exclusive.** Task Intents, native DSH artifacts, and DSH Analysis Contracts declare provider-neutral Model Roles; the accepted defaults are V4 Flash for Fast Interaction, V4 Pro High for Main Editorial, and V4 Pro Max for Difficult Escalation and, by default, the Frontier Model Role. The user may explicitly configure another eligible frontier provider, which enters the same loop, plan, credential brokering, exact Run Budget Ceiling state, and egress gate. No model is a factual authority.
- **Codex is not a production runtime.** It remains the **Codex Interaction Model Reference**: a non-runtime interaction and engineering reference. AI7 ships no Codex package, process, session, adapter target, provider invoker, fallback, or source build, and copies no Codex branding, GUI source, layout, assets, or coding presets.
- Electron, ProseMirror, the renderer, domain services, and the AI7 service process remain AI7-owned and unchanged by the harness decision.
- DSH Skill, Plugin, Bundle, Profile, and Agent Preset identities, carrier content, versioned definitions, technical logic, and eligible self-contained behavior stay native. AI7 owns selection/pins and overlays provenance, compatibility/conversion, scope, Authority Ceiling, audit, rollback, update, scoped enablement, and exact per-Run activation rather than creating a parallel Task Skill package/runtime. An AI7 Workflow Profile is only a projection/selector over one exact native definition; durable Workflow Instances and business transitions remain AI7-owned. Final sidecar and storage names remain implementation decisions.
- Artifact discovery/acquisition, non-executing validation/conversion, scoped enablement, exact Run activation, Background Analysis Enrollment, and single-use AI7 Apply are separate boundaries. Installation or enablement grants no manuscript, Provider, credential, network, Effect, background, or Apply authority.
- Ranked retrieval plus Exact Fetch remains distinct from comprehensive manuscript analysis. Whole-manuscript claims require deterministic Coverage Manifests, completely enumerated Analysis Units, typed provenance-preserving reduction, durable immutable Result Set Revisions, explicit gaps, and independent coverage/closure/freshness/assurance state.
- Provider Processing uses one trusted operational scope per launch: immutable v1 for development/CI, v2 for exact fixture recording, and v3 for ordinary production. The selection is not a user, environment, Provider, artifact, Plugin, or cross-scope fallback toggle and claims no executable selector.
- Unknown DSH behavior is an implementation assumption with a design response, never a capability-closure or proof blocker.
- The only standing engineering CI surface is one logical provider-free E2E Functional Gate, executed on Windows and macOS, covering complete supported journeys and regressions for observed bugs.

The Owner accepted the original package into the `dev` development baseline through the exact Issue #20 allowlist and accepted the bounded successor normalization through Issue #86. It retains ADR 0020's exact DSH version baseline but selects no final package list, catalog-source set, Plugin, provider endpoint, credential, sidecar schema, or launch selector. Acceptance does not itself authorize adjacent implementation, GitHub search, artifact/dependency installation, source copy, fork, external action, release, or promotion to `main`.

## Reading order

1. [Architecture](./ARCHITECTURE.md) — product and component boundaries, runtime topology, ownership, Model Roles, flows, persistence, and failure/continuation semantics.
2. [Harness Integration](./HARNESS-INTEGRATION.md) — composition contract, session/task/effect separation, providers, capabilities, lifecycle, pinning, and extension policy.
3. [Migration](./MIGRATION.md) — retain/reshape/discard/rewrite decisions and staged direction after later authorization.
4. [Assumptions](./ASSUMPTIONS.md) — explicit implementation assumptions and the response if each proves false.
5. [Root ADR 0041](../adr/0041-dsh-first-deepseek-primary-architecture.md) — the retained one-loop, provider, and model-routing decision as refined by the successor ADRs.
6. [Root ADR 0045](../adr/0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) — native DSH artifacts behind AI7 authority seams, foreign-Skill lineage, staged lifecycle, updates, and Apply.
7. [Root ADR 0046](../adr/0046-separate-provider-processing-by-operational-scope.md) — trusted Provider Processing scope separation.
8. [Root ADR 0047](../adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) — targeted retrieval versus covered manuscript analysis and durable result sets.
9. [Root ADR 0048](../adr/0048-enroll-and-evaluate-background-manuscript-analysis.md) — Background Analysis Enrollment and analysis quality.
10. [Decision Queue](./DECISION-QUEUE.md) — only future material owner choices; none blocks this design.
11. [Root contexts](../../CONTEXT-MAP.md) and [root glossary](../../GLOSSARY.md) — canonical definitions and bilingual routing.

## Historical references

The former A1 crosswalks, A2 capability/proof material, Codex-first integration document, and architecture-exploration clarifications remain source-qualified Git history only. They are deliberately absent from the current tree and ordinary reading route. ADR 0027, ADR 0028, root ADR 0041 and successor ADRs 0045–0048, plus this package, own the accepted current outcomes. Superseded ADR 0042 remains history rather than current Plugin-lifecycle authority.

## Authority basis

The original rewrite consumed Clarification 0005 — `docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md` at exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391` — for the retained one-loop/model decisions:

- DeepSeek Harness owns the one production generic agent loop; AI7 owns business, domain, and authority state.
- DeepSeek is the primary but not exclusive provider, with the four accepted Model Role defaults.
- Codex is retained as the Codex Interaction Model Reference and engineering reference only.
- Plugin mechanism never creates AI7 product authority.

Issue #86 supersedes the old development-only/threshold Plugin lifecycle with native DSH ecosystem compatibility behind AI7 authority seams, and adds covered manuscript analysis, durable Result Sets, distinct Default Execution Rule/Background Analysis Enrollment origins, production Provider Processing v3, and the one exact AI7 Apply boundary. Beyond the exact built-in Manuscript Profile mapping recorded by Issue #38, the supported catalog sources, adapters, trust tiers, sandbox mechanics, other carrier mappings, and general artifact persistence schemas remain deferred implementation detail.

Clarification 0004's minimal-validation decision remains active, so ADR 0027 and `kick-in/35-minimal-e2e-validation.md` keep one provider-free E2E functional/regression surface on Windows and macOS as the only standing engineering verification. ADR 0028 supplies the accepted two-platform product contract. Clarifications 0001–0003 and the Codex-first clauses of Clarification 0004 are historical evidence only.

## Decision state

The predecessor architecture remains historical context. The Issue #86 successor text is repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. There is no current Owner-choice blocker inside the bounded normalization. Issue #8 Batches 1–5 retain their import, Book identity, Task/continuation, Source, Series, Delivery Package/export, and maintenance refinements. Issue #86 changes artifact carriers, production Provider scope, and manuscript-analysis behavior without changing the one-loop topology or adding public send/publication/recall authority. Windows and macOS remain in scope; concrete macOS distribution and adapter mechanics remain implementation decisions. Future changes that would fork the generic loop, replace the harness, add another platform/surface, make operational Provider scope user-selectable, let artifact lifecycle or background analysis grant ambient authority, weaken the exact Apply boundary, or otherwise expand product authority return to the Owner through the [Decision Queue](./DECISION-QUEUE.md).

The current repository implementation integrates the provider-free J-01 standalone empty-Book, new-Book import, and first-Manuscript existing-empty-Book paths with exact identity disclosure and interrupted-import continuity/reconciliation, complete provider-free J-02 10M bounded editing, and complete provider-free J-08 Recovery Workspace. It ships and validates the built-in read-only declarative native Profile `manuscript-editorial@1.0.0`, persists the separate `ai7.manuscript.editorial.zh-CN@2.0.0` projection, and pins both on Workflow Instances through exact fail-closed legacy migration. It remains neither full J-01 nor the broader Book Workspace, and has zero configured Providers, Agents, or Sessions. It has no executable artifact marketplace/lifecycle, Provider/egress selector, retrieval/Exact Fetch, covered analysis, Result Set, Enrollment, analysis metric, Proposal/Effect, or AI7 Apply path. The remaining deferred seams are future implementation obligations, not capabilities claimed by this document.
