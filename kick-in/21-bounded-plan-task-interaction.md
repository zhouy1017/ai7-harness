# Bounded-plan Task Interaction

Status: **accepted in Question 20**

## Recommendation

Preserve original AI7's visible-plan hybrid autonomy, exact task context, durable waits, safe pause/cancel/recovery, and reopenable evidence-bearing outcomes. Replace the legacy Task Composer and workbench presentation with a surface-neutral contract: every task has an exact **Task Intent**, a versioned **Execution Plan**, a human-readable **Plan Preview**, and a machine-authoritative **Plan Envelope**. The user's existing **Run Authorization** binds the exact Task Intent and Plan Envelope digest.

The visible plan is therefore neither merely informative nor blanket approval. It is an authority-bearing envelope that permits recorded, bounded adaptation. A material change suspends work and creates a **Plan Revision** for renewed Run Authorization. Effect Approval, Proposal Decision, Review Decision, and Public Release Permission remain separate authorities.

This document defines interaction outcomes and state, not UI layout. The independent UI/UX design may choose one shared Windows-and-macOS Standalone presentation with explicit native adapters without reviving the legacy Ribbon, Activity rail, panels, docking model, or agent console. A future surface may reuse the contract only after entering product scope through its own decision.

## Pinned original-AI7 evidence

Audit pin: `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`.

| Area | Current truth at the pin | Migration finding |
| --- | --- | --- |
| Visible-plan autonomy | ADR 0002 and root instructions allow visible read-only/low-risk work while requiring explicit authority for mutation, export, destructive, or confidentiality-sensitive action. | Keep the behavioral boundary; align the effect classes with the accepted named-authority model rather than the older generic “approval” wording. |
| Task Composer | ADR 0091 defines one context-aware launch path across Standalone entry points and shared semantics with Word. | Keep one canonical launch contract and exact context capture; drop the form, entry-point, and layout prescription. |
| Task Intent | `runtime/task_intent.py` ships deterministic identity, exact Book/document/revision/selection context, manifest/input pinning, preflight, start, and durable restoration. Backend-contract coverage asserts one launch authority. | Keep semantics and deepen them beyond the currently narrow source-grounded-Q&A handler. Do not claim that the full skill catalog already ships through this path. |
| Provider plan | The shipped preflight/start path binds an opaque plan identity/digest, source scope, outbound-data category, budget, exact provider bindings, and a frozen fallback chain; drift closes start authority. | Generalize this strong precedent into the Plan Envelope for all agent behavior, not only provider resolution. |
| Generic run plan | `runtime/task_skill_orchestrator.py` emits a deterministic capability/step description. | Treat as descriptive current scaffolding, not evidence of model-led adaptive planning. |
| Durable continuation | ADR 0079 distinguishes verified-checkpoint Resume, linked Retry, and new-Run Redo; pause and cancel reach safe boundaries and cancellation does not promise rollback. | Keep the semantics under the accepted Effect identity and receipt rules. |
| Clarification | Current legacy Operation waiting/input semantics are durable. An older reference-agent plan made clarification a presentation option. | Keep a typed durable Clarification Request in Task Ledger/workflow state when the answer affects intent or authority; drop the old Operation record and optional badge/UI behavior. |
| Outcomes | ADR 0076 separates semantic Run evidence from operational progress; text-changing outcomes are proposals rather than mutations. | Keep durable typed outcomes linked to evidence, decisions, Effects, receipts, and safe next action. |
| Editor-first workbench | ADR 0061 preserves exact text context and durable/reopenable results but specifies extensive UI structure. | Keep the user outcomes; discard Ribbon, rail, panels, docking, inspectors, action bars, and shell layout. |
| Old agent API/console | `docs/reference/current-ai7/plans/agent-layer.md` describes `/agent/plan`, `/agent/run`, `/agent/approve`, step-ID resubmission, optional plan visibility, and an Agent Command Center. | Historical evidence only. Drop the implementation and its optional-plan/coarse-approval model. |

## Accepted bilingual domain terms

| English canonical term | Preferred Simplified Chinese | Meaning |
| --- | --- | --- |
| **Task Intent** | 任务意图 | The exact goal, Task Skill, inputs, Book/deliverable/document/revision/selection context, and expected outcome of one requested task. |
| **Execution Plan** | 执行计划 | A versioned plan of capabilities, steps, expected artifacts, declared Effects and gates, stop conditions, and provider needs for one Task Intent. |
| **Plan Preview** | 计划预览 | The concise human-readable projection of an Execution Plan and its uncertainty, authority, and expected outcomes; it is not itself authorization. |
| **Plan Envelope** | 计划权限边界 | The machine-authoritative limits within which Run Authorization permits execution: capabilities, tools, sources, providers, privacy category, budget, ceilings, fallback/retry rules, adaptation classes, and Effect gates. |
| **Plan Adaptation** | 计划内调整 | A recorded execution-plan adjustment explicitly permitted by the unchanged Plan Envelope. |
| **Plan Revision** | 计划修订 | A material change to the Task Intent, Execution Plan, or Plan Envelope that suspends execution and requires renewed Run Authorization. |
| **Clarification Request** | 澄清请求 | A durable typed wait asking the user for information needed to resolve ambiguity in intent, evidence, authority, or a safe next action. |
| **Task Outcome** | 任务结果 | A durable typed result recording actual-versus-planned work, evidence, artifacts/proposals, decisions, Effects/receipts, unresolved matters, and safe next action. |

`Plan` without qualification is not a stable record name. Plan Preview is presentation; Execution Plan is intended behavior; Plan Envelope is execution authority. Harness plan-mode state may project these concepts but is not their durable AI7 business authority.

## Authority and adaptation contract

### May continue without renewed Run Authorization

- Reorder or skip declared read-only steps when the Plan Envelope allows it and records the reason.
- Substitute a declared capability with an equivalent read-only capability that cannot expand source, provider, privacy, budget, output, or Effect authority.
- Retry under the declared idempotency and Effect-replay policy.
- Advance to an already frozen fallback provider after a conclusively classified primary failure.
- Pause at a safe boundary or issue a Clarification Request.

### Requires a Plan Revision and renewed Run Authorization

- Add a Task Skill, tool, or capability outside the envelope.
- Expand Book, Series, corpus, document, revision, selection, source, or destination scope.
- Use a provider outside the frozen approved chain or enlarge the outbound-data category.
- Increase budget, time, token, step, or attempt ceilings beyond the approved bounds.
- Change the goal, expected Task Outcome type, material quality criterion, Effect class, or risk boundary.
- Continue after evidence or target drift invalidates an authority-bearing pin.

Run Authorization permits bounded execution and arrival at declared gates. It never by itself applies generated text, approves an Effect, accepts a proposal, records a professional Review Decision, or permits public release.

## Surface-neutral task lifecycle

1. **Capture intent** — bind the exact Book, deliverable, document, revision, selection, skill, inputs, requested Editorial Dimensions, and expected Task Outcome.
2. **Preflight** — resolve sources, providers, privacy/outbound category, budget, capabilities, policies, dependencies, and any blocking ambiguity.
3. **Preview and authorize** — show the Plan Preview and obtain Run Authorization for the exact Task Intent and Plan Envelope digest.
4. **Execute with bounded adaptation** — log Plan Adaptations and evidence in AI7 business records while projecting live progress from Harness Session Events; pause for Clarification Requests or named gates.
5. **Revise when material assumptions change** — suspend, preserve current evidence, issue a Plan Revision, and require renewed authorization.
6. **Deliver outcome** — persist the Task Outcome and its actual-versus-planned trace, proposals/artifacts, evidence, decisions, Effects/receipts, unresolved questions, and safe next action.
7. **Review after the run** — collect editor feedback for governed Editorial Learning, Policy Document review, and separately evaluated Agent Behavior Improvement.

The lifecycle permits one concise interaction to authorize a low-risk plan, but it does not require per-step confirmation. Named Effect gates interrupt only when the task reaches an authority the Run Authorization does not and cannot grant.

## Task Outcome family

V1 should support typed outcomes rather than a generic response blob:

- finding or editorial review report;
- source-grounded answer or research summary;
- manuscript or other text proposal on an exact Proposal Branch;
- proposed Editorial Artifact or Correction Proposal;
- Clarification Request or unresolved evidence record;
- Effect request awaiting exact authority;
- completed Editorial Artifact or Delivery Package only when the required authoritative transition and receipts exist.

Every Task Outcome records the originating Task Intent and Execution Plan versions, actual-versus-planned trace, exact source/manuscript pins, applicable policy and Editorial Dimension snapshots, Foundation Model/Harness composition identity, evidence, confidence or unresolved state, linked Run Record and Execution Bindings, decisions, Effects/receipts, and safe next action. A model-generated outcome never silently becomes an authoritative manuscript revision, Editorial Artifact, factual finding resolution, or public release.

## Keep / adapt / drop

| Legacy element | Recommendation | New-project treatment |
| --- | --- | --- |
| Visible-plan hybrid autonomy | Keep and sharpen | Authority-bearing Plan Envelope with bounded, logged adaptation. |
| Exact target/context capture | Keep | One surface-neutral Task Intent contract across future hosts. |
| Provider preflight and frozen fallback plan | Keep/generalize | One strong precedent inside the broader Plan Envelope. |
| Task Composer | Keep semantics, rename/remove UI ownership | Task Intent capture/preflight contract; interaction design deferred. |
| Generic capability-list run plan | Adapt | Versioned Execution Plan with explicit adaptation and drift semantics. |
| Durable wait, pause, cancel, Resume/Retry/Redo | Keep semantics | Use Run Continuation Checkpoints, exact Execution Bindings, stable Effect identity, receipts, and the no-rollback rule. |
| Exact context and durable/reopenable task results | Keep | Typed Task Outcomes independent of where a UI later renders them. |
| Ribbon, Activity rail, run panel, inspector, docking, action bars | Drop as authority | Candidate UX evidence only for the separate UI/UX session. |
| Old `/agent/*` API, Agent Command Center, step resubmission | Drop | No compatibility baseline or historical-record importer. |
| Optional plan visibility or blanket approval | Drop | Plan Preview is always available; authority stays exact and named. |

## Provider-free verification direction

Tests should prove exact Task Intent/Plan Envelope digest binding across supported Standalone entry points and the domain boundary; permitted Plan Adaptation without new authority; suspension and new Plan Revision on every material drift class; no Effect or proposal application from Run Authorization alone; durable clarification and restart; safe pause/cancel with no rollback claim; frozen fallback behavior; typed Task Outcome lineage; and rejection of falsely completed or authority-inflated outcomes. Surface-neutral contracts should remain reusable, but V1 has no multi-surface conformance obligation.

## Decision resolution

Question 20 accepted the authority-bearing Plan Envelope, exact Task Intent and Run Authorization binding, bounded Plan Adaptation, material Plan Revision, separate Effect/editorial authorities, durable clarification/continuation, typed Task Outcomes, and the complete legacy UI/agent-console drop boundary above. See [ADR 0009](../docs/adr/0009-use-authority-bearing-plan-envelopes.md).
