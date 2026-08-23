# AI7 V2 architecture

Status: **coherent noncanonical candidate; no implementation authorization**

AI7 V2 is a Chinese-first Windows desktop publishing product. AI7 owns the product, its business truth, and every consequential action. Codex supplies the one generic agent loop behind an AI7-owned adapter. DeepSeek Harness supplies development guidance only and is absent from the production runtime.

This is a design-stage architecture. Unknown Codex details are recorded in [Assumptions](./ASSUMPTIONS.md) and handled during implementation through the simplest suitable adapter, extension, or small maintained Codex source change. They are not evidence gates.

## Architectural principles

1. **AI7 is the authority.** A Book, Manuscript Revision, Workflow Instance, Policy Document, Task Intent, Plan Envelope, decision, Effect, receipt, provider binding, or capability grant exists only because AI7 creates and persists it.
2. **Codex is the executor.** Codex owns generic conversation state, context assembly, turn progression, model interaction, tool dispatch, streaming, compaction, subagent mechanics where used, and in-turn recovery. Its technical success never becomes business success by implication.
3. **One loop, many Runs.** Codex is the sole Primary Agent Harness. AI7 may run many isolated Codex executions concurrently, but it does not implement a second generic loop or use DeepSeek as fallback.
4. **Specialist product, narrow capabilities.** Editorial Runs receive AI7 Capabilities, not a shell, roaming filesystem, arbitrary network, coding presets, or developer-profile escalation.
5. **One authority, many projections.** The Manuscript Revision is authoritative. Editor windows, indexes, outlines, retrieval chunks, embeddings, progress views, and Codex context are rebuildable projections.
6. **Functional completeness over proof machinery.** Engineering CI covers Windows end-to-end user journeys and regressions for observed bugs. Architecture assumptions do not create separate qualification or verification programmes.

## Product boundary

AI7 owns:

- Books, Series, imported sources, manuscripts, revisions, branches, edit journals, checkpoints, and recovery snapshots;
- Editorial Deliverables, Workflow Profiles and Instances, gates, artifacts, signoffs, and delivery packages;
- Task Intents, Execution Plans, Plan Envelopes, Run Records, continuation meaning, concurrency, budgets, and Task Outcomes;
- Task Skills, Capability Implementations, activation, grants, Run Source Scope, and the Agent Data Root;
- Policy Documents, editorial decisions, Run Authorization, Execution Grants, Effect Approval, Effects, receipts, and Public Release Permission;
- provider resolution, approved fallback, credential brokering, outbound-data classification, and provider-processing policy;
- retrieval, Exact Fetch, Factual Verification, Quality Signals, Editorial Learning, and Learning Lineage;
- the editor, information architecture, Chinese-first language, accessibility outcomes, import/export behavior, and product lifecycle.

Codex owns only generic technical execution behind the adapter. Codex Thread, Turn, Item, tool-call, model-message, and technical-event records are not AI7 business records.

DeepSeek Harness owns nothing in the product. AI7 may re-express useful DeepSeek rules, composition ideas, checklists, and documentation patterns in AI7-owned development or behavior assets. No DeepSeek package, process, Session, tool, fallback, capability, or branding ships.

## Runtime topology

AI7 retains the accepted three-process product topology:

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron main                                               │
│ windows, native lifecycle, service supervision, safe IPC    │
└───────────────────────┬─────────────────────────────────────┘
                        │ typed IPC: stdio or Windows pipe
┌───────────────────────▼─────────────────────────────────────┐
│ Renderer                                                    │
│ AI7 UI, ProseMirror bounded window, task/review projections  │
│ context isolation on; Node integration off                  │
└───────────────────────┬─────────────────────────────────────┘
                        │ typed commands, queries, event views
┌───────────────────────▼─────────────────────────────────────┐
│ AI7 Node service — sole local product authority             │
│ domain services · stores · policies · capabilities · runs   │
│ provider/credential brokers · Codex integration adapter     │
└───────────────────────┬─────────────────────────────────────┘
                        │ private local integration
                  ┌─────▼─────────────────┐
                  │ Codex harness         │
                  │ one generic agent loop│
                  └───────────────────────┘
```

The Codex integration may be an in-service extension or a service-supervised local child process. That is an implementation choice behind the adapter, not a fourth product authority. Codex never communicates directly with the renderer or Electron main process, and no AI7 or Codex component exposes a TCP listener.

### Electron main

The main process is deliberately thin. It creates windows, owns native application lifecycle, mediates user-chosen file and destination dialogs, supervises the Node service, and exposes only a small typed IPC bridge. It owns no manuscript model, Task Ledger, agent loop, provider secret, or Effect semantics.

### Renderer

The renderer owns interaction and ephemeral display state. ProseMirror edits a bounded manuscript window mapped to global Manuscript Block identities. Whole-manuscript operations are service commands with progress and cancellation. The renderer never treats its window, an index hit, or Codex output as authoritative text.

The UI follows useful Codex Desktop-like interaction principles: clear task capture, visible context, progressive activity, interruption, durable history, focused clarification, and review before consequential change. AI7 designs these interactions for professional Chinese editors. It copies no Codex layout, source, assets, branding, coding-agent purpose, or generic chat hierarchy.

### AI7 Node service

The service is the only local product authority and contains these cohesive modules:

| Module | Responsibility |
| --- | --- |
| Book and Manuscript | Blocks, revisions, branches, journals, checkpoints, recovery, bounded editor windows, import/export fidelity. |
| Projection and Retrieval | Disk-backed or bounded lexical/outline indexes, retrieval chunks and embeddings, revision freshness, Exact Fetch. |
| Workflow and Artifacts | Deliverable-owned workflow state, deterministic commands, gates, decisions, signoffs, packages. |
| Task and Run | Task Ledger, Plan Envelopes, Run Records, attempts, continuation, clarification, outcomes, concurrency and budgets. |
| Policy and Authority | Policy Documents, activation, named decisions, Effect intents/approvals, replay policy, receipts and reconciliation. |
| Capability Facade | Domain-shaped operations, scope enforcement, per-Run activation, import/export and research boundaries. |
| Provider and Credential | Model-role resolution, Provider Preflight, approved fallback, outbound-data category, opaque credentials. |
| Provider Payload/Egress Gate | AI7-owned final inspection of the complete model-bound payload immediately before transmission. |
| Editorial Intelligence | Context assembly inputs, factual review, proposal formation, quality signals, editorial memory and learning lineage. |
| Primary Agent Harness Adapter | The only bridge to Codex technical sessions, turns, tools, events, interruption and compaction. |

The service may schedule multiple Runs, model-free background work, indexing, and learning jobs. Codex owns only the generic agent turns inside agent executions; AI7 owns why those executions exist and what may follow from them.

Indexing, Exact Fetch, deterministic policy evaluation, persistence, and other model-free work may run directly in AI7 services. **Every model-driven operation**—including editorial analysis, factual review, proposal generation, learning or policy candidates, and subagent work—must run through the sole `PrimaryAgentHarness`. No AI7 module calls a model provider around the adapter.

## Ownership and authority

| Concern | AI7 | Codex | DeepSeek Harness |
| --- | --- | --- | --- |
| Product requirements and UX | Sole owner | Interaction reference only | Guidance only |
| Books, manuscripts, workflows | Sole authority and persistence | Receives scoped context | None |
| Tasks, Runs, plans and budgets | Creates, authorizes, schedules and records | Executes turns inside one bound attempt | None |
| Policies and permissions | Defines and enforces | Receives effective constraints | None |
| Capabilities | Defines, grants, validates and commits | Selects among the tools exposed for that execution | None |
| Providers and credentials | Resolves bindings and secrets | Invokes only the frozen binding supplied through the adapter | None |
| Effects and receipts | Sole intent, approval, commit and evidence authority | May request a capability; cannot approve or prove an Effect | None |
| Technical conversation history | References exact spans without copying transcripts | Owns Thread/Turn/Item history and technical events | None |
| Generic agent loop | Decides when an execution exists; does not reimplement the loop | Sole implementation | None |
| Engineering guidance | Owns adopted rules | Preferred secondary-development template | Patterns may be re-expressed |

## Main flows

### Local editing and recovery

1. The renderer requests a bounded window from the service at an exact Manuscript Revision and branch position.
2. User edits append to the branch Edit Journal through deterministic service commands.
3. The service acknowledges durable journal state; that acknowledgment is not a Manuscript Checkpoint.
4. A meaningful checkpoint reconstructs the complete manuscript state and commits a new immutable Manuscript Revision.
5. Recovery reads journals and Recovery Snapshots from service-owned persistence. It creates a descendant state rather than rewriting history.

Local manuscript access and editing work without Codex, a model provider, credentials, or network access.

### Task to agent execution

1. AI7 captures a Task Intent bound to a Book, deliverable, exact manuscript/source scope, and requested outcome.
2. Provider Preflight resolves Model Roles, provider bindings, approved fallback, outbound-data category, credentials, and budget.
3. AI7 creates an Execution Plan, a machine-authoritative Plan Envelope, and a human-readable Plan Preview.
4. Run Authorization creates a Run Record; it grants no Effect Approval, Proposal Decision, Review Decision, or Public Release Permission.
5. AI7 creates an execution attempt and persists its one immutable Execution Binding to one Codex Session lineage before a model turn can invoke a capability. The binding also pins the exact AI7 behavior-composition version and digest: instructions, context-selection rules, compaction policy, subagent policy, and disabled-default policy.
6. Immediately before every model call, the AI7-owned **Provider Payload/Egress Gate** evaluates the final complete payload—not only newly selected context—including prior Session content, compaction summaries, tool results, default instructions, and subagent context. It transmits only when the payload matches the Run Source Scope, Provider Resolution Plan, and Outbound Data Category; otherwise it fails closed.
7. The adapter submits the turn and translates Codex technical events into a small AI7 event projection for the UI.
8. Every capability request passes both the Codex-facing tool guard and the AI7 Capability Facade. The facade rechecks the exact activation, grant, scope, plan, provider, and policy state.
9. Capability and Effect outcomes return through the adapter only after AI7 classifies and persists the authoritative result or ambiguity.
10. AI7 persists proposals, findings, clarification requests, usage, and the Task Outcome in their owning records. A Codex terminal event is only technical history.

### Proposal and Effect

Model-generated manuscript changes begin on a Proposal Branch pinned to an exact Manuscript Revision. A Proposal Decision records editorial judgment but does not apply text. Application is a separate deterministic AI7 Effect with exact target and payload, applicable Effect Approval, atomic commit, and an Effect Receipt or classified ambiguous outcome. A Codex tool result, approval request, or successful turn is never that receipt.

### Factual review

Retrieval produces candidates stamped with their derivation revision. AI7 uses Exact Fetch against the pinned Manuscript Revision or Source Version before quoting or asserting textual fidelity. Reference Integrity, Claim Support, and Factual Verification remain separate. Foundation Model knowledge may raise a question or guide research, but it is not evidence. Corrections remain exact-revision proposals until an editor decides and a separate Effect applies them.

### Workflow and delivery

AI7 advances a deliverable through deterministic workflow commands. Review Decisions, Signoff Records, delivery Effects, External Export Policy, and Public Release Permission remain separate. Workflow completion and Codex completion prove none of the others.

## Failure and continuation boundaries

| Failure or user action | Durable truth | Required response |
| --- | --- | --- |
| Renderer crash or reload | Service-owned manuscript journal, Task Ledger, and workflow state | Recreate projections and reopen the bounded editor window; do not infer lost or committed work from renderer state. |
| Electron main exit | Service persistence and last acknowledged journal state | Shut down supervised children when possible; on restart reconcile from authoritative stores. |
| AI7 service crash | On-disk manuscript, domain ledgers, command outbox, receipts, and continuation checkpoints | Recover the service first. Renderer or Codex state cannot advance business records independently. |
| Codex process/protocol failure | AI7 Run and attempt plus the last exact Harness Execution Span reference | Mark technical execution interrupted or indeterminate; preserve the Run; never fabricate Task Outcome or Effect failure. |
| Provider failure before any ambiguous external action | Frozen Approved Fallback Chain and policy | Use only the next compatible approved binding when AI7 classifies retry as safe. |
| Final provider payload violates scope or egress policy | Complete assembled payload plus the bound Run Source Scope, Provider Resolution Plan, and Outbound Data Category | Refuse transmission, pause the execution, and expose a safe AI7 reason without sending any part of the payload. |
| Ambiguous provider or external Effect outcome | Effect identity, attempt, request and observed evidence | Stop automatic retry and fallback; require reconciliation or Manual Outcome Resolution. |
| Capability refusal or scope drift | Current Plan Envelope, activation, grants and Run Source Scope | Refuse with no side effect. Material drift requires Plan Revision and renewed Run Authorization. |
| User pause | Same Run and current attempt state | Stop dispatch at a safe boundary and retain a continuation checkpoint. |
| User cancel | Same Run plus already committed Effects/receipts | Interrupt pending execution; never claim cancellation reversed a committed Effect. |
| Resume | Same Task Intent, Plan Envelope and Run | Continue from authoritative AI7 state, possibly through a new technical span. |
| Retry | Same unchanged Run, new safe attempt | Create an explicitly linked attempt only when repetition is safe. |
| Redo | New semantics or fresh requested result | Create a new authorized Run. |
| Replay | Existing durable records | Perform no model call, capability invocation, or Effect. |

## Persistence boundary

The logical causal graph has two ledgers:

- the **AI7 Task Ledger** owns Task Intents, Run Records, attempts, commands, decisions, Effects, outcomes, workflow references, and provenance; and
- the **Harness Session Ledger** owns Codex messages, Threads, Turns, Items, tool calls/results, compaction, diagnostics, and technical attempt history.

The cardinality is explicit: one Run owns one or more attempts; each attempt owns exactly one immutable Execution Binding and exactly one Codex Session lineage; each binding may reference one or more Harness Execution Spans. A Session lineage may never cross Run, Book, Run Source Scope, Provider Resolution Plan, or Outbound Data Category boundaries. Resume within the same attempt may add a new span only under the identical binding. Retry creates a new attempt, binding, and Session lineage. Permission expansion requires a Plan Revision and renewed Run Authorization and can never mutate an existing binding; continuing work receives a newly bound attempt, or Redo when Run semantics change. A live permission reduction may immediately refuse a call or pause/interrupt execution; the historical binding remains immutable.

Bindings pin exact identities and semantic digests, including the AI7 behavior composition. Harness Execution Spans identify the exact technical ranges for dispatch, Resume, or Retry. Bindings carry references, never copied transcript content or transferred authority.

All product persistence sits under AI7-controlled locations inside the Agent Data Root except the Protected Secret Store. The portable channel keeps data inside the AI7 folder; the installer normally uses `%LOCALAPPDATA%\AI7`. Secrets never travel with a portable folder. Manuscripts and their derivatives never enter repositories, hosted CI, build artifacts, or shipped fixtures.

## Engineering verification

The standing CI surface is one Windows E2E suite covering complete user-facing journeys and regressions for observed bugs. It remains provider-free and contains no unpublished manuscript text or secret. Build or packaging runs only when needed to launch the E2E subject.

There are no separate architecture-closure, unit, integration, contract, property, coverage, static-analysis, performance, security, provider, schema, ABI, packaging, replay, provenance, reproducibility, or release-proof gates. The accepted product behaviors above remain requirements and may be exercised through complete journeys.

## Design boundary

This candidate selects responsibilities and seams. It does not select a Codex version, package, exact protocol, process form, or maintenance form; copy or modify source; install dependencies; authorize implementation; decompose implementation issues; or change canonical `main`. Those actions require later owner acceptance, Commander integration, and separate implementation authorization.
