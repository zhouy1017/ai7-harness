# DeepSeek Harness integration

Status: **V2 candidate contract; design description, not exact dependency selection or implementation authorization**

DeepSeek Harness (DSH) is the sole production **Primary Agent Harness** for V2. It supplies the generic agent loop. AI7 composes that loop inside the Node service behind one AI7-owned boundary and retains all product, business, authority, persistence, provider, capability, and Effect decisions.

All Foundation-Model-driven AI7 work uses this boundary: editorial analysis, factual review, proposal generation, learning and Policy-revision candidates, and subagent work. AI7 services may perform deterministic work directly, but no AI7 module, capability implementation, or admitted plugin may call a model provider outside `PrimaryAgentHarness` or bypass its binding and final egress gate.

This contract describes what AI7 expects from the composition and how AI7 responds when a DSH detail differs. It does not require proof before architecture can proceed.

## Integration role

The module is named `PrimaryAgentHarness`. Its production implementation composes pinned DSH packages in-process; its callers never depend on DSH or Cordis types.

The module hides:

- DSH Session, turn, step, tool-call, subagent, compaction, and approval vocabularies;
- Cordis composition, plugin wiring, profile/bundle/preset assembly, and configuration schema versions;
- technical session storage layout, event taxonomies, delta assembly, and backpressure;
- DSH built-in coding assumptions and the configuration that disables them;
- provider-specific invocation details and transient credential delivery; and
- which behavior comes from a DSH package, an AI7-owned extension, or an admitted third-party plugin.

Domain callers see AI7 Tasks, Runs, execution attempts, proposals, findings, capability calls, clarification, usage, and technical terminal status. They never see a raw model response or DSH event as business truth.

## Composition contract

The interface is intentionally small. Names are architectural, not committed TypeScript signatures.

| Operation | AI7-shaped contract |
| --- | --- |
| `prepareExecution(request)` | Composes or locates a DSH technical session without starting an Effect-capable model turn. The request contains Task/Run/attempt identity, continuation kind, Plan Envelope digest, source-scope digest, grants, provider plan, budget, and the pinned AI7 behavior composition. Returns an opaque handle and exact DSH technical identities. |
| `bindExecution(handle, binding)` | Verifies the already-persisted AI7 Execution Binding and freezes the per-execution context. No later tool call may change scope, grants, provider chain, budget, composition pins, or authority-bearing pins. |
| `submit(handle, input)` | Starts or steers a turn only for a bound execution. Input is editor/task material already authorized for this Run. |
| `observe(handle)` | Produces one ordered stream of the closed AI7 signal set below. Raw DSH events do not escape the module. |
| `answerTechnicalRequest(handle, requestId, response)` | Answers a DSH execution-layer request. The response may never create an AI7 authorization, decision, or receipt. |
| `reportCapabilityOutcome(handle, invocationId, outcome)` | Returns the AI7-classified and already-persisted capability result to the waiting DSH tool call: committed with receipt reference, refused, failed with no Effect, or ambiguous. Raw authority records, secrets, and unclassified tool results do not cross back. |
| `interrupt(handle, reason)` | Requests cooperative interruption and ultimately yields a terminal technical signal. It makes no claim about already committed Effects. |
| `finish(handle)` | Finalizes the technical span and returns an exact Harness Execution Span descriptor for append-only association with the Execution Binding. |
| `describeComposition()` | Reports the exact pinned package subset, composed configuration digest, admitted plugin pins, technical session store, and known implementation assumptions for diagnostics and support. It grants no runtime authority. |

### Execution request

An execution request contains references or digests for:

- Task Intent, Run Record, execution attempt, and `Dispatch` / `Resume` / `Retry` attribution;
- Execution Plan and Plan Envelope;
- exact Book, deliverable, Manuscript Pin, Run Source Scope, and allowed roots;
- Task Skill Activation and Effective Capability Grants;
- Provider Resolution Plan, Approved Fallback Chain, Model Role bindings, Outbound Data Category, and opaque Credential References;
- active Policy Documents and applicable decision/authority pins;
- per-Run and instance budget ceilings; and
- the exact AI7 behavior-composition version and digest, covering instructions, context selection, compaction, subagent policy, the policy that disables DSH defaults, and the composed package/plugin pins.

The boundary may derive technical configuration from these inputs. It may not broaden, reinterpret, or persist them as DSH-owned authority.

### Signal set

`observe` projects DSH activity into a small closed set:

| Signal | Meaning |
| --- | --- |
| `started` | A technical turn began. No business transition follows. |
| `progress` | User-readable activity or a bounded progress update. It is a projection, not proof of progress. |
| `contentCandidate` | Model output awaiting AI7 validation and persistence as a proposal, finding, answer, or other record. |
| `capabilityRequested` | DSH dispatched to one exposed AI7 Capability. AI7 still checks and executes it. |
| `clarificationNeeded` | The execution cannot safely continue inside its current envelope without editor input. AI7 persists the Clarification Request. |
| `usage` | Technical model/token/cost information for budget accounting. |
| `completed` | The technical turn ended normally. It is not Task Outcome, workflow completion, factual truth, or Effect proof. |
| `interrupted` | The technical turn stopped after interruption. It says nothing about committed Effects. |
| `failed` | A technical failure with a safe classified reason. AI7 decides Run state and continuation. |
| `ambiguous` | The boundary cannot establish a safe outcome or continuation. Automatic retry and fallback stop. |

Signals for one bound execution are ordered; exactly one terminal signal is last. Where the DSH event stream does not already provide this shape, the boundary normalizes it.

## Binding and ledger separation

DSH technical history and AI7 business history remain distinct:

| Record | Owner | Contains | Never means |
| --- | --- | --- | --- |
| Task Ledger / Run Record | AI7 | Intent, plan, authorization, attempts, decisions, Effects, outcome, provenance links | Model transcript or DSH lifecycle |
| Harness Session Ledger | DSH composition | Model messages, Sessions, turns, steps, tool calls/results, compaction, technical events | Workflow state, Effect receipt, manuscript authority |
| Execution Binding | AI7 | Immutable association among Task, Run, plan digest, attempt, scope/grant/provider/behavior-composition digests, composition and plugin pins, and DSH Session lineage | Authorization or transcript copy |
| Harness Execution Span | Technical ledger, referenced by AI7 | Exact event range or range set for one dispatch, Resume, or Retry | Run, attempt, or completion proof |
| Effect records | AI7 | Stable Effect identity, target/payload, replay policy, approval, attempt evidence, receipt or ambiguity | DSH tool approval or tool result |

The cardinality is fixed: one Run has one or more attempts; one attempt has exactly one immutable Execution Binding; one binding has exactly one DSH Session lineage and one or more Harness Execution Spans. The Session lineage may contain the exact technical identities required for restart, but it may never cross a Run, Book, Run Source Scope, Provider Resolution Plan, or Outbound Data Category boundary.

`prepareExecution` may create the technical identity AI7 needs. Before `submit` can invoke a model-visible capability, AI7 persists the Execution Binding and `bindExecution` verifies it. Resume in the same attempt may attach a new Harness Execution Span only to the identical immutable binding and Session lineage. Retry creates a new attempt, new binding, and new Session lineage. Permission expansion requires a Plan Revision and renewed Run Authorization; it never rebinds or mutates a live handle, and continuing work uses a new attempt/binding or Redo when Run semantics change. A live permission reduction may refuse the next call or pause/interrupt the current execution immediately. Reopening the same attempt with any drift — including a changed composition or plugin pin — fails closed; the boundary never creates an attempt itself.

The Task Ledger stores references to technical spans, not model messages or tool results. DSH technical events may point to neutral correlation identifiers but cannot name, create, or mutate AI7 domain records.

## Capability seam

Editorial Runs receive only AI7 domain capabilities. Typical families include exact manuscript fetch, scoped source retrieval, proposal creation, workflow queries, evidence-bearing research, and bounded import/export over a user-chosen file or destination.

Every call is enforced twice:

1. the DSH-facing tool registry advertises only capabilities admitted by the Task Skill Activation and Effective Capability Grants; and
2. the AI7 Capability Facade independently validates the current Run, plan, scope, operation, target, payload, provider/outbound policy, and authority state before doing anything.

The facade is decisive. A forged tool name, direct internal call, stale binding, out-of-scope path, changed payload, or widened permission fails with no side effect. A DSH approval or sandbox state cannot override it.

Every capability call has one `invocationId` visible at the boundary. The DSH tool call waits until AI7 calls `reportCapabilityOutcome`; the boundary never manufactures success from a raw implementation return. AI7 persists the authoritative classification first, then returns only the bounded result the model needs. If the outcome is uncertain, `ambiguous` is returned and automatic retry/fallback stops.

The Editorial Capability Profile exposes no generic shell, process runner, roaming filesystem, arbitrary network, marketplace or plugin installation, version-control/review tool, or developer-mode escalation. This is achieved first by package selection — the excluded tool packages are absent from the dependency graph, not merely unwired — and then by composition, the tool registry, and the facade. The Developer Capability Profile does not ship, and there is no self-service escalation between profiles.

## Effect seam

DSH may dispatch to a capability whose successful execution would create an Effect. The following order remains AI7-owned:

1. construct a stable Effect Intent with exact target, payload, replay policy, and idempotency identity;
2. evaluate drift and obtain the applicable Effect Approval or other named authority;
3. persist the attempt association before committing an externally visible or authoritative mutation;
4. execute through a deterministic AI7 command or bounded capability implementation;
5. verify the outcome and persist an Effect Receipt, or classify it as ambiguous/failed with exact evidence; and
6. project the result back to the harness and the UI.

A DSH tool-call identifier is correlation only. A DSH success, approval response, turn completion, or boundary signal is never an Effect Receipt. If commitment may have occurred but cannot be established, the boundary yields `ambiguous` and no provider fallback, tool retry, or new attempt occurs automatically.

When a requested capability needs Effect Approval and no valid exact approval exists, AI7 persists the Effect Intent and a durable pending-approval state, suspends the capability invocation, and projects the request through AI7 UI/records. The DSH technical call remains waiting or is safely interrupted; no Effect runs. The pending state survives renderer, service, and harness restart. Recovery rechecks the same invocation, binding, Effect identity, target, payload, plan, scope, policy, and approval validity before `reportCapabilityOutcome` may resume the call. Denial or cancellation returns `refused`. Drift invalidates the approval and requires a new Effect Intent/approval path; it never floats to changed work.

## Provider and credential seam

AI7 Task Skills declare Model Roles, not provider names. Provider Preflight resolves those roles before Run Authorization and freezes:

- exact provider/model bindings and compatibility requirements;
- the Approved Fallback Chain;
- Outbound Data Category and permitted source scope;
- budget limits; and
- opaque Credential References.

DeepSeek is the primary provider and supplies the default binding for every Model Role: V4 Flash for the Fast Interaction Role, V4 Pro High for the Main Editorial Role, and V4 Pro Max for the Difficult Escalation Role and, by default, the Frontier Model Role. It is not exclusive: the user may explicitly configure another eligible provider/model for the Frontier Model Role. That alternative binding enters the same Provider Resolution Plan, the same DSH loop, the same credential brokering, and the same egress gate. It creates no second harness, no silent runtime fallback, and no separate authority path.

DSH receives only the resolved binding needed for the turn. It may not discover, insert, or choose providers outside the frozen plan, and no DSH default provider configuration reaches an editorial Run. Fallback advances only when AI7 classifies the preceding outcome as unambiguously safe. Any ambiguous provider or Effect outcome stops fallback.

### Final Provider Payload/Egress Gate

Immediately before **every** model transmission, the AI7-owned gate receives the final serialized/model-bound payload after DSH context assembly. It evaluates the complete payload, including new input, prior Session messages, compaction summaries, tool results, generated context, subagent context, and any default/system/developer instructions. Checking only the newly selected context is insufficient.

The gate compares every included datum and instruction source with the immutable Execution Binding, Run Source Scope, Provider Resolution Plan, Outbound Data Category, and active egress policy. The payload is transmitted only as one accepted whole. Any unexplained, stale, out-of-scope, wrong-provider, wrong-category, or disabled-default content fails closed: send nothing, pause the execution, and return a safe AI7 reason. Neither DSH, a provider adapter, nor an admitted plugin may bypass or weaken this last gate.

The Credential Broker resolves secrets from the OS-protected store just in time through the narrowest supported mechanism. Values never enter Task Skills, behavior instructions, model-visible context, the Task Ledger, DSH Session content, generic environment dumps, tool results, or diagnostics.

Configured model-provider transmission is controlled processing, not public release. Reading within a Run Source Scope does not by itself permit outbound transmission. Provider Processing Policy, External Export Policy, and Public Release Permission remain separate AI7 policies and records.

## Process, scheduling, and lifecycle seam

The composed DSH runtime lives inside the AI7 Node service process. No DSH endpoint listens on TCP. The boundary owns composition lifecycle, readiness, backpressure, interruption, failure detection, shutdown, and cleanup.

Application startup and local editing are independent of DSH and of any provider. The harness composition initializes lazily for an authorized agent execution. A harness failure terminates or ambiguates a technical span; it cannot corrupt the authoritative manuscript or advance the Task Ledger. After restart, AI7 may reattach only the identical attempt, binding, and composition pins. Otherwise it pauses for explicit Resume, Retry, Redo, or reconciliation.

**AI7 schedules; DSH converses.** AI7's scheduling and budget governor decides which Runs exist, when they execute, how many run concurrently, and how budget is shared. AI7's business scheduling does not use the Harness `schedule`, `jobs`, or workflow packages, and those packages are not in the selected subset. Each execution has immutable scope and strictly non-shared scratch and cache, plus its own mutable authority state. If one composed runtime instance cannot isolate concurrent executions cleanly, the boundary may compose one instance per Run or supervise a bounded isolated pool. That is a topology response, not a second loop.

DSH-owned subagents, if used, remain inside the parent execution attempt and inherit its scope, grants, providers, and budget. They create no AI7 Task, Run, attempt, decision, or authority record. If a suitable subagent mechanism is unavailable for a workflow, AI7 uses a single agent; it does not build a second generic loop.

## Composition and extension policy

Choose the smallest implementation that keeps the boundary coherent:

1. Configure the pinned DSH subset — profiles, bundles, presets, context assembly, tool pipelines, policy seams — to express the required behavior directly.
2. Add AI7-owned translation, capability implementation, and enforcement inside or beneath `PrimaryAgentHarness` when the difference is product-specific.
3. Use a documented DSH extension seam (a Cordis plugin authored by AI7, a provider or tool contribution point) when the behavior belongs inside the loop.
4. Only for an identified need with no adequate answer above, admit a **Third-Party DSH Plugin** under [ADR 0002](./adr/0002-admit-and-pin-third-party-dsh-plugins.md).

This order is a preference, not a gate. No capability-gap proof, score, prototype, cost model, or owner interview is required before choosing among the first three during authorized implementation.

Forking the generic agent loop is out of scope. AI7 never writes a second implementation of it, and a fork requires an accepted seam-gap decision through the [Decision Queue](./DECISION-QUEUE.md).

### Package and plugin pinning

- Consume DSH as exactly pinned public npm packages: retain ADR 0020's `0.1.0-rc.6` baseline, install the selected subset only at one coherent version, and commit the lockfile.
- Never depend on the `@deepseek-ai/dsh` CLI aggregate; it transitively installs the generic shell, pwsh, terminal, and web tool packages the editorial surface excludes.
- Never use `^`, `~`, a branch, a mutable tag, or `latest`.
- A pin bump is one explicit development change at a time. Only the applicable Windows E2E journeys and regressions for observed bugs are standing verification; composition diffs, capability-exposure diffs, schema checks, notice regeneration, ABI checks, and replay do not become separate gates. Applicable notices still remain current in every build.
- An admitted third-party plugin follows the same discipline through its Plugin Admission Snapshot and immutable Local Plugin Pin, resolved from the AI7-controlled local plugin store plus the committed manifest and lockfile, with no automatic update and a retained rollback predecessor.
- Every admitted package and plugin contributes to the maintained third-party notices file in every build. Harness is never user-facing branding; the product display name is exactly **AI7**.

## Codex Interaction Model Reference

Codex is not a dependency, process, provider, session owner, fallback, or source baseline. It remains an engineering reference from which AI7 may reinterpret:

- a task composer that keeps scope and intended outcome visible;
- progressive activity that can be interrupted without losing the task record;
- durable task history with clear continuation actions;
- focused clarification at the point of ambiguity;
- reviewable proposed changes before mutation;
- concise context and capability disclosure before authorization;
- separation between conversational progress and committed outcomes; and
- host/runtime boundary and extension-design patterns for keeping an agent contained inside a desktop application.

AI7 adapts these principles to a manuscript-centered, Chinese-first professional editor. The primary surface is the Book, manuscript, evidence, proposal, and workflow — not a coding chat or terminal. No Codex brand, geometry, copy, assets, GUI source, coding presets, or coding-agent purpose is inherited.

## Implementation assumptions

The assumptions affecting this contract and the design response if they prove wrong are in [ASSUMPTIONS.md](./ASSUMPTIONS.md). They are implementation notes, not prerequisites for accepting this architecture and not a request for evidence work.

## Non-decisions

This document retains ADR 0020's exact DSH `0.1.0-rc.6` baseline but does not choose the final package list, configuration schema, plugin, provider endpoint, model identifier, credential, or package layout. It does not authorize a GitHub search, plugin download or installation, dependency change, source copy, prototype, product implementation, or canonical record change.
