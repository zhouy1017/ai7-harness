# A2 Codex seam — the Primary Agent Harness Module

Status: **Issue #4 noncanonical A2 seam design. It recommends a candidate seam. It does not select a surface, a dependency, or a maintenance form, and it does not call any App Server surface production-ready.**

This document designs the AI7-owned **Module** that stands between AI7 domain services and any agent executor. It uses the deep-module vocabulary exactly: **Module**, **Interface**, **Implementation**, **Adapter**, **Depth**, **Seam**, **Leverage**, **Locality**. Where a claim rests on evidence, the source ID resolves in the [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md); row IDs resolve in the [A2 Capability Closure matrix](./A2-CAPABILITY-CLOSURE.md).

The matrix returns **`Closure not proven`**. This design is therefore the *shape* a closed design would take, plus the test surface that would close it — not a claim that it is closed.

The Commander-authorized version/help probes ran and established only binary identity and CLI help-surface facts. Runtime-behavior and closure probes did not run, so every restart, fallback, subagent, confinement, and offline-startup statement below remains an Interface invariant or exit-evidence requirement rather than observed capability.

## Two things called "adapter" that must never be confused

`S-A2-06` leaves open the **maintenance form** for any future Codex Secondary Development: external adapter or extension, upstream contribution, maintained patch set, or fork. `S-A2-07` frames "adapter/extension first" as its recommendation.

**This document selects none of those, and answers no maintenance-policy question.** The `Codex App Server Adapter` named below is an *AI7-internal role at an AI7-owned Seam* — a class inside the AI7 service that satisfies an AI7 Interface. It is not the "external adapter/extension" maintenance form, it implies no upstream relationship, and choosing it as the production candidate integration surface says nothing about how AI7 would maintain Codex if a gap were ever verified. The two words coincide; the decisions do not.

## The Module

**Module: `PrimaryAgentHarness`.** It lives in the AI7 service process — not the renderer, not the Electron main shell (`S-A2-09`, ADR 0024). It is the single point through which any AI7 domain service causes model work to happen.

It **hides**: Codex Thread, Turn, and Item records; JSON-RPC 2.0 framing; the ~100 documented protocol methods and 14 item types (`S-A2-02`); per-version schema generation and drift; `capabilities.experimentalApi` gating; sidecar spawn, supervision, and shutdown; event translation; executor approval requests; sandbox and permission-profile shapes; storage locations including `$CODEX_HOME` and rollout files (`S-A2-03`); backpressure and the `-32001` overload path; and the 30-minute idle-unload grace period.

Domain callers — the Run scheduler, Task Skill activation, workflow services, the proposal pipeline — see none of it.

## The Interface

Per the vocabulary, the Interface is *everything a caller must know to use the Module correctly*, not merely the type signatures. All of the following is Interface.

### Operations

Seven. The count is the design target: a small surface over a large Implementation.

| Operation | Shape | What it hides |
| --- | --- | --- |
| `openExecution(ExecutionRequest) → ExecutionOpening` | Takes only AI7-shaped inputs: exact Task and Task Intent references, Run reference, attempt reference, `Dispatch` / `Resume` / `Retry` attribution, Plan Envelope identity and semantic-envelope digest, applicable authority-bearing pins, Task Skill Activation, Effective Capability Grants, Run Source Scope and roots, frozen Provider Resolution Plan with opaque Credential References and Approved Fallback Chain, per-Run budget, and assembled editorial instructions. It allocates or recovers an opaque handle plus the exact Harness Session/thread identity and executor-owned technical-mapping reference needed for AI7 to construct an Execution Binding; it starts no turn and admits no capability. | Whether this becomes `thread/start`, `thread/resume`, or `thread/fork`; restart-safe same-attempt reattachment; sidecar readiness; immutable per-execution context resolution; storage location; sandbox and permission configuration; capability registration. |
| `submit(BoundExecutionHandle, ExecutionInput)` | Delivers editor or task input only after AI7 has persisted the authoritative Execution Binding and the Module has verified its reference and digest. | Whether this is a new `turn/start` or a `turn/steer` into a live turn. |
| `observe(BoundExecutionHandle) → AsyncIterable<ExecutionSignal>` | One ordered stream of a **small closed set** of AI7 signals: progress, proposed content, capability invocation, clarification request, usage, terminal outcome. | ~100 methods and 14 item types collapsed into that set; delta streaming; reasoning summaries; compaction events; any executor-owned subagent lifecycle and events. |
| `decide(BoundExecutionHandle, RequestId, Decision)` | Answers one open execution-layer request only against the verified Execution Binding. | Approval-request taxonomy and decision enums such as `acceptForSession`; permission scopes. |
| `cancel(BoundExecutionHandle, CancelReason) → CancellationOutcome` | Cooperative interruption. | `turn/interrupt`, terminal-state reconciliation, in-flight event drain. |
| `close(BoundExecutionHandle, Disposition) → HarnessExecutionSpanDescriptor` | Ends the technical execution and finalizes or returns its exact Harness Execution Span descriptor; AI7 persists an append-only link from the existing Execution Binding to that descriptor. | Unsubscribe, grace periods, storage finalization, exact Session event-range assembly. |
| `describeSurface() → SurfaceIdentity` | Reports adapter identity, exact artifact identity, schema fingerprint, and **vendor support classification**. | Nothing — this is the one place the Interface deliberately *exposes* rather than hides. |

`ExecutionOpening` contains the opaque `ExecutionHandle` plus the technical identities and mapping reference required to persist the Execution Binding. A `BoundExecutionHandle` pairs that handle with the AI7-persisted Execution Binding reference and digest; constructing the pair grants no authority, and the Module verifies it before accepting every capability- or Effect-capable operation.

`describeSurface()` exists because of `CC-02`. `S-A2-02` states that "The app-server command and WebSocket transport are experimental and aren't supported for production workloads." An unsupported dependency is a fact the system must be able to state about itself — once, at one call site, in one record — rather than a fact that leaks into every caller as folklore or hides entirely. Concentrating it here is what keeps it honest.

### Invariants

- Exactly one Adapter serves one `ExecutionHandle`, and the composition ships exactly one production Adapter (`CC-04`).
- No protocol envelope, schema field, approval enum, or storage path crosses the Interface. Exact executor identities cross only in `ExecutionOpening`, `SurfaceIdentity`, and Harness Execution Span descriptors so AI7 can persist references without copying technical history.
- `openExecution` is idempotent for one exact Run and attempt. It may persist only its executor-owned technical mapping. Before `submit`, `decide`, or any other action that can invoke a capability or produce an Effect, the AI7 service persists the authoritative Execution Binding and supplies its reference and digest; the Module verifies both before accepting the action (`CC-11`, `CC-24`, `CC-28`).
- Repeat open or reattachment compares every bound semantic and authority-bearing input: Task and Task Intent, Run, Plan Envelope identity and semantic-envelope digest, attempt and `Dispatch` / `Resume` / `Retry` attribution, authority-bearing and budget pins, Task Skill Activation, Effective Capability Grants, Run Source Scope, Provider Resolution Plan, Adapter and Surface identity, and Harness Session/thread identity. Any difference fails closed as `ExecutionBindingMismatch`. Same-attempt reattachment is the only automatic recovery; a new attempt requires explicit AI7 continuation authority.
- The Module writes **no** AI7 domain record. AI7 alone persists the immutable Execution Binding, append-only link records to applicable Harness Execution Spans, and every other domain record. Answering a `decide` call creates no Run Authorization, Effect Approval, Proposal Decision, Review Decision, Public Release Permission, or Effect Receipt (`CC-21`, `S-A2-09`, ADR 0007).
- A terminal `ExecutionSignal` never asserts business completion, factual truth, or that an Effect committed.
- The same Task Skill Activation and Effective Capability Grants are enforced twice: first at the Harness tool guard and again at the AI7 capability/service facade. A forged or direct facade call cannot bypass the projection presented to Harness, and disagreement between the two boundaries fails closed with no side effect (`CC-15`).
- Independently authorized Runs may have overlapping readable source sets. They never share mutable scope authority or state, scratch, or cache; each handle carries its own immutable resolved context and effective-target confinement (`CC-23`, `CC-26`, `CC-27`, `CC-43`).
- Executor-owned subagents remain internal technical activity inside the same Run and attempt. They inherit the parent envelope's source scope, grants, provider bindings, and budget ceiling; they project only through the closed `ExecutionSignal` set and never create an AI7 Task, Run, attempt, decision, Effect authority, or other domain record (`CC-41`).
- Provider fallback may follow only the frozen AI7 `ApprovedFallbackChain` and only for an outcome AI7 policy classifies as safe. The Module never discovers, inserts, or autonomously chooses a provider. Ambiguity about provider outcome or any possibly committed Effect stops automatic retry and fallback and yields a terminal ambiguous outcome for AI7 to decide (`CC-42`).
- Before or as a governed capability call is admitted, AI7 persists an append-only applicable-Effect association linked to the Execution Binding: stable `effectId`, idempotency/replay identity, exact attempt, and—when allocated—the eventual Codex tool-call/item identity. The immutable binding payload does not change, and a Harness call result never becomes an Effect Receipt.
- Agent Data Root and Run Source Scope confinement is evaluated against the effective target after Windows junction/reparse-point traversal and after any future supported symlink traversal. A lexical in-root path is insufficient if its effective target escapes the root (`CC-43`).
- Application startup and non-agent editorial access do not depend on the Adapter: offline startup, local manuscript access, and local editing remain available with no provider, authentication, marketplace, network, or executor. Harness activation is lazy and scoped to authorized agent work (`CC-44`).

### Ordering

- Signals for one handle are totally ordered and gap-free; the Adapter may not reorder or drop.
- The terminal signal is last; nothing follows it on that handle.
- Repeating `openExecution` with the same Run/attempt and byte-equal bound semantic inputs returns the same durable opening. Any semantic or authority-bearing drift returns `ExecutionBindingMismatch`; calling it with a new attempt reference is valid only after explicit AI7 continuation authority supplied that reference.
- `decide` is valid only for an open `RequestId`; repeat decisions on the same id are idempotent.
- `cancel` is idempotent and **always** eventually produces a terminal signal, including when the executor has already died.
- `close` after a terminal signal is valid and returns the same Harness Execution Span descriptor.

### Error modes

`SurfaceUnavailable`, `SurfaceIdentityMismatch`, `ExecutionBindingMismatch`, `CapabilityRefused`, `ProviderUnresolved`, `BudgetExhausted`, `ExecutorTerminated`, `ReattachmentUnsafe`, `OutcomeAmbiguous`, `ProtocolViolation`.

Four rules govern all of them. **`SurfaceIdentityMismatch` fails closed**: if the schema fingerprint differs from the pinned expectation, the Module refuses to open an execution rather than proceeding on a drifted protocol (`CC-32`; `S-A2-02` and `S-A2-03` both document per-version schema generation and *neither* documents a compatibility policy). **`ExecutionBindingMismatch` fails closed** on any changed semantic or authority-bearing input and names the unequal fields without exposing secret values. **`ReattachmentUnsafe` and `OutcomeAmbiguous` stop automation**: neither may create a new attempt, retry an Effect, or advance a provider fallback; they produce a terminal technical outcome for explicit AI7 reconciliation or continuation. And **no error mode promotes to a domain record** — an `ExecutorTerminated` is not a failed Run, and a `ProtocolViolation` is not a rejected proposal.

### Configuration

Static composition contains only facts common to the shipped Adapter: Adapter selection, exact artifact identity, expected schema fingerprint, technical storage root inside the Agent Data Root, reviewed Capability Implementation registry, and instance-wide concurrency and budget ceilings. Run Source Scope, grants, provider selection, sandbox policy, and per-Run budget are forbidden in this singleton configuration.

Each successful `openExecution` derives one immutable per-execution resolved context containing the exact Run Source Scope and roots, Task Skill Activation, Effective Capability Grants, Provider Resolution Plan, per-Run budget, sandbox/permission binding, and their references and digests. The context is bound to the opaque handle, verified against the AI7-owned Execution Binding, and compared in full on repeat open or reattachment. No caller may mutate it per tool call.

### Cancellation, performance, restart

- **Cancellation** is cooperative and bounded; `CancellationOutcome` records what stopped and explicitly declines to claim that committed Effects were undone (`S-A2-09`).
- **Performance**: `observe` yields the first signal without waiting for turn completion. The Module runs in the service process and never touches the UI thread. It absorbs backpressure internally — `S-A2-02` documents bounded queues and a JSON-RPC `-32001` "Server overloaded; retry later" error, and that error must never reach a domain caller.
- **Restart**: after executor termination the Module may restart the sidecar and safely reattach the **same attempt** through its durable technical mapping and verified Execution Binding. If exact equality or same-attempt reattachment cannot be established, it emits `ExecutionBindingMismatch`, `ReattachmentUnsafe`, or `OutcomeAmbiguous` for AI7 to decide. The Module never begins, creates, or changes an attempt; only explicit AI7 continuation authority may supply a new attempt reference. Ambiguity about a committed Effect stops automatic retry and provider fallback.

### Exit-evidence test surface

These tests are Interface obligations, not proof that the current candidate satisfies them. Dispositions remain unchanged: `CC-15` and `CC-28` are Candidate; the other rows listed here are Unknown.

| Row | Required Interface test |
| --- | --- |
| `CC-15` | Exercise the same Task Skill Activation and Effective Capability Grants at both the Harness tool guard and AI7 capability/service facade. Attempt forged/direct facade calls, forbidden operations, out-of-scope arguments, and mismatched activation at both boundaries; every path must fail structurally with no side effect. |
| `CC-23`, `CC-26`, `CC-27` | Run overlapping and disjoint authorized source scopes concurrently; prove allowed overlap, cross-scope denial, effective-target confinement, fail-closed semantic drift on reopen, and strict non-sharing of scratch, cache, and mutable authority state. |
| `CC-28` | Persist every Execution Binding field, resolve its exact Harness Session event range or explicit range set, append applicable Effect associations, verify repeat-open equality and fail-closed semantic drift, attribute `Dispatch` / `Resume` / `Retry`, and prove no transcript or business authority is promoted. |
| `CC-41` | Run a nested executor subagent and prove one AI7 Run/attempt, inherited envelope limits, ordered closed-set projection, and zero new domain authority records. |
| `CC-42` | Force one unambiguously safe provider failure and one ambiguous provider/Effect outcome; the first may use only the next frozen approved binding, while the second performs no retry or fallback. |
| `CC-43` | Attempt in-scope-looking Windows junction/reparse-point escapes and any future supported symlink escape; every capability must reject the effective out-of-scope target structurally. |
| `CC-44` | Start each Windows channel offline with credentials absent and executor/provider/auth/marketplace/network unavailable; local manuscript access and non-agent editing must remain usable. |

## The Seam and its two Adapters

The **Seam** is at the `PrimaryAgentHarness` Interface, inside the AI7 service process. The dependency category is **true external** — Codex is third-party code AI7 does not control — so the executor is injected as an Adapter rather than constructed inside.

Two Adapters make the Seam real. One would make it hypothetical.

**`CodexAppServerAdapter` — production *candidate*.** An out-of-process sidecar over **stdio JSONL, JSON-RPC 2.0** (`S-A2-02`, `S-A2-03`). Transport choice is forced rather than preferred: AI7's accepted IPC rule permits stdio or a Windows named pipe and forbids a TCP listener (`S-A2-09`, ADR 0024). WebSocket is a TCP listener and is excluded; Unix socket is not a Windows target; no Windows named-pipe transport is documented (`S-A2-07`). Stdio is simultaneously the documented default and the only admissible option. This Adapter is a **candidate** and nothing more — `CC-01` has no exact artifact and `CC-02` is Experimental.

**`ReplayHarnessAdapter` — deterministic test and replay.** Satisfies the same Interface with no sidecar, no network, no provider, and no model call. It replays recorded `ExecutionSignal` sequences against recorded inputs under the request-fingerprint guard, failing closed on drift. This is what makes the provider-free `pr` gate possible at all (`CC-33`, `S-A2-09`, ADR 0014) — the gate needs the whole editorial journey to run with the executor absent.

The second Adapter is not a testing convenience bolted on afterwards. It is the reason the Seam is placed here rather than deeper: **the interface is the test surface**, and both Adapters must pass the same suite unchanged (`CC-34`).

## Sub-seams deliberately kept internal

Protocol codec, sidecar supervisor, capability projection, provider and credential brokering, storage-location pinning, and event translation are **internal seams** — private to the Implementation, usable by the Module's own tests, and absent from the Interface. Each has one justified implementation today and no caller-visible variation. Per the seam discipline, one adapter means a hypothetical seam; exposing these would add indirection without earning anything.

Two are worth naming because they are the ones a reader will want to promote:

- **Provider brokering** stays internal even though `CC-13` is Unknown. If a mainland-China provider cannot present a compatible contract, the remedy is an AI7 provider gateway *behind* this Interface, not a new caller-visible seam.
- **Capability projection** stays internal even though MCP and `dynamicTools` are two mechanisms (`CC-15`). They are two implementations of one internal decision, and `dynamicTools` is experimental (`S-A2-02`). Domain callers declare AI7 Capabilities; how those reach the executor is not their concern. Whatever the projection mechanism, the identical Task Skill Activation and Effective Capability Grants are enforced independently at the Harness tool guard and AI7 capability/service facade.

## The deletion test

Delete `PrimaryAgentHarness` and let domain services call app-server directly. Every AI7 service that starts model work would then have to know: JSON-RPC 2.0 framing over stdio; which of `thread/start`, `thread/resume`, and `thread/fork` applies; the 14 item types and their delta events; that `capabilities.experimentalApi = true` gates a moving subset; that schema artifacts are per-version with no compatibility policy; four approval-request shapes and their decision enums including session-scoped grants; that `thread/shellCommand` "runs outside the sandbox with full access"; where rollout files land; the 30-minute idle-unload grace period; and the `-32001` overload path.

Worse, the *authority* leak would follow the protocol leak: with no single translation point, executor approvals and turn successes would reach services that write AI7 records, and the separation `CC-21` and ADR 0011 require would become a convention rather than a structural fact.

Complexity does not vanish on deletion — it reappears in every caller, and one accepted invariant degrades from enforced to hoped-for. **The Module earns its keep. It is not a pass-through wrapper.**

## Depth, Leverage, Locality

**Depth**: seven operations and one closed signal set over an Implementation covering the whole protocol surface, sidecar lifecycle, translation, approvals, brokering, and storage. A caller learns seven things to reach all of it.

**Leverage**: every AI7 service that runs model work gets executor independence, cancellation, backpressure absorption, and authority separation without implementing any of them. One Implementation pays back across every domain caller and every test.

**Locality**: the consequences of `CC-01`, `CC-02`, and `CC-32` — no exact artifact, an unsupported vendor classification, and no protocol compatibility contract — land in exactly one Module. When the artifact changes, one schema fingerprint and one Adapter change. Twenty-six Unknown rows resolve behind this Interface without a domain caller noticing, which is precisely why the seam is worth placing before the Unknowns are resolved rather than after.

## The two-loop guard

`S-A2-01` assigns three distinct roles: `codex exec` for "a script, CI job, or one-off background task"; the SDK for "application code that needs to start, resume, or stream Codex tasks"; and app-server "when the agent is part of the product itself." They are not interchangeable (`S-A2-04`).

The guard is structural, not a coding convention. The Module admits exactly one Adapter per execution, and the shipped composition contains exactly one integration layer. Under AI7's accepted standard — absence from the dependency graph is stronger than absence from the wiring (`S-A2-09`) — `CC-04`'s exit test is a dependency-graph proof that the unselected layers are *absent*, not merely unwired. Background and verification work uses `ReplayHarnessAdapter` or model-free AI7 jobs, never a second Codex entry point.

## The stable-binding answer

A1 left open "the A2 stable-binding question — what binding correlates executor technical history with AI7 Tasks, Runs, Plans, and Effects" (`S-A2-08`). This is distinct from the formal pending maintenance-policy Question 3, which A2 does not touch.

**Candidate answer: two canonical records, never one conflated record.**

An **Execution Binding** is the immutable cross-ledger association owned and persisted by AI7. It binds the exact Task and Task Intent; Run; Plan Envelope identity and semantic-envelope digest; execution attempt and `Dispatch` / `Resume` / `Retry` attribution; applicable authority-bearing and budget pins; Effective Capability Grants digest; Run Source Scope digest; Provider Resolution Plan digest; exact Adapter and Surface identity; exact Harness Session/thread identity; and references to the applicable Harness Execution Spans through append-only link records. It carries references and digests, never transcript content or business authority. Before or as a governed capability call is admitted, AI7 persists an append-only association linking the stable `effectId`, idempotency/replay identity, exact attempt, and eventual Codex tool-call/item identity to that binding; the association is not an Effect Receipt and does not mutate the binding payload.

A **Harness Execution Span** is the exact contiguous Harness Session event range, or explicit event-range set, attributable to one dispatch, Resume, or Retry. It is technical history: not an Execution Binding, Run Record, attempt, Effect Receipt, or completion proof. `close()` finalizes or returns its descriptor, and AI7 links it through the existing Execution Binding without copying any event. `S-A2-02` and `S-A2-03` document stable `thread.id`, turn, and item identities, so both records are expressible (`CC-28`); no admitted runtime evidence proves the complete lifecycle yet.

`openExecution()` may establish only the executor-owned technical mapping and return the identities AI7 needs. AI7 must persist the authoritative Execution Binding before any capability- or Effect-capable action, after which the Module verifies its reference and digest. Repeat open compares every bound input; drift fails as `ExecutionBindingMismatch`. Only identical same-attempt reattachment is automatic, while a new attempt requires explicit AI7 continuation authority.

Three properties preserve the ledger split. The records carry **references, never content** — no model message, tool result, or transcript enters the AI7 Task Ledger (ADR 0011). They are **directional**: AI7 records point at executor history, never the reverse, so no executor event can name or mutate an AI7 record. And they are **authority-free**: possessing an Execution Binding or Harness Execution Span proves only correlation or technical history, never that a Run succeeded, an Effect committed, or a decision was made.

This is a candidate. Commander version/help probes ran, but no runtime-behavior or binding-closure probe ran, so the stable binding remains scored `Candidate` — not `Proven` — in the matrix.

## What this document does not decide

- It does not select a Codex surface, artifact, version, or dependency, and installs nothing.
- It does not select the maintenance form left open by `S-A2-06`, and does not answer the formal maintenance-policy Question 3.
- It does not call app-server production-ready. `CC-02` is **Experimental** on the vendor's own current statement.
- It does not assert Harness Capability Closure or any Codex Capability Gap.
- It does not activate the `S-A2-05` role assignments, admit DeepSeek to any runtime role, or open the `S-A2-06` re-entry gate. Candidate C is **Keep — deferred candidate evidence only for this A2 evaluation**, not runtime selection/evaluation, reference-role activation, re-entry, or future admission.
- It does not answer `DQ-A1-01`, enter A3, or authorize implementation.
