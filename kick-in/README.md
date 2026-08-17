# AI7 Harness Kick-in

Status: **design only; no product implementation has started**

This folder is the migration design room for a new AI7 product that preserves the valuable product language, safety invariants, workflows, and user evidence from AI7 Reborn while adopting DeepSeek Harness as its agent execution and Agent Behavior foundation.

## Source freeze

The initial design is based on these immutable snapshots:

- AI7 Reborn: private `zhouy1017/ai7-reborn-ai`, `dev@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`
- DeepSeek Harness: `zhouy1017/deepseek-harness`, `master@47f943859bef60e4160492346772ded9b24f765a` (`0.1.0-rc.5`)

The Harness fork was identical to `deepseek-ai/deepseek-harness` at the audited revision. The two projects have unrelated Git histories.

## Current recommendation

Use a fresh AI7-owned repository and consume an exactly pinned Harness release/commit behind a narrow compatibility boundary. Build AI7 as a profile, bundle, domain plugins, and surface adapters; do not fork the Harness agent loop or carry the current AI7 monolith forward as the new foundation.

The fresh-repository half is now **settled by owner instruction**: this design room was initialized on 2026-08-17 and published as private `zhouy1017/ai7-harness` on branch `main`. It contains documentation only and no copied source.

The rest is still **proposed, not accepted**. The license, the recorded authorization to reuse unlicensed private AI7 assets, the meaning of “full Harness capability,” dependency strategy, and several domain mappings must be resolved in the design interview first.

## Document map

1. [Charter](./00-charter.md) — product vision, design principles, scope, and success criteria.
2. [Source provenance](./01-source-provenance.md) — exact inputs, licensing, history, and source-copy rules.
3. [Target architecture](./02-target-architecture.md) — proposed component boundaries, semantic mappings, and alternatives.
4. [Keep / adapt / drop matrix](./03-keep-adapt-drop.md) — the initial evidence-backed legacy disposition.
5. [Migration workflow](./04-migration-workflow.md) — design gates and future vertical-slice sequence.
6. [Decision map](./05-decision-map.md) — the one-question-at-a-time interview and dependencies.
7. [Risk register](./06-risk-register.md) — major technical, product, security, and provenance risks.
8. [Canonical setup record](./07-project-setup-draft.md) — the approved agent, tracker, context-map, and glossary configuration now applied to the repository.
9. [Source-document inheritance](./08-source-document-inheritance.md) — active row-by-row original-AI7 preserve/modify/relocate/archive review plus architecture-maintainer-owned Harness guidance.
10. [Retained development workflows](./09-retained-development-workflows.md) — exact pinned source inventory for tiered CI, generated mock-provider evidence, and development-only multi-agent dispatch.
11. [Editorial dimension catalog](./10-editorial-dimensions.md) — accepted eight-dimension baseline and the open production-customization contract.
12. [Cross-corpus editorial learning](./11-cross-corpus-editorial-learning.md) — Book-scoped task authority plus the accepted cross-Book House Editorial Memory boundary.
13. [Series work boundary](./12-series-work.md) — accepted richer shared knowledge and exact retrieval among explicitly related Books.
14. [Learning audit and eligibility](./13-learning-audit-and-eligibility.md) — lineage from source material to memory use plus user-trained future eligibility policy.
15. [Foundation-model/editorial-intelligence invariant](./14-foundation-model-editorial-intelligence.md) — AI7 uses provided models plus governed professional knowledge and does not train LLM weights.
16. [Harness agent-behavior purpose](./15-harness-agent-behavior.md) — accepted purpose, three-layer separation, and proposed evaluation-driven behavior-improvement loop.
17. [Policy documents and feedback-interaction handoff](./16-policy-documents-and-feedback-ux-handoff.md) — versioned authority rules plus constraints for a separate future UI/UX session.
18. [Source–generation–grounding boundary](./17-source-generation-grounding-boundary.md) — accepted separation of textual fidelity, claim support, and factual verification, backed by pinned original-AI7 evidence.
19. [Manuscript revision and recovery boundary](./18-manuscript-revision-and-recovery-boundary.md) — accepted stable-block revision graph, journal/checkpoint split, proposal-merge, and recovery semantics.
20. [Proposal, authority, Effect, and replay boundary](./19-proposal-approval-effect-replay-boundary.md) — accepted named-authority, per-Effect publication, receipt, and ambiguous-outcome semantics.
21. [Deliverable workflow and editorial artifacts](./20-deliverable-workflow-and-artifacts.md) — accepted Question 19 deliverable-owned workflow, V1 profile, artifact, and legacy-disposition boundary.
22. [Bounded-plan task interaction](./21-bounded-plan-task-interaction.md) — accepted Question 20 authority-bearing Plan Envelope, bounded adaptation, typed outcome, and legacy UI/agent-console disposition.
23. [Task Skill, capability, trust, and provider boundary](./22-task-skill-capability-trust-provider-boundary.md) — accepted Question 21 layered authority, Harness projection, model-service, credential, and outbound-data boundary.
24. [Linked Task and Harness ledgers](./23-linked-task-and-harness-ledgers.md) — accepted Question 22 boundary between AI7 business provenance and canonical Harness execution history.
25. [Legacy data migration boundary](./24-legacy-data-migration-boundary.md) — accepted production-data exclusion with protected credential, mock-provider evidence, and selected test-Book exceptions.
26. [Standalone-only V1 and deferred Word alternative](./25-standalone-word-surface-boundary.md) — accepted Question 23 single-surface boundary and professional editing obligation.
27. [Tiered verification and mock-provider evidence](./26-tiered-verification-and-mock-provider-evidence.md) — accepted Question 24 two-workflow Windows-only contract, retained mock-provider requirements, and the deferral triggers for everything cut.
28. [Repository development dispatch](./27-repository-development-dispatch.md) — accepted Question 25 three-role model, provider-neutral operating rules, and the single binding table that is the only provider-specific artifact.
29. [Decision records](./decisions/README.md) — accepted hard-to-reverse decisions only.

## Decision discipline

- **Proposed** means the audit supports it, but the owner has not accepted it.
- **Accepted** means it was resolved in the design interview and, when warranted, recorded under `decisions/`.
- **Deferred** means it is intentionally outside the first migration boundary.
- **Dropped** means old-repository/offline reference only unless the accepted three-category transfer allowlist explicitly names the asset; it never means deleting the source repository during planning.

The canonical multi-context glossary is now established through `CONTEXT-MAP.md`, the context `CONTEXT.md` files, and the bilingual `GLOSSARY.md` index. It prevents Harness terms such as Session, Skill, Workspace, and Approval from being treated as synonyms for AI7 domain concepts.

## Planning boundary

This folder may contain analyses, diagrams, matrices, and proposed decisions. It must not contain copied product source code, vendored Harness packages, private fixtures, credentials, or a merged Git history.

The repository now has its own fresh Git history. That history is unrelated to both input repositories by construction, and this boundary is unchanged by it: initializing a repository authorized version control, not source copying.
