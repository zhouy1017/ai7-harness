# Codex integration

Status: **V2 candidate contract; design assumption, not dependency selection or implementation authorization**

Codex is the assumed sole **Primary Agent Harness** for V2. It supplies the generic agent loop. AI7 places that loop behind one AI7-owned module in the Node service and retains all product, business, authority, persistence, provider, capability, and Effect decisions.

All Foundation-Model-driven AI7 work uses this module: editorial analysis, factual review, proposal generation, learning and Policy-revision candidates, and subagent work. AI7 services may perform deterministic work directly, but they may not call a model provider outside `PrimaryAgentHarness` or bypass its binding and final egress gate.

This contract replaces the former capability-closure seam. It describes what AI7 expects from the integration and how AI7 responds when a Codex detail differs. It does not require proof before architecture can proceed.

## Integration role

The module is named `PrimaryAgentHarness`. Its production implementation is Codex-backed; its callers never depend on Codex protocol types.

The module hides:

- Codex Thread, Turn, Item, subagent, compaction, and approval vocabularies;
- protocol framing, schema versions, transport, process lifecycle, storage layout, and backpressure;
- model/tool event taxonomies and delta assembly;
- built-in coding assumptions and any suppression or source changes needed to remove them;
- provider-specific invocation details and transient credential delivery; and
- whether Codex runs through a public integration seam or a small AI7-maintained source build.

Domain callers see AI7 Tasks, Runs, execution attempts, proposals, findings, capability calls, clarification, usage, and technical terminal status. They never see a raw Codex response as business truth.

## Adapter contract

The interface is intentionally small. Names are architectural, not committed TypeScript signatures.

| Operation | AI7-shaped contract |
| --- | --- |
| `prepareExecution(request)` | Creates or locates a Codex technical session without starting an Effect-capable model turn. The request contains Task/Run/attempt identity, continuation kind, Plan Envelope digest, source-scope digest, grants, provider plan, budget, and the pinned AI7 behavior composition. Returns an opaque handle and exact Codex technical identities. |
| `bindExecution(handle, binding)` | Verifies the already-persisted AI7 Execution Binding and freezes the per-execution context. No later tool call may change scope, grants, provider chain, budget, or authority-bearing pins. |
| `submit(handle, input)` | Starts or steers a turn only for a bound execution. Input is editor/task material already authorized for this Run. |
| `observe(handle)` | Produces one ordered stream of the closed AI7 signal set below. Raw protocol events do not escape the module. |
| `answerTechnicalRequest(handle, requestId, response)` | Answers a Codex execution-layer request. The response may never create an AI7 authorization, decision, or receipt. |
| `reportCapabilityOutcome(handle, invocationId, outcome)` | Returns the AI7-classified and already-persisted capability result to the waiting Codex tool call: committed with receipt reference, refused, failed with no Effect, or ambiguous. Raw authority records, secrets, and unclassified tool results do not cross back. |
| `interrupt(handle, reason)` | Requests cooperative interruption and ultimately yields a terminal technical signal. It makes no claim about already committed Effects. |
| `finish(handle)` | Finalizes the technical span and returns an exact Harness Execution Span descriptor for append-only association with the Execution Binding. |
| `describeIntegration()` | Reports the selected adapter/source identity, integration form, technical session store, and known implementation assumptions for diagnostics and support. It grants no runtime authority. |

### Execution request

An execution request contains references or digests for:

- Task Intent, Run Record, execution attempt, and `Dispatch` / `Resume` / `Retry` attribution;
- Execution Plan and Plan Envelope;
- exact Book, deliverable, Manuscript Pin, Run Source Scope, and allowed roots;
- Task Skill Activation and Effective Capability Grants;
- Provider Resolution Plan, Approved Fallback Chain, Model Role bindings, Outbound Data Category, and opaque Credential References;
- active Policy Documents and applicable decision/authority pins;
- per-Run and instance budget ceilings; and
- the exact AI7 behavior-composition version and digest, covering instructions, context selection, compaction, subagent policy, and the policy that disables Codex defaults.

The adapter may derive technical configuration from these inputs. It may not broaden, reinterpret, or persist them as Codex-owned authority.

### Signal set

`observe` projects Codex activity into a small closed set:

| Signal | Meaning |
| --- | --- |
| `started` | A technical turn began. No business transition follows. |
| `progress` | User-readable activity or a bounded progress update. It is a projection, not proof of progress. |
| `contentCandidate` | Model output awaiting AI7 validation and persistence as a proposal, finding, answer, or other record. |
| `capabilityRequested` | Codex selected one exposed AI7 Capability. AI7 still checks and executes it. |
| `clarificationNeeded` | The execution cannot safely continue inside its current envelope without editor input. AI7 persists the Clarification Request. |
| `usage` | Technical model/token/cost information for budget accounting. |
| `completed` | The technical turn ended normally. It is not Task Outcome, workflow completion, factual truth, or Effect proof. |
| `interrupted` | The technical turn stopped after interruption. It says nothing about committed Effects. |
| `failed` | A technical failure with a safe classified reason. AI7 decides Run state and continuation. |
| `ambiguous` | The adapter cannot establish a safe outcome or continuation. Automatic retry and fallback stop. |

Signals for one bound execution are ordered; exactly one terminal signal is last. If the underlying Codex surface cannot provide this directly, the adapter or maintained source build normalizes it.

## Binding and ledger separation

Codex technical history and AI7 business history remain distinct:

| Record | Owner | Contains | Never means |
| --- | --- | --- | --- |
| Task Ledger / Run Record | AI7 | Intent, plan, authorization, attempts, decisions, Effects, outcome, provenance links | Model transcript or Codex lifecycle |
| Harness Session Ledger | Codex integration | Messages, Threads, Turns, Items, tool calls/results, compaction, technical events | Workflow state, Effect receipt, manuscript authority |
| Execution Binding | AI7 | Immutable association among Task, Run, plan digest, attempt, scope/grant/provider/behavior-composition digests, adapter identity, and Codex Session lineage | Authorization or transcript copy |
| Harness Execution Span | Technical ledger, referenced by AI7 | Exact event range or range set for one dispatch, Resume, or Retry | Run, attempt, or completion proof |
| Effect records | AI7 | Stable Effect identity, target/payload, replay policy, approval, attempt evidence, receipt or ambiguity | Codex tool approval or tool result |

The cardinality is fixed: one Run has one or more attempts; one attempt has exactly one immutable Execution Binding; one binding has exactly one Codex Session lineage and one or more Harness Execution Spans. The Session lineage may contain the exact technical identities required for restart, but it may never cross a Run, Book, Run Source Scope, Provider Resolution Plan, or Outbound Data Category boundary.

`prepareExecution` may create the technical identity AI7 needs. Before `submit` can invoke a model-visible capability, AI7 persists the Execution Binding and `bindExecution` verifies it. Resume in the same attempt may attach a new Harness Execution Span only to the identical immutable binding and Session lineage. Retry creates a new attempt, new binding, and new Session lineage. Permission expansion requires a Plan Revision and renewed Run Authorization; it never rebinds or mutates a live handle, and continuing work uses a new attempt/binding or Redo when Run semantics change. A live permission reduction may refuse the next call or pause/interrupt the current execution immediately. Reopening the same attempt with any drift fails closed; the adapter never creates an attempt itself.

The Task Ledger stores references to technical spans, not model messages or tool results. Codex technical events may point to neutral correlation identifiers but cannot name, create, or mutate AI7 domain records.

## Capability seam

Editorial Runs receive only AI7 domain capabilities. Typical families include exact manuscript fetch, scoped source retrieval, proposal creation, workflow queries, evidence-bearing research, and bounded import/export over a user-chosen file or destination.

Every call is enforced twice:

1. the Codex-facing tool projection advertises only capabilities admitted by the Task Skill Activation and Effective Capability Grants; and
2. the AI7 Capability Facade independently validates the current Run, plan, scope, operation, target, payload, provider/outbound policy, and authority state before doing anything.

The facade is decisive. A forged tool name, direct internal call, stale binding, out-of-scope path, changed payload, or widened permission fails with no side effect. Codex approval or sandbox state cannot override it.

Every capability call has one adapter-visible `invocationId`. Codex waits until AI7 calls `reportCapabilityOutcome`; the adapter never manufactures success from a raw implementation return. AI7 persists the authoritative classification first, then returns only the bounded result the model needs. If the outcome is uncertain, `ambiguous` is returned and automatic retry/fallback stops.

The Editorial Capability Profile exposes no generic shell, process runner, roaming filesystem, arbitrary network, marketplace/plugin installation, version-control/review tool, or developer-mode escalation. If the selected stock Codex integration cannot express that surface cleanly, AI7 changes the adapter, composition, or the small maintained Codex source build. Architecture does not wait for a capability score.

## Effect seam

Codex may request a capability whose successful execution would create an Effect. The following order remains AI7-owned:

1. construct a stable Effect Intent with exact target, payload, replay policy, and idempotency identity;
2. evaluate drift and obtain the applicable Effect Approval or other named authority;
3. persist the attempt association before committing an externally visible or authoritative mutation;
4. execute through a deterministic AI7 command or bounded capability implementation;
5. verify the outcome and persist an Effect Receipt, or classify it as ambiguous/failed with exact evidence; and
6. project the result back to Codex and the UI.

A Codex tool-call identifier is correlation only. A Codex success, approval response, turn completion, or adapter signal is never an Effect Receipt. If commitment may have occurred but cannot be established, the adapter yields `ambiguous` and no provider fallback, tool retry, or new attempt occurs automatically.

When a requested capability needs Effect Approval and no valid exact approval exists, AI7 persists the Effect Intent and a durable pending-approval state, suspends the capability invocation, and projects the request through AI7 UI/records. Codex's technical call remains waiting or is safely interrupted; no Effect runs. The pending state survives renderer, service, and Codex restart. Recovery rechecks the same invocation, binding, Effect identity, target, payload, plan, scope, policy, and approval validity before `reportCapabilityOutcome` may resume the call. Denial or cancellation returns `refused`. Drift invalidates the approval and requires a new Effect Intent/approval path; it never floats to changed work.

## Provider and credential seam

AI7 Task Skills declare Model Roles, not provider names. Provider Preflight resolves those roles before Run Authorization and freezes:

- exact provider/model bindings and compatibility requirements;
- the Approved Fallback Chain;
- Outbound Data Category and permitted source scope;
- budget limits; and
- opaque Credential References.

Codex receives only the resolved binding needed for the turn. It may not discover, insert, or choose providers outside the frozen plan. Fallback advances only when AI7 classifies the preceding outcome as unambiguously safe. Any ambiguous provider or Effect outcome stops fallback.

### Final Provider Payload/Egress Gate

Immediately before **every** model transmission, the AI7-owned gate receives the final serialized/model-bound payload after Codex context assembly. It evaluates the complete payload, including new input, prior Session messages, compaction summaries, tool results, generated context, subagent context, and any default/system/developer instructions. Checking only the newly selected context is insufficient.

The gate compares every included datum and instruction source with the immutable Execution Binding, Run Source Scope, Provider Resolution Plan, Outbound Data Category, and active egress policy. The payload is transmitted only as one accepted whole. Any unexplained, stale, out-of-scope, wrong-provider, wrong-category, or disabled-default content fails closed: send nothing, pause the execution, and return a safe AI7 reason. Neither Codex nor a provider adapter may bypass or weaken this last gate.

The Credential Broker resolves secrets from the OS-protected store just in time through the narrowest supported mechanism. Values never enter Task Skills, behavior instructions, model-visible context, the Task Ledger, Codex Session content, generic environment dumps, tool results, or diagnostics. If a stock Codex credential path cannot meet this, the adapter or maintained source build supplies a brokered path.

Configured model-provider transmission is controlled processing, not public release. External export and Public Release Permission remain separate AI7 policies and records.

## Process and lifecycle seam

The adapter lives in the AI7 Node service. It may call an in-process Codex extension or supervise a private local Codex child process over stdio. No Codex endpoint listens on TCP. The adapter owns start, readiness, backpressure, interruption, crash detection, shutdown, and orphan cleanup.

Application startup and local editing are independent of Codex. Codex starts lazily for an authorized agent execution. A Codex crash terminates or ambiguates a technical span; it cannot corrupt the authoritative manuscript or advance the Task Ledger. After restart, AI7 may reattach only the identical attempt and binding. Otherwise it pauses for explicit Resume, Retry, Redo, or reconciliation.

AI7's instance governor controls how many Runs execute and how budget is shared. Each execution has immutable scope, scratch, cache, and mutable authority state. If one Codex process cannot isolate concurrent executions simply, the adapter may supervise one process per Run or a bounded isolated pool. That is a topology response, not a second loop.

Codex-owned subagents, if used, remain inside the parent execution attempt and inherit its scope, grants, providers, and budget. They create no AI7 Task, Run, attempt, decision, or authority record. If the chosen Codex surface lacks a suitable subagent feature, AI7 uses a single agent for that workflow; it does not build a second generic loop.

## Adapter-first and source-development policy

Choose the smallest implementation that keeps the boundary coherent:

1. Use public configuration, protocol, tool, MCP, plugin, or extension seams when they express the required behavior directly.
2. Add AI7-owned translation and enforcement inside `PrimaryAgentHarness` when the difference is product-specific.
3. Use a small maintained Codex source build or fork when direct source development is simpler, safer, or more local than layered workarounds—for example to remove coding-native tool registration, expose a lifecycle hook, broker credentials, control technical storage, or normalize terminal events.

This order is a preference, not a gate. No capability-gap proof, score, prototype, cost model, or owner interview is required before choosing a small source change during authorized implementation. The implementation team records the chosen Codex baseline, the narrow maintained difference, applicable license/NOTICE work, and the upstream-update approach as ordinary engineering documentation.

A source build remains bounded when it:

- preserves Codex as the only generic loop rather than copying the loop into AI7;
- changes executor mechanics, not AI7 product authority;
- stays behind the same adapter contract;
- avoids importing the Codex app, coding presets, generic UI, or branding; and
- is small enough for AI7 to understand and maintain as part of normal product work.

If the required source change becomes a broad independent agent platform, materially widens product authority, or makes DeepSeek runtime attractive, stop and return that expansion to the owner. DeepSeek never enters automatically.

## Codex Desktop-like interaction reference

AI7 may borrow interaction principles, not implementation:

- a task composer that keeps scope and intended outcome visible;
- progressive activity that can be interrupted without losing the task record;
- durable task history with clear continuation actions;
- focused clarification at the point of ambiguity;
- reviewable proposed changes before mutation;
- concise context and capability disclosure before authorization; and
- separation between conversational progress and committed outcomes.

AI7 adapts these principles to a manuscript-centered, Chinese-first professional editor. The primary surface is the Book, manuscript, evidence, proposal, and workflow—not a coding chat or terminal. No Codex brand, geometry, copy, assets, source, or generic agent defaults are inherited.

## Implementation assumptions

The assumptions affecting this contract and the design response if they prove wrong are in [ASSUMPTIONS.md](./ASSUMPTIONS.md). They are implementation notes, not prerequisites for accepting this architecture and not a request for evidence work.

## Non-decisions

This document does not choose an exact Codex version, release artifact, protocol, in-process versus child-process form, provider, model, package layout, or maintenance form. It does not authorize a source copy, fork, dependency installation, prototype, product implementation, or canonical record change.
