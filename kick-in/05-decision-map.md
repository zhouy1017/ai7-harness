# Decision Map

Status: **complete — all 36 questions resolved or explicitly deferred**

The revised estimate is **36 questions**. Question 36 was added when Question 29 established that agent-authored revisions require an evaluation gate that AI7 must own. Question 6 replaced the all-at-once inheritance approval with a topic-by-topic review of original-AI7 documentation. Questions 7–12 resolved the product spine, Editorial Dimensions, learning scopes, and Series. Question 13 accepted the memory-promotion model and added two distinct requirements: auditable end-to-end learning lineage and an adaptive policy for future material eligibility. The owner has also fixed the purpose of DeepSeek Harness: learn and use its framework to improve Agent Behavior without model training; Question 29 still decides the exact capability/profile boundary. Harness-document choices are delegated to the architecture maintainer. Questions are asked one at a time; code/source facts are investigated rather than asked.

## Branch A — Planning mechanics

| Question | Decision | Recommended answer | Status | Blocks |
| --- | --- | --- | --- | --- |
| 1 | Issue tracker for this new repo | GitHub Issues | **Accepted: GitHub Issues** | Skill/project setup and later PRD/issues workflow |
| 2 | External PRs as an incoming request surface (only if GitHub/GitLab) | No initially | **Accepted: no external PR request surface at this stage** | Triage configuration |
| 3 | Triage label vocabulary | Defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` | **Accepted: defaults unchanged** | Agent workflow configuration |
| 4 | Domain-doc layout | Multi-context map separating AI7 Editorial and AI7 Execution vocabularies, with a reserved Word context if ever needed | **Accepted: two active contexts, one deferred Word placeholder, plus a maintained reference glossary** | Glossary and ADR locations |
| 5 | Confirm the canonical project-setup draft | Approve `AGENTS.md`, `docs/agents/*`, `CONTEXT-MAP.md`, and the non-duplicating `GLOSSARY.md` index | **Accepted and written** | Writing canonical setup files |

## Branch B — Original-AI7 document inheritance

| Question | Decision | Recommended answer | Status | Blocks |
| --- | --- | --- | --- | --- |
| 6 | Review scope and cross-cutting disposition | Review original-AI7 topic clusters only; delegate Harness details; preserve/rebaseline tests and development dispatch; rewrite `AGENTS.md`; keep Windows desktop; drop old UI | **Accepted** | Row-by-row interview method |
| 7 | Primary user, problem, and end-to-end product story | Chinese-first literary-publishing professional; multi-aspect Book work; unpublished-material control; manuscript plus related deliverables | **Accepted with owner revisions** | Product terms and parity scope |
| 8 | Canonical dimensions of multi-aspect editorial judgment | Keep the proposed eight as defaults; apply only relevant dimensions per task | **Accepted with production-user extension** | Task requirements, evaluations, and journey acceptance |
| 9 | Ownership and versioning of user-configurable Editorial Dimensions | Reusable Editorial Profile defaults, Book-level selection/overrides, task-start snapshot; stable IDs and no retroactive history changes | **Accepted** | Configuration model and reproducibility |
| 10 | Book boundary and Cross-project workspace | Book-scoped text authority; explicit direct Cross-project scope; separate corpus-wide learning seam | **Accepted with learning requirement** | Editorial context and storage |
| 11 | Cross-corpus learning representation boundary | Versioned, inspectable House Editorial Memory of derived patterns/feedback; provenance; no raw cross-Book text or hidden fine-tuning by default | **Accepted with Series exception** | Memory architecture and source isolation |
| 12 | Series membership and shared-information boundary | Explicit membership; versioned Series Knowledge; exact read-only retrieval across member Books; Book-targeted mutations and revision provenance | **Accepted** | Series continuity and source authority |
| 13 | Learning signals and update governance | Explicit instructions activate; operational feedback becomes evidence; inferred patterns remain candidates; cross-Book promotion requires approval; rollback/forget/version snapshots | **Accepted with audit requirement** | Adaptation loop and user control |
| 14 | Learning Audit Log and descendant-impact contract | Append-only lineage from material through eligibility, signals, candidates, memory, and task use; user include/exclude controls; dependency-aware correction | **Accepted** | Explainability and remediation |
| 15 | Adaptive Learning Eligibility Policy authority and revision governance | Recommendation-first bounded decisions; Policy Document; post-run agent revisions; non-expansive in-envelope calibration may auto-activate after gates; authority changes need the user | **Accepted** | Material selection and meta-learning |
| 16 | Textual source of record, factual/semantic verification, search/exact retrieval, generation, citation, and grounding | Exact text is authoritative only for what a revision says; test its assertions against separate evidence; identify errors and create Correction Proposals; retain Search → Exact Fetch → Synthesis → typed verification | **Accepted, including configurable evidence authority and conflict handling** | Capability and evidence design |
| 17 | Manuscript blocks, revisions, branches, merge, journal, and recovery | Keep stable blocks, immutable revision DAG, edit journal/checkpoint split, proposal branches, conservative merge, no-partial-apply, and verified recovery; relocate/drop legacy machinery | **Accepted** | Manuscript architecture |
| 18 | Generated proposals, approvals, effects, receipts, and replay safety | Split named authorities; one accept/apply interaction may create distinct Proposal Decision and Effect Approval; keep exact Effect identity, staged/atomic publication, receipt replay, and ambiguous-outcome stop | **Accepted** | Mutation and safety model |
| 19 | Publication lifecycle and editorial artifact family | Keep Book authority but move workflow state to each deliverable; use seven shared phases, four V1 profiles, typed artifacts, profile-defined gates, and narrow commands | **Accepted** | Product scope |
| 20 | Agentic autonomy, visible plans, Task Composer, and workbench outcomes | Make the visible plan an authority-bearing envelope with bounded adaptation; keep exact context/durable outcomes, discard UI parity | **Accepted** | Product interaction model |
| 21 | Task Skill, capability, trust, provider, and secret concepts | Keep layered manifest/trust/capability/provider authority; project instruction into Harness while AI7 owns activation/enforcement | **Accepted** | Skill/provider architecture |
| 22 | Task Intent, Run, Operation, Event, Checkpoint, and lifecycle commands | Use a Task Ledger plus canonical Harness Session Ledger; retire Operation/`operationRuns`, split their business facts by owner, and correlate exact execution spans | **Accepted** | Persistence and control-plane ownership |
| 23 | Standalone/Word parity, exact host binding, drift, and synchronization | Ship Standalone-only V1; make professional editing release-critical; defer Word as an evidence-triggered future alternative | **Accepted with owner revision** | Standalone architecture and journeys |
| 24 | Exact verification tiers and generated mock-provider corpus | Two workflows, `pr` and `release`, both single-job on `windows-2025`; no Ubuntu lane, nightly, Test Catalog, or quarantine registry in V1, each deferred behind a named trigger; focused and rehearsal stay local; keep provider-free CI, the request-fingerprint guard, a regenerated corpus, and a five-field release receipt | **Accepted with owner revision** | Testing strategy |
| 25 | Local development multi-agent dispatch contract | Three roles — Commander, Worker, independent Reviewer; Codex normally commands at top capability; eligible bounded Workers use Claude first with bidirectional same-class fallback; reviewer task class at least that of the work reviewed, cross-provider by default; provider-neutral operating rules with Layer B as the sole provider-specific policy surface; legacy pilot and host connector rejected as baselines | **Accepted with owner revisions** | Repository-agent runbook |
| 26 | Legacy implementation, data, packaging, release, and Git-specific documentation | **Accepted.** Data boundary from Question 22; release channels revised to zip portable plus NSIS installer from one electron-builder configuration, with signing deferred until explicitly requested; binding Git conventions written to `docs/agents/git-conventions.md`; residual matrix rows confirmed as governed or deferred | Migration and repository governance — **resolved** |

## Branch C — Repository identity and governance

| Question | Decision | Recommended answer | Blocks |
| --- | --- | --- | --- |
| 27 | New repo visibility, license, and authority to reuse private AI7 assets | **Accepted.** Private repository; proprietary `LICENSE`, all rights reserved to the sole rights-holder; predecessor asset reuse authorized; sample manuscripts authorized for AI7 use only while private and local, with outbound transmission a separate ungranted decision | Git init/remote, history, source copying — **no longer blocking** |
| 28 | AI7 branding, product-language policy, and relationship to Harness | **Accepted.** The product display name is exactly **AI7**, with no separate Chinese product name. Repository suffixes `-harness`, `-reborn`, `-redesign` are developer-facing development-track markers and carry no product meaning; they are not renamed. Harness is the execution foundation and never user-facing branding, appearing only in third-party notices. All AI7 projects are solely owned, and agents are authorized to modify them | Repository, docs, and release naming — **resolved** |

**Question 27 is partially resolved.** On 2026-08-17 the owner directed that this design room be initialized as a Git repository and published as private `zhouy1017/ai7-harness` on branch `main`. That settles repository existence and visibility only. Two parts remain open and still block source copying: the license, and the recorded rights-holder/authorization for reusing assets from the unlicensed private `ai7-reborn-ai`. This initialization also ran ahead of the documented Phase 0 exit gate in [the migration workflow](./04-migration-workflow.md); that is a deliberate owner sequencing choice, not evidence that Phase 0 is complete.

## Branch D — Harness capability and control-plane boundary

| Question | Decision | Recommended answer | Blocks |
| --- | --- | --- | --- |
| 29 | Meaning of “full Harness capability” after accepting DSH as the Agent Behavior Framework | **Accepted.** Full engine, narrow tool surface: no generic shell, roaming filesystem, or arbitrary network in an editorial Run. Agent Data Root with Run Source Scope nested inside. Editorial and Developer Capability Profiles with no self-service escalation. Everything agent-proposable, but capability expansion never self-activates | Security and profile composition — **resolved** |
| 30 | Upstream consumption strategy | **Accepted.** Exactly pinned public npm packages, no fork and no vendored source; only the subset AI7 needs, never the `@deepseek-ai/dsh` CLI aggregate; exact versions with a committed lockfile; consumed baseline `0.1.0-rc.6` with `0.1.0-rc.5` retained as the audited-but-uninstallable reference; upstream tracked by commit and npm version since no release channel exists; SDK/ACP kept as a fallback isolation seam; six-point upgrade verification | Bootstrap and upgrade workflow — **resolved** |
| 31 | Single execution authority | **Accepted.** Harness owns the one agent-loop implementation; AI7 schedules and owns business lifecycle. Instances are not authorities, so parallel Runs across Books plus background work are required behavior. Business scheduling avoids Harness job/schedule/workflow packages; AI7 owns a concurrency and budget governor. Learn the framework, not its coding-agent defaults | Runtime ownership — **resolved** |
| 32 | AI7-to-Harness record mapping | Task Ledger and Harness Session Ledger retain separate authority; exact Execution Bindings/Spans correlate them; active Operation records are retired | Persistence/event design; **accepted early by Question 22** |

## Branch E — Runtime, data, surfaces, and proof

| Question | Decision | Recommended answer | Blocks |
| --- | --- | --- | --- |
| 33 | Python and legacy-data posture | **Accepted.** TypeScript and Node throughout with no embedded Python; the legacy Python had zero third-party dependencies and handled DOCX with stdlib zip/XML, so nothing required it. Portable all-in-one folder is the only V1 channel, with the Agent Data Root inside the AI7 folder and the Protected Secret Store outside it | Process topology, packaging, storage — **resolved** |
| 34 | New Windows Standalone shell and professional editor topology | **Accepted.** Long Chinese manuscripts are a required feature with binding tiers at 500K, 1M, and 10M Chinese characters; the renderer never holds a whole manuscript. Electron shell, three processes with a separate AI7 service, stdio/named-pipe IPC and no TCP listener, ProseMirror over bounded windows at medium confidence pending a scale spike | Client, editor, gateway, packaging — **resolved** |
| 35 | First tracer slice and exit gate | **Accepted.** A throwaway store-and-index spike runs first, targeting the paging store rather than the editor; then a read-only tracer ending at a citation that resolves to an exact highlighted block range in the real windowed editor. Manuscript retrieval is required, returns candidates never truth, and invalidates per block with revision stamps; strategy deferred to the spike. Thirteen-point exit gate | PRD and issue decomposition — **resolved** |

## Branch F — Editorial quality measurement

| Question | Decision | Recommended answer | Blocks |
| --- | --- | --- | --- |
| 36 | Automated editorial quality metrics and the Behavior Evaluation Gate | **Accepted.** Three Quality Signal families captured globally on the local instance and attributed per Book/editor/house; five derived metrics with workload displacement as phase-weighted edit volume and time tracking rejected; N = 0 cold start required with sample size gating auto-activation only; actively queried non-blocking one-click reason chips with anti-steering mitigations; privacy as an egress boundary rather than an identity boundary; editor decisions the oracle for taste but never for factual correctness | Agent Behavior Improvement activation — **resolved** |

## Dependency view

```mermaid
flowchart LR
    Setup["Q1–Q5 Planning setup"] --> Inheritance["Q6–Q25 Original-AI7 review"]
    Inheritance --> Governance["Q27–Q28 Identity and governance"]
    Governance --> Harness["Q29–Q32 Harness boundary"]
    Harness --> Product["Q33–Q34 Runtime, data and surfaces"]
    Product --> Packaging["Q26 Packaging, release and Git evidence"]
    Product --> Slice["Q35 First vertical proof"]
    Slice --> PRD["PRD and independently grabbable issues"]
```

## Current question

Questions 1–5 completed the canonical planning setup. Question 6 accepted the narrower original-AI7-only review and cross-cutting directions. Questions 7–23 accepted the product spine, learning scopes, policy and factual authority, manuscript-native history/recovery, named proposal/Effect authority, deliverable workflows, bounded-plan autonomy, layered Task Skill/capability/provider authority, linked ledgers, and a Standalone-only V1 whose professional editing quality is release-critical. The owner also excluded all legacy production-data migration except protected API credential transfer, reviewed mock-provider evidence, and selected test sample Books. Word is an evidence-triggered future alternative, not a V1 requirement. The three-layer Foundation Model → Harness Agent Behavior → AI7 Editorial Intelligence model governs every model design and sharpens but does not close Question 29. No remaining matrix row becomes accepted merely because it appears in these documents.

**Question 24 is closed.** It was first asked with a four-tier proposal and answered with a correction rather than an acceptance:

> The ubuntu setup is just for github actions. The target platform is just windows-only. We do not need a production for ubuntu at this stage. And the tiered verification/build/test should be concise and quick

It was re-proposed under those constraints and accepted: two Windows-only workflows, with the Ubuntu lane, nightly tier, Test Catalog, quarantine registry, and wire-level fault server each deferred behind a named trigger rather than rejected. See [26-tiered-verification-and-mock-provider-evidence.md](./26-tiered-verification-and-mock-provider-evidence.md) and [ADR 0014](../docs/adr/0014-verify-on-one-windows-gate.md).

**Question 25 is closed.** Repository Development Dispatch is three roles with provider-neutral operating rules and one provider-specific Layer B binding policy, recorded in [27-repository-development-dispatch.md](./27-repository-development-dispatch.md) and [ADR 0015](../docs/adr/0015-provider-neutral-development-dispatch.md). The legacy orchestration pilot and its host connector are rejected as baselines and remain old-repository evidence.

**Question 26 is deferred until after Question 34, by owner instruction.** Its data half is accepted. What remains is largely a packaging, installer, signing, and release-evidence question, and Question 34 decides the Standalone shell and process topology that packaging would serve. Deciding what installer evidence to keep before knowing what it packages would invert the dependency. Questions 23 and 24 already removed the Word packaging and release-verification portions of this row.

**Question 27 is closed.** AI7 is proprietary with all rights reserved to the sole rights-holder, predecessor asset reuse is authorized, and sample manuscripts are authorized for AI7 use only while private and local. See [ADR 0016](../docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md) and the `LICENSE`. This clears the last Critical authority blocker on source copying; per-asset provenance, sanitization, and provider-terms checks still apply.

**Question 28 is closed.** The product display name is exactly AI7. Repository suffixes are developer-facing track markers with no product meaning, so `ai7-harness` needs no rename and future agents should not "correct" it. Harness stays the execution foundation and never appears as user-facing branding. Branch C — repository identity and governance — is now fully resolved. This was recorded in the decision map rather than an ADR: it is a routine planning answer, not a hard-to-reverse trade-off.

**Question 29 is closed**, resolving the last unaddressed Critical risk-register entry about generic tool exposure. See [28-harness-capability-and-authority-boundary.md](./28-harness-capability-and-authority-boundary.md), [ADR 0017](../docs/adr/0017-full-engine-narrow-tool-surface.md), and [ADR 0018](../docs/adr/0018-tiered-activation-for-agent-authored-revisions.md).

**Question 36 is closed.** The metric system and the two-sided Behavior Evaluation Gate are accepted in [29-editorial-quality-metrics.md](./29-editorial-quality-metrics.md) and [ADR 0019](../docs/adr/0019-editorial-quality-metrics-and-behavior-evaluation-gate.md). Agent Behavior Improvement now has both a mechanism and a measure.

**Question 30 is closed.** AI7 consumes an exactly pinned subset of public Harness packages, recorded in [30-upstream-consumption-and-upgrade-contract.md](./30-upstream-consumption-and-upgrade-contract.md) and [ADR 0020](../docs/adr/0020-consume-pinned-harness-package-subset.md). The last of the five original implementation blockers other than the Standalone topology is now cleared.

**Question 31 is closed**, recorded in [31-single-execution-authority.md](./31-single-execution-authority.md) and [ADR 0021](../docs/adr/0021-single-execution-authority.md). Branch D is now fully resolved.

**Question 33 is closed**, recorded in [32-runtime-language-and-release-channel.md](./32-runtime-language-and-release-channel.md), [ADR 0022](../docs/adr/0022-typescript-only-runtime.md), and [ADR 0023](../docs/adr/0023-portable-release-with-self-contained-data-root.md). It also settled the release-channel half of Question 26.

**Question 34 is closed**, recorded in [33-standalone-shell-and-editor-topology.md](./33-standalone-shell-and-editor-topology.md), [ADR 0024](../docs/adr/0024-electron-shell-with-isolated-ai7-service.md), and [ADR 0025](../docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md). The last implementation blocker is cleared.

**Question 26 is closed**, the last open row. Packaging revised to two channels, signing deferred, Git conventions written, residual rows confirmed. **Question 35 is closed**, recorded in [34-first-tracer-slice.md](./34-first-tracer-slice.md) and [ADR 0026](../docs/adr/0026-manuscript-retrieval-returns-candidates.md).

**The design interview is complete.** All thirty-six questions are resolved or explicitly deferred. Question 32 was settled early by Question 22; Question 26 was resolved in three parts across Questions 22, 33, and 26 itself.

What remains before implementation is not another interview question but the Phase 0 exit review: confirm every decision-map row is resolved or explicitly deferred, then decompose the accepted design into independently grabbable vertical issues.
