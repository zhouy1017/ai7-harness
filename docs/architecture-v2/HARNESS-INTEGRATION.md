# DeepSeek Harness integration

Status: **frozen design reference as of `dev@4c50ce31b0f15ff2bfadd2af17fc914c317e0f22` under [ADR 0064](../adr/0064-reweight-repository-development-toward-value-first-delivery.md); composition contract; not dependency selection or action authorization**

DeepSeek Harness (DSH) is the sole production **Primary Agent Harness** for V2. It supplies the generic agent loop. AI7 composes that loop inside the Node service behind one AI7-owned boundary and retains all product, business, authority, persistence, provider, capability, and Effect decisions.

All Foundation-Model-driven AI7 work uses this boundary: covered editorial analysis, factual review, proposal generation, learning and Policy-revision candidates, and subagent work. AI7 services may perform deterministic work directly, but no AI7 module, capability implementation, or native DSH Plugin may call a model provider outside `PrimaryAgentHarness` or bypass its binding and final egress gate.

This contract describes what AI7 expects from the composition and how AI7 responds when a DSH detail differs. It does not require proof before architecture can proceed.

## Integration role

The module is named `PrimaryAgentHarness`. Its production implementation composes pinned DSH packages in-process; its callers never depend on DSH or Cordis types.

The module hides:

- DSH Session, turn, step, tool-call, subagent, compaction, and approval vocabularies;
- Cordis composition, plugin wiring, profile/bundle/preset assembly, and configuration schema versions;
- technical session storage layout, event taxonomies, delta assembly, and backpressure;
- DSH built-in coding assumptions and the configuration that disables them;
- provider-specific invocation details and transient credential delivery; and
- which behavior comes from a pinned core DSH package, native DSH Skill/Plugin/Bundle/Profile/Agent Preset revision, imported-Skill working revision, or AI7-owned extension.

Domain callers see AI7 Tasks, Runs, execution attempts, proposals, findings, capability calls, clarification, usage, and technical terminal status. They never see a raw model response or DSH event as business truth.

## Composition contract

The interface is intentionally small. Names are architectural, not committed TypeScript signatures.

| Operation | AI7-shaped contract |
| --- | --- |
| `prepareExecution(request)` | Composes or locates a DSH technical session without starting an Effect-capable model turn. The request contains Task/Run/attempt identity, continuation kind, Plan Envelope digest, source-scope digest, grants, provider plan, exact Run Budget Ceiling state, and the pinned AI7 behavior composition. Returns an opaque handle and exact DSH technical identities. |
| `bindExecution(handle, binding)` | Verifies the already-persisted AI7 Execution Binding and freezes the per-execution context. No later tool call may change scope, grants, provider chain, Run Budget Ceiling state, composition pins, or authority-bearing pins. |
| `submit(handle, input)` | Starts or steers a turn only for a bound execution. Input is editor/task material already authorized for this Run. |
| `observe(handle)` | Produces one ordered stream of the closed AI7 signal set below. Raw DSH events do not escape the module. |
| `answerTechnicalRequest(handle, requestId, response)` | Answers a DSH execution-layer request. The response may never create an AI7 authorization, decision, or receipt. |
| `reportCapabilityOutcome(handle, invocationId, outcome)` | Returns the AI7-classified and already-persisted capability result to the waiting DSH tool call: committed with receipt reference, refused, failed with no Effect, or ambiguous. Raw authority records, secrets, and unclassified tool results do not cross back. |
| `interrupt(handle, reason)` | Requests cooperative interruption and ultimately yields a terminal technical signal. It makes no claim about already committed Effects. |
| `finish(handle)` | Finalizes the technical span and returns an exact Harness Execution Span descriptor for append-only association with the Execution Binding. |
| `describeComposition()` | Reports the exact pinned core package subset, composed configuration digest, native artifact revision identities and applicable AI7-managed binding digests, technical session store, and known implementation assumptions for diagnostics and support. It grants no runtime authority. |

### Execution request

An execution request contains references or digests for:

- Task Intent, Run Record, execution attempt, and `Dispatch` / `Resume` / `Retry` attribution;
- Execution Plan and Plan Envelope;
- exact Book, deliverable, Manuscript Pin, Run Source Scope, and allowed roots;
- exact native DSH artifact revisions, applicable AI7-managed provenance/compatibility/scope/Authority Ceiling data, the exact per-Run activation binding, and Effective Capability Grants;
- Provider Resolution Plan, Approved Fallback Chain, Model Role bindings, Outbound Data Category, and opaque Credential References;
- active Policy Documents, trusted operational Provider scope, authority origin (direct user / matching Default Execution Rule / matching Background Analysis Enrollment), and applicable decision/authority pins;
- exact DSH Analysis Contract, Coverage Manifest/Result Set targets, and required schema/reducer digests when the Run performs covered analysis;
- exact Run Budget Ceiling state for each Run (`unset` or explicit) plus usage-observation binding; and
- the exact AI7 behavior-composition version and digest, covering instructions, context selection, compaction, subagent policy, the policy that disables DSH defaults, and the composed core-package/native-artifact pins.

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
| `usage` | Technical model/token/cost information for usage observation and any explicit Run Budget Ceiling evaluation. |
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
| Execution Binding | AI7 | Immutable association among Task, Run, authority origin, plan digest, attempt, scope/grant/provider/policy/behavior-composition digests, exact native artifact revisions plus applicable AI7 binding state, analysis-contract/result targets where applicable, and DSH Session lineage | Authorization or transcript copy |
| Harness Execution Span | Technical ledger, referenced by AI7 | Exact event range or range set for one dispatch, Resume, or Retry | Run, attempt, or completion proof |
| Effect records | AI7 | Stable Effect identity, target/payload, replay policy, approval, attempt evidence, receipt or ambiguity | DSH tool approval or tool result |

The cardinality is fixed: one Run has one or more attempts; one attempt has exactly one immutable Execution Binding; one binding has exactly one DSH Session lineage and one or more Harness Execution Spans. The Session lineage may contain the exact technical identities required for restart, but it may never cross a Run, Book, Run Source Scope, Provider Resolution Plan, or Outbound Data Category boundary.

`prepareExecution` may create the technical identity AI7 needs. Before `submit` can invoke a model-visible capability, AI7 persists the Execution Binding and `bindExecution` verifies it. Resume in the same attempt may attach a new Harness Execution Span only to the identical immutable binding and Session lineage. Retry creates a new attempt, new binding, and new Session lineage. Permission expansion requires a Plan Revision and renewed Run Authorization; it never rebinds or mutates a live handle, and continuing work uses a new attempt/binding or Redo when Run semantics change. A current permission reduction must refuse the affected call and pause or interrupt the current execution. In particular, a newly effective Series Retrieval Exclusion preserves the old binding as history but invalidates its dispatch sufficiency; ordinary same-binding Resume is forbidden until Plan Revision and renewed authorization create a current binding. Reopening the same attempt with any drift — including a changed native artifact revision, imported working revision, AI7-managed scope/ceiling state, analysis contract, or composed configuration — fails closed; the boundary never creates an attempt itself.

The Task Ledger stores references to technical spans, not model messages or tool results. DSH technical events may point to neutral correlation identifiers but cannot name, create, or mutate AI7 domain records.

## Capability seam

Editorial Runs receive only AI7 domain capabilities. Typical families include exact manuscript fetch, scoped source retrieval, proposal creation, workflow queries, evidence-bearing research, and bounded import/export over a user-chosen file or destination. Harness never invokes a platform file dialog or filesystem operation directly; Electron main projects native interaction and the AI7 service retains the capability, authority, and outcome boundary.

Every call is enforced twice:

1. the DSH-facing tool registry advertises only capabilities admitted by the exact per-Run activation binding and Effective Capability Grants; and
2. the AI7 Capability Facade independently validates the current Run, plan, scope, operation, target, payload, provider/outbound policy, and authority state before doing anything.

The facade is decisive. A forged tool name, direct internal call, stale binding, out-of-scope path, changed payload, widened permission, or currently excluded Series target fails with no side effect. Every Series-scoped read rechecks the current versioned exclusion state; a DSH approval, frozen historical scope, or sandbox state cannot override it.

Every capability call has one `invocationId` visible at the boundary. The DSH tool call waits until AI7 calls `reportCapabilityOutcome`; the boundary never manufactures success from a raw implementation return. AI7 persists the authoritative classification first, then returns only the bounded result the model needs. If the outcome is uncertain, `ambiguous` is returned and automatic retry/fallback stops.

The model-visible Editorial Capability Profile exposes no generic shell, process runner, roaming filesystem, arbitrary network, artifact marketplace/install/update tool, version-control/review tool, or developer-mode escalation. This is achieved first by core package selection — the excluded tool packages are absent from the dependency graph, not merely unwired — and then by composition, the tool registry, and the facade. The human AI7 product UI may browse, acquire, validate, enable, update, disable, remove, or roll back native DSH artifacts through the separately governed artifact lifecycle, but the model cannot invoke those controls or turn them into Run authority. The Developer Capability Profile does not ship, and there is no self-service escalation between profiles.

## Effect seam

DSH may dispatch to a capability whose successful execution would create an Effect. The following order remains AI7-owned:

1. construct a stable Effect Intent with exact target, payload, replay policy, and idempotency identity;
2. evaluate drift and obtain the applicable Effect Approval or other named authority;
3. persist the attempt association before committing an externally visible or authoritative mutation;
4. execute through a deterministic AI7 command or bounded capability implementation;
5. verify the outcome and persist an Effect Receipt, or classify it as ambiguous/failed with exact evidence; and
6. project the result back to the harness and the UI.

A DSH tool-call identifier is correlation only. A DSH success, approval response, turn completion, or boundary signal is never an Effect Receipt. If commitment may have occurred but cannot be established, the boundary yields `ambiguous` and no provider fallback, tool retry, or new attempt occurs automatically.

Formal agent-originated Manuscript mutation is the stricter specialization of this seam. AI7 exposes one **AI7 Apply** command only after an editor explicitly confirms the exact Book, base Manuscript Pin, diff digest, and targets. Apply is single-use, immediately rechecks drift, requires explicit reconciliation or renewed confirmation when the base changed, and records the exact Effect outcome. No native artifact, Artifact Update Rule, Default Execution Rule, Background Analysis Enrollment, Run, DSH Session, Plugin, Capability Grant, or prior approval contains, inherits, reuses, or broadens Apply authority. Direct human typing remains a separate human-edit path.

When a requested capability needs Effect Approval and no valid exact approval exists, AI7 persists the Effect Intent and a durable pending-approval state, suspends the capability invocation, and projects the request through AI7 UI/records. The DSH technical call remains waiting or is safely interrupted; no Effect runs. The pending state survives renderer, service, and harness restart. Recovery rechecks the same invocation, binding, Effect identity, target, payload, plan, scope, policy, and approval validity before `reportCapabilityOutcome` may resume the call. Denial or cancellation returns `refused`. Drift invalidates the approval and requires a new Effect Intent/approval path; it never floats to changed work.

Local export preserves that order across a native OS seam. After the platform save/copy workflow resolves create/rename, cancel, or replace, the service freezes one Local Export Preparation per file with the exact final path, disposition, format, fidelity state and payload digest. It then persists the exact Effect Intent and Effect Approval before commit. Cancellation produces no attempted file Effect; a later target or disposition change invalidates preparation and approval; successful verification yields only a per-file local Effect Receipt; uncertainty yields an ambiguous outcome and no automatic retry. A native apply-to-all choice may authorize only the exact enumerated collisions, never unseen or future targets. The OS response, DSH tool result, and renderer state are never authority or receipt evidence.

## Provider and credential seam

Task Intents, native DSH artifacts, DSH Analysis Contracts, and AI7 services declare Model Roles, not provider names. Provider Preflight resolves those roles before Run Authorization and freezes:

- exact provider/model bindings and compatibility requirements;
- the Approved Fallback Chain;
- Outbound Data Category and permitted source scope;
- exact Run Budget Ceiling state and any reported Provider Account Limit blocker; and
- opaque Credential References.

DeepSeek is the primary provider and supplies the default binding for every Model Role: V4 Flash for the Fast Interaction Role, V4 Pro High for the Main Editorial Role, and V4 Pro Max for the Difficult Escalation Role and, by default, the Frontier Model Role. It is not exclusive: the user may explicitly configure another eligible provider/model for the Frontier Model Role. That alternative binding enters the same Provider Resolution Plan, the same DSH loop, the same credential brokering, and the same egress gate. It creates no second harness, no silent runtime fallback, and no separate authority path.

DSH receives only the resolved binding needed for the turn. It may not discover, insert, or choose providers outside the frozen plan, and no DSH default provider configuration reaches an editorial Run. Fallback advances only when AI7 classifies the preceding outcome as unambiguously safe. Any ambiguous provider or Effect outcome stops fallback.

### Final Provider Payload/Egress Gate

Immediately before **every** model transmission, the AI7-owned gate receives the final serialized/model-bound payload after DSH context assembly. It evaluates the complete payload, including new input, prior Session messages, compaction summaries, tool results, generated context, subagent context, and any default/system/developer instructions. Checking only the newly selected context is insufficient.

The gate compares every included datum and instruction source with the immutable Execution Binding, Run Source Scope, current effective restrictions, Provider Resolution Plan, Outbound Data Category, trusted operational-scope policy selection, and active egress policy. The payload is transmitted only as one accepted whole. Any unexplained, stale, out-of-scope, newly excluded, wrong-provider, wrong-category, wrong operational scope, or disabled-default content fails closed: send nothing, pause the execution, and return a safe AI7 reason. Already transmitted Provider data cannot be undone, but prior fetched evidence or Session context excluded since the old binding may not silently flow into a newly authorized payload. Neither DSH, a provider adapter, nor a native DSH Plugin may bypass or weaken this last gate.

The Credential Broker resolves secrets from the OS-protected store just in time through the narrowest supported mechanism. Values never enter native DSH artifacts, behavior instructions, model-visible context, the Task Ledger, DSH Session content, generic environment dumps, tool results, or diagnostics.

Configured model-provider transmission is controlled processing, not public release. Reading within a Run Source Scope does not by itself permit outbound transmission. Provider Processing Policy, External Export Policy, formal Manuscript Apply, and Public Release Permission remain separate AI7 policies and records.

Trusted build/launch authority binds exactly one immutable Provider Processing operational scope: `development-ci`→v1 (no live transmission), `fixture-recording`→v2 (only exact separately authorized `sample1` recording eligibility), or `ordinary-production`→v3. An ordinary product setting, environment variable, Provider, native artifact/Plugin, or cross-scope fallback cannot select or switch it; missing/unknown scope denies Provider Processing. This is a selection contract, not a runtime mode inside one Policy Document, and this design claims no executable selector exists today.

In ordinary production, v3 permits only two eligible exact Run origins. A newly user-initiated Task receives Run Authorization directly or through a matching active Default Execution Rule; the rule never creates or schedules a Task by itself. A new autonomous manuscript-analysis dispatch requires a matching active Background Analysis Enrollment and creates its own exact Task/Plan/Run provenance. Moving the same already-authorized Run out of the foreground changes presentation only and may continue inside its unchanged envelope. Any new idle, scheduled, post-checkpoint, import-triggered, or cross-Run dispatch without a new user Task requires the still-active Enrollment. Provider onboarding may offer a separate explicit Enrollment action, but Provider setup, credential configuration, import, artifact acquisition/install/enablement, DSH Session/Plugin membership, and Enrollment without a matching exact dispatch each authorize nothing.

Generation, remote embedding, reranking, subagent work, covered analysis, and reducer stages already declared in the frozen Plan Envelope inherit only that exact Run envelope; they do not require per-call/per-chunk privacy prompts. An undeclared operation class or expanded Provider/data/source/budget scope requires Plan Revision and renewed Run Authorization. DSH Session or Plugin membership never supplies the missing authority.

## Process, scheduling, and lifecycle seam

The composed DSH runtime lives inside the AI7 Node service process. No DSH endpoint listens on TCP. The boundary owns composition lifecycle, readiness, backpressure, interruption, failure detection, shutdown, and cleanup.

Application startup and local editing are independent of DSH and of any provider. The harness composition initializes lazily for an authorized agent execution. A harness failure terminates or ambiguates a technical span; it cannot corrupt the authoritative manuscript or advance the Task Ledger. After restart, AI7 may reconcile only the identical attempt, binding, and composition pins, then settles an ordinary safe interruption as Resume-ready Run State without calling `submit`; explicit user Resume plus lightweight revalidation is required before a new Harness Execution Span begins. Drift routes to Plan Revision/Redo and ambiguity to reconciliation. The separately authorized Start When Online path remains the narrow automatic-dispatch exception after unchanged Reconnect Preflight.

**AI7 schedules; DSH converses.** AI7's scheduler decides which Runs exist, when they execute, and how many run concurrently; AI7 also observes usage and enforces any explicit Run Budget Ceiling for each Run. The default ceiling state is `unset`, and Provider Account Limits are external service blockers rather than shared AI7 budget capacity. AI7's business scheduling does not use the Harness `schedule`, `jobs`, or workflow packages, and those packages are not in the selected subset. Each execution has immutable scope and strictly non-shared scratch, cache, usage, and ceiling state, plus its own mutable authority state. If one composed runtime instance cannot isolate concurrent executions cleanly, the boundary may compose one instance per Run or supervise a bounded isolated pool. That is a topology response, not a second loop.

Background manuscript analysis remains ordinary instances of the same loop, never a second loop. Manuscript Checkpoints only update deterministic invalidation/dependency state. A matching active Background Analysis Enrollment may coalesce eligible kinds into one batch Run for ceremony/dispatch efficiency, but each kind keeps its own DSH Analysis Contract, Result Set/Revisions, coverage/freshness/failure state, feedback, and update semantics. Baseline analysis is the default selected kind within an Enrollment; the eight Editorial Dimensions and Plugin/user-defined kinds remain independently selectable. Without Enrollment, import or checkpoint succeeds and analysis remains pending with no model dispatch or cost.

DSH-owned subagents, if used, remain inside the parent execution attempt and inherit its scope, grants, providers, and exact Run Budget Ceiling state. They create no AI7 Task, Run, attempt, decision, or authority record. If a suitable subagent mechanism is unavailable for a workflow, AI7 uses a single agent; it does not build a second generic loop.

## Composition and extension policy

AI7 preserves native DSH Skill, Plugin, Bundle, Profile, and Agent Preset carriers and their exact dependencies/versions. Those native artifacts retain their identity, content, definitions, technical logic, and eligible self-contained presentation/in-memory/artifact-local behavior. The core product composition still chooses the smallest coherent implementation—configure the pinned core subset, add AI7 translation/capability/enforcement where product-specific, and use documented DSH extension seams when behavior belongs inside the loop—but native ecosystem compatibility is no longer limited to a development-only rare-Plugin exception. Human-facing catalog/discovery and artifact management may expose supported native artifacts while AI7 keeps selection/pins and every product-state, unpublished-data, credential, Provider, Effect, background, and Apply crossing decisive.

An exact native DSH artifact owns each versioned Workflow definition and its technical logic. An AI7 Workflow Profile is only a projection or selector over that exact definition. AI7 alone owns the durable Workflow Instance, phase/gate/signoff state, business scheduling, and deterministic transition. For the built-in Manuscript baseline, the exact carrier is the read-only declarative native DSH Profile `manuscript-editorial@1.0.0` with `dsh.profile.bundles: []`; its native ID is the carrier-directory basename, separate from npm manifest metadata. AI7 validates its exact raw digest, derives and separately pins `ai7.manuscript.editorial.zh-CN@2.0.0`, and grants the carrier no execution or dependency behavior. Exact carrier-field mapping beyond this built-in baseline remains deferred.

Artifact stages remain separate even when the UI offers a one-action install-and-enable path:

1. discover through a configured catalog source without granting trust or authority;
2. acquire and pin exact native/source bytes without executing artifact code;
3. validate native compatibility or produce a minimally derived working revision without running lifecycle hooks or dependency scripts;
4. record compatibility disposition and AI7 provenance/scope/Authority Ceiling metadata;
5. scoped-enable an eligible exact revision without creating a Task, Run, Enrollment, Provider call, Effect, or Apply; and
6. bind only selected exact revisions into an authorized Run.

Any lifecycle hook, dependency script, native code, or missing adapter that requires execution produces a restricted/needs-adapter/incompatible disposition and stops the one-action path until separately authorized executable-admission and sandbox mechanics exist. Exact catalog-source adapters, trust tiers, sandbox mechanisms, compatibility serializers, scoped-enablement and per-Run activation schemas remain deferred rather than being invented here.

Forking the generic agent loop is out of scope. AI7 never writes a second implementation of it, and a fork requires an accepted seam-gap decision through the [Decision Queue](./DECISION-QUEUE.md).

### Core package and native-artifact versioning

- Consume DSH as exactly pinned public npm packages: retain ADR 0020's `0.1.0-rc.6` baseline, install the selected subset only at one coherent version, and commit the lockfile.
- Never depend on the `@deepseek-ai/dsh` CLI aggregate; it transitively installs the generic shell, pwsh, terminal, and web tool packages the editorial surface excludes.
- Never use `^`, `~`, a branch, a mutable tag, or `latest`.
- A pin bump is one explicit development change at a time. Only the applicable complete E2E journeys on Windows and macOS and regressions for observed bugs are standing verification; composition diffs, capability-exposure diffs, schema checks, notice regeneration, ABI checks, and replay do not become separate gates. Applicable notices still remain current in every build.
- Core DSH package pins change only through explicit development work and never through product artifact update controls.
- A foreign Skill retains one immutable Source Skill Snapshot and versioned minimally derived DSH working revisions. Reconciliation with a new upstream source produces an inert candidate. Only explicit adoption or a distinct revocable Artifact Update Rule may select it, and that rule is limited to trusted, conflict-free, validator-clean, semantically non-expansive Skill changes.
- Artifact Update Rules cannot update code-bearing DSH Plugins or core DSH, add scripts/dependencies/tools/network/provider/data scope/permissions/host behavior, change an analysis schema/reducer/budget/schedule, expand authority, or silently restore revoked grants, rules, Enrollments, or Apply. Such changes return to explicit review. Default update checking reads configured-source metadata only and no Book content.
- Every used third-party package and native artifact contributes applicable license/provenance to the maintained third-party notices in every build. Harness is never user-facing branding; the product display name is exactly **AI7**.

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

This document retains ADR 0020's exact core DSH `0.1.0-rc.6` baseline but, beyond the exact built-in Manuscript Profile carrier above, does not choose the final package list, supported catalog-source set/adapters, trust tiers, sandbox, artifact-sidecar or conversion/reconciliation schema, scoped enablement/per-Run activation record, other Workflow Profile carrier mappings, analysis-result serialization, Enrollment store, analysis-metric snapshot name/schema, native artifact/Plugin, provider endpoint, model identifier, credential, trusted launch-selector implementation, or package layout. This contract does not authorize a GitHub search, artifact/plugin download or installation, dependency change, source copy, prototype, product implementation, Provider call, manuscript handling outside standing exceptions, implementation Issue decomposition, PR/integration, external action, release, or `main` change.
