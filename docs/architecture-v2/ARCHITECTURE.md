# AI7 V2 architecture

Status: **coherent noncanonical candidate; no implementation authorization**

AI7 V2 is one Chinese-first desktop publishing product on Windows and macOS. Both platforms share product identity, domain and authority semantics, workflows, core features, document fidelity, data meaning, and UI/UX outcomes while native OS adapters handle platform conventions. AI7 owns the product, its business truth, and every consequential action. **DeepSeek Harness (DSH)** supplies the one generic agent loop, composed inside the AI7 Node service behind an AI7-owned boundary. **DeepSeek is the primary but not the exclusive model provider**, and every configured model—including an optional alternative frontier provider—runs through that same loop and the same AI7 provider, scope, Run Budget Ceiling, and egress boundaries.

Codex is not part of the product. It remains the **Codex Interaction Model Reference**: a non-runtime interaction and engineering reference for task capture, progress, interruption, clarification, history, review, host boundaries, and extension design.

This is a design-stage architecture. Unknown DSH details are recorded in [Assumptions](./ASSUMPTIONS.md) and handled during implementation through the simplest suitable AI7-owned adapter, capability implementation, or DSH extension seam. They are not evidence gates.

## Architectural principles

1. **AI7 is the authority.** A Book, Manuscript Revision, Workflow Instance, Policy Document, Task Intent, Plan Envelope, decision, Effect, receipt, provider binding, or capability grant exists only because AI7 creates and persists it.
2. **DSH is the executor.** DSH owns generic conversation state, context assembly, turn progression, model invocation, technical tool dispatch, streaming, compaction, subagent mechanics where used, and in-turn recovery. Its technical success never becomes business success by implication.
3. **One loop, many Runs.** DSH is the sole Primary Agent Harness. AI7 may run many isolated executions concurrently; many instances of one loop are not a second loop. AI7 implements no generic loop and configures no automatic harness fallback.
4. **AI7 schedules, DSH converses.** AI7 owns which Runs exist, workflow state, continuation, concurrency, usage observation, optional explicit Run Budget Ceiling enforcement, Effects, and model-free background jobs. The ceiling defaults to `unset`; Provider Account Limits stay external. AI7's business scheduling does not use the Harness `schedule`, `jobs`, or workflow packages.
5. **Primary, not exclusive.** DeepSeek is the default model family for every Model Role. An alternative provider is a configuration inside the AI7 Provider Resolution Plan, never a second harness, silent fallback, or separate authority path.
6. **Full engine, narrow tool surface.** AI7 adopts DSH composition machinery—profiles, bundles, presets, plugins, context assembly, tool pipelines, policy seams, replay—and rejects its coding-agent purpose, default presets and prompts, default tool set, and web surface. Editorial Runs receive AI7 Capabilities, not a shell, roaming filesystem, arbitrary network, coding presets, or developer-profile escalation.
7. **One authority, many projections.** The Manuscript Revision is authoritative. Editor windows, indexes, outlines, retrieval chunks, embeddings, progress views, and assembled model context are rebuildable projections.
8. **Functional completeness over proof machinery.** One logical provider-free E2E Functional Gate covers complete user journeys and observed-bug regressions on Windows and macOS. Architecture assumptions and native platform differences do not create separate qualification or verification programmes.

## Product boundary

AI7 owns:

- Books, explicitly acquired Source Versions and acquisition records, Series Knowledge candidates/items/revisions/promotion decisions, Series Retrieval Exclusions, manuscripts, revisions, branches, edit journals, checkpoints, and recovery snapshots;
- Editorial Deliverables and immutable revisions, Workflow Profiles and Instances, gates, artifacts, signoffs, Milestone and Publication Versions, destination-independent delivery packages, and versioned Maintenance Cases;
- Task Intents, Execution Plans, Plan Envelopes, Run Records, continuation meaning, scheduling, concurrency, budgets, and Task Outcomes;
- Task Skills, Capability Implementations, activation, grants, Run Source Scope, and the Agent Data Root;
- Policy Documents, editorial decisions, Run Authorization, Execution Grants, Local Export Preparations, Effect Approval, Effects, receipts, and Public Release Permission;
- Model Role definitions, provider resolution, approved fallback, credential brokering, outbound-data classification, and provider-processing policy;
- retrieval, Exact Fetch, Factual Verification, Quality Signals, Editorial Learning, and Learning Lineage;
- the editor, information architecture, Chinese-first language, accessibility outcomes, import/export behavior, and product lifecycle;
- the composed DSH configuration itself, the selected package subset, and every admitted plugin pin.

DSH owns only generic technical execution inside the composed runtime. DSH Session, turn, step, tool-call, model-message, and technical-event records are not AI7 business records.

Codex owns nothing in the product. AI7 may reinterpret Codex interaction and host/runtime-boundary patterns in AI7-owned design and behavior assets. No Codex package, process, Session, tool, branding, GUI source, layout, asset, coding preset, or coding-agent purpose enters AI7.

## Runtime topology

AI7 retains the accepted three-process product topology:

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron main                                               │
│ windows, native lifecycle, service supervision, safe IPC    │
└───────────────────────┬─────────────────────────────────────┘
                        │ typed IPC: stdio or private local adapter
┌───────────────────────▼─────────────────────────────────────┐
│ Renderer                                                    │
│ AI7 UI, ProseMirror bounded window, task/review projections │
│ context isolation on; Node integration off                  │
└───────────────────────┬─────────────────────────────────────┘
                        │ typed commands, queries, event views
┌───────────────────────▼─────────────────────────────────────┐
│ AI7 Node service — sole local product authority             │
│ domain services · stores · policies · capabilities · runs   │
│ provider/credential brokers · scheduling · usage/ceiling    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ PrimaryAgentHarness boundary (AI7-owned)                │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ composed DeepSeek Harness runtime                   │ │ │
│ │ │ one generic agent loop, pinned package subset       │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

The composed DSH runtime is a library inside the AI7 service process, not a fourth product authority. DSH never communicates directly with the renderer or the Electron main process, and no AI7 or DSH component exposes a TCP listener. If concurrency isolation later requires supervised child processes, that is a topology response behind the same boundary, not a second loop.

### Electron main

The main process is deliberately thin. It creates windows, owns native application lifecycle, mediates user-chosen file and destination dialogs and native rename/cancel/replace conflict presentation, supervises the Node service, and exposes only a small typed IPC bridge. It returns the normalized user choice to the service but owns no manuscript model, Task Ledger, agent loop, provider secret, Local Export Preparation, Effect Approval, commit, reconciliation, receipt, or other Effect semantics.

### Renderer

The renderer owns interaction and ephemeral display state. ProseMirror edits a bounded manuscript window mapped to global Manuscript Block identities. Whole-manuscript operations are service commands with progress and cancellation. The renderer never treats its window, an index hit, or model output as authoritative text.

The UI reinterprets the Codex Interaction Model Reference at the principle level: clear task capture, visible context and scope, progressive activity, interruption, durable history, focused clarification, and review before consequential change. AI7 designs these interactions for professional Chinese editors around Books, manuscripts, evidence, proposals, and workflows. It copies no Codex layout, source, assets, branding, coding-agent purpose, or generic chat hierarchy.

### AI7 Node service

The service is the only local product authority and contains these cohesive modules:

| Module | Responsibility |
| --- | --- |
| Book, Source and Series | Book identity, explicit Source Version acquisition/provenance, Source Acquisition Records, Series membership, Series Knowledge candidate/promotion/revision lifecycle, and current retrieval exclusions. |
| Manuscript | Blocks, revisions, branches, journals, checkpoints, recovery, bounded editor windows, import/export fidelity. |
| Projection and Retrieval | Disk-backed or bounded lexical/outline indexes, retrieval chunks and embeddings, revision freshness, Exact Fetch. |
| Workflow and Artifacts | Deliverable-owned workflow state and immutable revisions, deterministic commands, gates, decisions, signoffs, Milestone/Publication Versions, destination-independent packages, and versioned Maintenance Cases. |
| Task and Run | Task Ledger, Plan Envelopes, Run Records, attempts, continuation, clarification, outcomes. |
| Scheduling, Usage and Ceiling | Which Runs exist and when they execute, instance-level concurrency, usage observation, optional explicit per-Run ceiling enforcement, and strict non-sharing of scratch, cache, usage, and ceiling state between concurrent Runs. |
| Policy and Authority | Policy Documents, activation, named decisions, Local Export Preparations, Effect intents/approvals, replay policy, receipts and reconciliation. |
| Capability Facade | Domain-shaped operations, scope enforcement, per-Run activation, bounded import/export, native-file-adapter coordination and research boundaries; never roaming filesystem access. |
| Provider and Credential | Model Role resolution, Provider Preflight, approved fallback, outbound-data category, opaque credentials. |
| Provider Payload/Egress Gate | AI7-owned final inspection of the complete model-bound payload immediately before transmission. |
| Editorial Intelligence | Context assembly inputs, factual review, proposal formation, quality signals, editorial memory and learning lineage. |
| `PrimaryAgentHarness` boundary | The AI7-owned composition and containment boundary around the DSH runtime: technical sessions, turns, tool registry, events, interruption, and compaction. |

The service may schedule multiple Runs, model-free background work, indexing, and learning jobs. DSH owns only the generic agent turns inside agent executions; AI7 owns why those executions exist and what may follow from them.

Indexing, Exact Fetch, deterministic policy evaluation, persistence, and other model-free work may run directly in AI7 services. **Every model-driven operation**—including editorial analysis, factual review, proposal generation, learning or policy candidates, and subagent work—must run through the sole `PrimaryAgentHarness`. No AI7 module, plugin, or capability implementation calls a model provider around it.

## Model Roles and providers

Task Skills and AI7 services declare **Model Roles** with hard requirements and soft preferences. They never name a provider, model, endpoint, or credential. Provider Preflight resolves roles to exact bindings and freezes them in the Plan Envelope before Run Authorization.

| Model Role | Default binding | Intended work |
| --- | --- | --- |
| Fast Interaction Role | DeepSeek V4 Flash | Quick interaction, low-risk candidate generation, and latency-sensitive assistance. |
| Main Editorial Role | DeepSeek V4 Pro High | Chinese long-form writing, editorial proposals, cross-source synthesis, factual research, and complex instruction following. |
| Difficult Escalation Role | DeepSeek V4 Pro Max | Difficult or unusually consequential work that exceeds the main role's expected capability. |
| Frontier Model Role | DeepSeek V4 Pro Max | Default frontier binding for challenge or explicitly authorized high-consequence work; the user may explicitly configure another eligible provider/model without changing the one-loop topology. |

These are default bindings, not factual authority. No model, DeepSeek or otherwise, becomes a source of truth: output remains a proposal or a research lead, and Factual Verification still requires admissible evidence, provenance, and Exact Fetch where applicable.

Configuring an alternative frontier provider changes the binding inside one Provider Resolution Plan. It does not change the harness, the ledgers, the capability surface, the authority model, or the egress rules. Escalation between roles is an AI7 policy and plan decision, not something a model or a DSH default may perform for itself.

## Ownership and authority

| Concern | AI7 | DeepSeek Harness | Codex |
| --- | --- | --- | --- |
| Product requirements and UX | Sole owner | None | Non-runtime interaction reference |
| Books, manuscripts, workflows | Sole authority and persistence | Receives scoped context | None |
| Tasks, Runs, scheduling and budgets | Creates, authorizes, schedules and records | Executes turns inside one bound attempt | None |
| Policies and permissions | Defines and enforces | Receives effective constraints | None |
| Capabilities | Defines, grants, validates and commits | Dispatches among the tools exposed for that execution | None |
| Providers and credentials | Resolves Model Roles, bindings and secrets | Invokes only the frozen binding supplied at the boundary | None |
| Effects and receipts | Sole intent, approval, commit and evidence authority | May request a capability; cannot approve or prove an Effect | None |
| Technical conversation history | References exact spans without copying transcripts | Owns Session/turn/step history and technical events | None |
| Generic agent loop | Decides when an execution exists; does not reimplement the loop | Sole implementation | None |
| Composition and dependencies | Owns the pinned subset, configuration and plugin pins | Publishes upstream packages | None |
| Engineering reference | Owns adopted rules | Composition patterns are adopted deliberately, defaults are not | Interaction and host-boundary patterns may be reinterpreted |

## Main flows

### Local editing and recovery

1. The renderer requests a bounded window from the service at an exact Manuscript Revision and branch position.
2. User edits append to the branch Edit Journal through deterministic service commands.
3. The service acknowledges durable journal state; that acknowledgment is not a Manuscript Checkpoint.
4. A meaningful checkpoint reconstructs the complete manuscript state and commits a new immutable Manuscript Revision.
5. Recovery reads journals and Recovery Snapshots from service-owned persistence. It creates a descendant state rather than rewriting history.

Local manuscript access and editing work without DSH, a model provider, credentials, or network access.

### Task to agent execution

1. AI7 captures a Task Intent Draft bound to a Book, deliverable, manuscript/source selection, and requested outcome. Whenever the Task would use acknowledged journal state newer than the latest Manuscript Revision as target, range, source, or evidence, a Manuscript Checkpoint with purpose `Task Input / 任务输入` first materializes the exact revision. Every attached prior-revision or pending manuscript target/range/source/evidence reference must exact-resolve there into a new task-bound pin without mutating its original provenance; checkpoint or resolution failure preserves the draft and blocks Plan Preview/authorization.
2. Provider Preflight resolves Model Roles to exact provider bindings, the Approved Fallback Chain, Outbound Data Category, credentials, exact Run Budget Ceiling state, and any Provider Account Limit blocker.
3. AI7 creates an Execution Plan, a machine-authoritative Plan Envelope, and a human-readable Plan Preview.
4. Run Authorization creates a Run Record; it grants no Effect Approval, Proposal Decision, Review Decision, or Public Release Permission.
5. The scheduler decides when the Run executes against instance concurrency. AI7 observes usage and enforces an explicit Run Budget Ceiling when present; the default is `unset`, Provider Account Limits remain external blockers, and scratch/cache/usage/ceiling state never cross concurrent Runs.
6. AI7 creates an execution attempt and persists its one immutable Execution Binding to one DSH Session lineage before a model turn can invoke a capability. The binding also pins the exact AI7 behavior-composition version and digest: instructions, context-selection rules, compaction policy, subagent policy, disabled-default policy, and the composed DSH configuration and plugin pins.
7. Immediately before every model call, the AI7-owned **Provider Payload/Egress Gate** evaluates the final complete payload—not only newly selected context—including prior Session content, compaction summaries, tool results, default instructions, and subagent context. It transmits only when the payload matches the Run Source Scope, current effective restrictions, Provider Resolution Plan, and Outbound Data Category; otherwise it fails closed.
8. The boundary submits the turn and translates DSH technical events into a small AI7 event projection for the UI.
9. Every capability request passes both the DSH-facing tool guard and the AI7 Capability Facade. The facade rechecks the exact activation, grant, scope, current Series Retrieval Exclusions, plan, provider, and policy state.
10. Capability and Effect outcomes return to the waiting tool call only after AI7 classifies and persists the authoritative result or ambiguity.
11. AI7 persists proposals, findings, clarification requests, usage, and the Task Outcome in their owning records. A DSH terminal event is only technical history.

### Proposal and Effect

Model-generated manuscript changes begin on a Proposal Branch pinned to an exact Manuscript Revision. A Proposal Decision records editorial judgment but does not apply text. Application is a separate deterministic AI7 Effect with exact target and payload, applicable Effect Approval, atomic commit, and an Effect Receipt or classified ambiguous outcome. A DSH tool result, approval request, or successful turn is never that receipt.

### Source acquisition

A supported local file, exact editor-pasted or entered material, or retention-permitted fully retrieved external research snapshot becomes a Book-owned Source Version only after an exact selected-Book action: file-specific `作为来源材料导入` or pasted/entered-and-research `保存为来源材料`. Search snippets, failed retrievals, model answers, attachments, and Task use do not create a Source Version by themselves; separately retained Task/evidence records remain governed by their own authority. An exact existing Source Version identity may be selected only when already owned by that same target Book; cross-Book acquisition creates a new target-owned version with its own provenance. The authoritative commit persists exact provenance and a Source Acquisition Record; the local-file source-only path keeps its specialized Source Import Record. With no Book, a reviewed source-bound Book Creation Draft may atomically create a zero-Manuscript Book and its first Source Version without creating a Manuscript, Workflow Instance, Run Source Scope, factual status, learning authority, or publication authority.

### Series knowledge and retrieval restrictions

Editor-authored drafts and provenance-bound proposals from exact member-Book Manuscript Revisions, Source Versions, or reviewed evidence enter as non-authoritative Series Knowledge Candidates. One explicit Series Knowledge Promotion Decision reviews the exact Series, proposed new or existing stable Series Knowledge Item, content, provenance, conflicts, and reuse scope and then creates the item with its first immutable revision or appends one revision to that exact item. A disclosed conflict must be edited and re-reviewed, explicitly preserved, or cancelled; preserving it records rather than resolves the conflict. Membership, accepted Proposals, Milestone Versions, Learning Eligibility, and model output never promote a candidate automatically. Promotion only makes the revision eligible for later exact Series-scoped selection and does not itself create Run Source Scope, authorize retrieval, or permit Provider transmission.

Every Series-scoped capability read rechecks the current versioned Series Retrieval Exclusions. An item-targeted exclusion covers that stable Series Knowledge Item's current and future revisions, while a stable-class exclusion covers later matching items. A newly effective restriction blocks the next affected read and suspends queued or active work for Plan Revision plus renewed Run Authorization or cancellation while preserving the old binding, already fetched evidence, and history. Superseding or ending an exclusion never restores an old authorization or auto-resumes. This Series-path restriction is not global Book/source deletion, Learning Eligibility, or an automatic Cross-project denial.

### Factual review

Retrieval produces candidates stamped with their derivation revision. AI7 uses Exact Fetch only against an already retained pinned Manuscript Revision or Source Version before quoting or asserting textual fidelity; initially retrieving external research is a separate research-capability action. Reference Integrity, Claim Support, and Factual Verification remain separate. Foundation Model knowledge—at any Model Role, including the Frontier Model Role—may raise a question or guide research, but it is not evidence. Corrections remain exact-revision proposals until an editor decides and a separate Effect applies them.

### Workflow and delivery

AI7 advances a deliverable through deterministic workflow commands. Every exact Editorial Deliverable Revision is immutable; Manuscript Revision is the manuscript realization of that shared boundary. Review Decisions, Signoff Records, Milestone Versions, Delivery Packages, Publication Versions, External Export Policy, local-export Effects, receipts, and Public Release Permission remain separate. Workflow completion and DSH turn completion prove none of the others.

A Delivery Package is one versioned destination- and format-independent manifest over an exact Editorial Deliverable Revision, optionally identified by an exact Milestone Version. Each rendered file instead receives a frozen Local Export Preparation after native destination/collision resolution, followed by an exact AI7 Effect Intent and Effect Approval before commit. Electron main presents the platform's familiar rename, cancel, or replace workflow, but the AI7 service owns the normalized exact target, authority, commit, verification, per-file receipt, and reconciliation. Cancellation attempts no file Effect; changed target or disposition invalidates preparation and approval; an ambiguous outcome stops retry. No export receipt means sent, handed off, delivered, or published.

After a Publication Version is designated, `correction / 更正`, `errata / 勘误`, `supersession / 替代`, `withdrawal / 撤回`, `reissue / 再版`, and `archive / 归档` remain distinct stable Maintenance Classifications on versioned Maintenance Cases. A Correction Proposal may create a new Editorial Deliverable Revision, Errata remains a versioned Editorial Artifact, and Supersession or Reissue requires a separately manual newer Publication Version. Prior revisions and records never move; withdrawal or archive changes only future AI7 use/visibility and proves no external recall, takedown, notice, delivery, or publication.

## Failure and continuation boundaries

| Failure or user action | Durable truth | Required response |
| --- | --- | --- |
| Renderer crash or reload | Service-owned manuscript journal, Task Ledger, and workflow state | Recreate projections and reopen the bounded editor window; do not infer lost or committed work from renderer state. |
| Electron main exit | Service persistence and last acknowledged journal state | Shut down supervised children when possible; on restart reconcile from authoritative stores. |
| AI7 service crash | On-disk manuscript, domain ledgers, command outbox, receipts, and continuation checkpoints | Recover and reconcile the service first. An ordinary safely resumable Run settles as `任务已中断 · 可续行` and awaits explicit Resume; renderer or harness state cannot advance business records independently. |
| DSH runtime failure inside the service | AI7 Run and attempt plus the last exact Harness Execution Span reference | Mark technical execution interrupted or indeterminate; preserve the Run; require explicit Resume after safe reconciliation; never fabricate Task Outcome or Effect failure. |
| Provider failure before any ambiguous external action | Frozen Approved Fallback Chain and policy | Use only the next compatible approved binding when AI7 classifies retry as safe. There is no harness fallback, only a provider one. |
| Final provider payload violates scope or egress policy | Complete assembled payload plus the bound Run Source Scope, Provider Resolution Plan, and Outbound Data Category | Refuse transmission, pause the execution, and expose a safe AI7 reason without sending any part of the payload. |
| Ambiguous provider or external Effect outcome | Effect identity, attempt, request and observed evidence | Stop automatic retry and fallback; require reconciliation or Manual Outcome Resolution. |
| Capability refusal or scope drift | Current Plan Envelope, activation, grants and Run Source Scope | Refuse with no side effect. Material drift requires Plan Revision and renewed Run Authorization. |
| Series Retrieval Exclusion becomes effective | Versioned current exclusion plus immutable original Plan Envelope, authorization, binding and evidence | Refuse every later affected Series read; suspend queued/active work for Plan Revision plus renewed authorization or cancellation; retain and impact-mark history; never ordinary-Resume or auto-resume from a superseding exclusion. |
| Composition or plugin pin does not match the binding | Immutable Execution Binding, plugin manifest and lockfile | Refuse to start or continue the execution on an unknown composition identity; do not resolve an unpinned artifact. |
| User pause | Same Run and current attempt state | Stop dispatch at a safe boundary and retain a continuation checkpoint. |
| User cancel | Same Run plus already committed Effects/receipts | Interrupt pending execution; never claim cancellation reversed a committed Effect. |
| Resume | Explicit user action on the same Task Intent, Plan Envelope and Run | Revalidate authoritative AI7 state and, when unchanged, continue through a new technical span; restart safety alone never dispatches. |
| Retry | Same unchanged Run, new safe attempt | Create an explicitly linked attempt only when repetition is safe. |
| Redo | New semantics or fresh requested result | Create a new authorized Run. |
| Replay | Existing durable records | Perform no model call, capability invocation, or Effect. |

## Persistence boundary

The logical causal graph has two ledgers:

- the **AI7 Task Ledger** owns Task Intents, Run Records, attempts, commands, decisions, Effects, outcomes, workflow references, and provenance; and
- the **Harness Session Ledger** owns DSH model messages, Sessions, turns, steps, tool calls/results, compaction, diagnostics, and technical attempt history.

The cardinality is explicit: one Run owns one or more attempts; each attempt owns exactly one immutable Execution Binding and exactly one DSH Session lineage; each binding may reference one or more Harness Execution Spans. A Session lineage may never cross Run, Book, Run Source Scope, Provider Resolution Plan, or Outbound Data Category boundaries. Explicit Resume within the same attempt may add a new span only after lightweight revalidation proves the identical binding; reconciliation never submits it automatically. Retry creates a new attempt, binding, and Session lineage. Permission expansion requires a Plan Revision and renewed Run Authorization and can never mutate an existing binding; continuing work receives a newly bound attempt, or Redo when Run semantics change. A current permission reduction must refuse the affected call and pause or interrupt execution; a Series Retrieval Exclusion specifically invalidates same-binding Resume and requires Plan Revision plus renewed authorization while the historical binding remains immutable. The already-authorized deferred-connectivity path remains the narrow auto-dispatch exception only when Reconnect Preflight finds no such drift.

Bindings pin exact identities and semantic digests, including the AI7 behavior composition and the composed DSH configuration and plugin pins. Harness Execution Spans identify the exact technical ranges for dispatch, Resume, or Retry. Bindings carry references, never copied transcript content or transferred authority.

All product persistence sits under AI7-controlled locations inside the Agent Data Root except the Protected Secret Store, and this includes the Harness Session Ledger and the AI7-controlled local plugin store. For a buildable launch, bootstrap creates a manifest-bound, digest-bound snapshot of required runtime dependencies; before the product no-network interval, the launch path atomically materializes and re-verifies it into the selected Agent Data Root. A prefilled global store or another development root never supplies correctness. On Windows, the portable channel keeps data inside the AI7 folder and the installer normally uses `%LOCALAPPDATA%\AI7`. macOS uses a platform-appropriate application-data location selected by its implementation decision. Secrets remain outside copied product data and are resolved through Windows Credential Manager or macOS Keychain behind the same Credential Broker. Manuscripts and their derivatives never enter repositories, hosted CI, build artifacts, or shipped fixtures.

## Composition and dependency boundary

DSH is consumed as exactly pinned public npm packages: ADR 0020's accepted `0.1.0-rc.6` baseline, the selected subset AI7's composition needs, one coherent version across that subset, and a committed lockfile. AI7 never depends on the `@deepseek-ai/dsh` CLI aggregate, because it transitively installs the generic shell, pwsh, terminal, and web tool packages the editorial surface excludes; absence from the dependency graph is a stronger guarantee than absence from the wiring. No `^`, `~`, branch, mutable tag, or `latest` is used. Pin bumps are explicit, one-at-a-time development changes, never automatic updates.

Adopting the framework is not adopting its defaults. Every DSH default that would reach an editorial Run must be justified for publishing work rather than inherited because it shipped, and AI7's Agent Behavior Assets are authored for editorial work rather than adapted from coding presets.

When product behavior is missing, prefer in order: an AI7-owned adapter or capability implementation; a documented DSH extension seam; and only for an identified need, an admitted **Third-Party DSH Plugin** under [ADR 0002](./adr/0002-admit-and-pin-third-party-dsh-plugins.md). A plugin is a code-bearing Capability Implementation or composition dependency — never a Task Skill, provider, credential, policy, grant, or brand — it is resolved only through an immutable Local Plugin Pin, and capability expansion never self-activates.

## Engineering verification

The standing CI surface is one logical E2E Functional Gate, executed on Windows and macOS, covering complete user-facing journeys and regressions for observed bugs. Each platform execution follows the [Source Checkout Buildability Contract](../agents/source-checkout-buildability.md): fresh checkout, empty job-local dependency-store/build-output roots, the same documented developer bootstrap/build/readiness/lifecycle path, then a provider-free and network-free product execution interval containing no unpublished manuscript text or secret. Approved package-registry and immutable-artifact restoration precedes that interval, including declared integrity-bound secondary downloads; optional caches remain job-local and non-authoritative, and platform-native setup may differ inside the same gate. Build or packaging runs only when needed to launch each platform's E2E subject and has no independent gate or success record.

There are no separate architecture-closure, unit, integration, contract, property, coverage, static-analysis, performance, security, provider, plugin, schema, ABI, packaging, replay, provenance, reproducibility, or release-proof gates. The accepted product behaviors above remain requirements and may be exercised through complete journeys.

## Design boundary

This candidate selects responsibilities and seams and retains ADR 0020's exact DSH `0.1.0-rc.6` baseline. It does not select the final package list, a plugin, a provider endpoint, a credential, or a package layout; copy source; install dependencies; search GitHub; authorize implementation; decompose implementation issues; or change canonical `main`. Those actions require later owner acceptance, Commander integration, and separate implementation authorization.
