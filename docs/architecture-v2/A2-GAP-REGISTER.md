# A2 gap register

Status: **Issue #4 noncanonical A2 record. Zero Verified Codex Capability Gaps. Zero Gap claims. The DeepSeek Runtime Re-entry Gate remains closed.**

This register covers exactly the four matrix dispositions eligible for gap-register treatment — **Unknown**, **Experimental**, **Gap claim**, and **Verified Codex Capability Gap** — so that a later reader cannot mistake absent evidence for a proven limitation. Candidate exit tests remain in the [A2 Capability Closure matrix](./A2-CAPABILITY-CLOSURE.md) and are intentionally not duplicated here. Source IDs resolve in the [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md).

## The four classes, kept strictly apart

| Class | Definition | What it permits | Count |
| --- | --- | --- | --- |
| **Unknown** | AI7 has not gathered the evidence. Missing documentation, an un-retrieved source path, or an unrun probe. | Naming exact next evidence. Nothing else. | 26 |
| **Experimental** | The vendor documents the surface as experimental or unsupported for production. The capability may exist and work; its *support classification* is the finding. | A recorded compatibility and risk decision by the owner. | 2 |
| **Gap claim** | Someone asserts Codex cannot do something, without proof against an exact component, pin, protocol, and supported configuration. | Verification work. It is **not** a gap. | 0 |
| **Verified Codex Capability Gap** | Proven that an exact Codex component, pin, protocol, and supported configuration demonstrably cannot satisfy a load-bearing AI7 requirement (`S-A2-06`). | Costed Codex Secondary Development alternatives. | **0** |

`S-A2-06` is explicit and this register enforces it literally: *"Missing documentation, an undiscovered seam, or an untested assumption is not yet a capability gap."*

## Unknown

Twenty-six entries. Each names the exact next evidence that would move it. None is a finding about Codex's capability.

| ID | Row | What is unknown | Exact next evidence |
| --- | --- | --- | --- |
| **UNK-A2-01** | `CC-01` | Which exact artifact is the closure subject. The pinned snapshot is declared not a dependency pin (`S-A2-04`); current documentation names no version (`S-A2-02`). | Resolve `DQ-A2-02`, then re-score every row against that artifact alone. |
| **UNK-A2-02** | `CC-08` | Whether in-turn recovery on transient model or tool failure is contracted, and where its boundary against AI7 Retry falls. | Retrieve the exact artifact's retry documentation or observe a forced transient failure. |
| **UNK-A2-03** | `CC-09` | Whether AI7-authored editorial instructions fully replace built-in instruction defaults, or only prepend to them. | Retrieve `codex-rs/app-server-protocol/src/protocol/v2/thread.rs` at the exact artifact (`S-A2-10`); inspect the assembled instruction payload. |
| **UNK-A2-04** | `CC-13` | Whether a mainland-China provider can serve a Model Role. `S-A2-07` warns compatibility "must be proven per provider"; no such proof exists. | Retrieve `codex-rs/model-provider-info/src/lib.rs` (`S-A2-10`); test one named provider against the wire contract. |
| **UNK-A2-05** | `CC-14` | How credentials reach the executor and whether any value persists in thread storage, events, logs, or diagnostics. The protocol documents no credential method (`S-A2-02`). | Credential-scan thread storage, event stream, logs, and diagnostics after a real turn. |
| **UNK-A2-06** | `CC-16` | Whether shell and process execution can be made **absent** rather than sandbox-constrained. `thread/shellCommand` "runs outside the sandbox with full access"; `process/spawn` starts a process "outside sandbox" (`S-A2-02`, `S-A2-03`). | Inspect the tool-registration surface in the exact source and prove a configuration with no shell or process tool registered. |
| **UNK-A2-07** | `CC-17` | Whether the `fs/*` family and `fileChange` tooling can be absent rather than root-restricted. | Same tool-registration inspection; then attempt out-of-scope access and confirm structural refusal. |
| **UNK-A2-08** | `CC-18` | Whether `webSearch`, `marketplace/*`, and `plugin/install` network paths can be absent. `plugin/*` is "under development; do not call from production clients yet" (`S-A2-03`). | Same inspection; then a network-capture egress inventory for a live editorial Run. |
| **UNK-A2-09** | `CC-19` | Whether coding-oriented features — `review/start` over `uncommittedChanges` / `baseBranch` / `commit`, `gitInfo`, `collaborationMode` presets, skills and hooks — can be excluded from an editorial Run. | Compose an editorial profile against the exact artifact and enumerate what remains reachable. |
| **UNK-A2-10** | `CC-20` | Whether a Run can widen its own grant. Session-scoped grants and `acceptForSession` exist (`S-A2-02`); escalation semantics are undocumented. | Attempt an in-Run permission widening against the exact artifact and record the result. |
| **UNK-A2-11** | `CC-22` | Windows sandbox enforcement strength, and whether `mode: "elevated"` setup surfaces a prompt to an editorial user. | Measure Windows enforcement; determine whether unelevated setup suffices for AI7's profile. |
| **UNK-A2-12** | `CC-23` | Whether writable/readable roots and sandbox/permission state bind through an immutable per-execution context tightly enough to hold Run Source Scope for concurrent Books. Authorized Runs may have overlapping readable sets, but must not share mutable scope authority/state. | Configure concurrent overlapping and disjoint authorized scopes; prove permitted overlap, cross-scope denial, effective-target confinement, and fail-closed semantic drift on reopen. |
| **UNK-A2-13** | `CC-24` | Crash detection and restart semantics. `S-A2-02` states no recovery protocol is documented. | Kill the executor mid-turn and record client-observable behavior. |
| **UNK-A2-14** | `CC-25` | Sidecar start, shutdown, and orphan behavior under Electron. Native-binary launch is index-mediated only. | Retrieve `codex-cli/bin/codex.js` (`S-A2-10`); test process-tree teardown on application exit. |
| **UNK-A2-15** | `CC-26` | Whether "Every thread in the same app-server process shares the selected Code Mode host connection" (`S-A2-02`) couples concurrent Runs or their mutable authority state, and how bounded queues and the 30-minute idle unload behave under AI7's parallel-Run requirement. | Run ten concurrent Book executions with overlapping and disjoint readable scopes; measure authority isolation, interference, overload, and unload effects. |
| **UNK-A2-16** | `CC-27` | Whether scratch, cache, and mutable authority state are per-execution or process-wide. Not documented at either source. | Inspect on-disk and in-memory state after concurrent overlapping/disjoint Runs and prove strict non-sharing. |
| **UNK-A2-17** | `CC-31` | Whether diagnostics contain manuscript text and whether any upload path is enabled by default. | Inspect diagnostic output for content; enumerate default-enabled upload paths. |
| **UNK-A2-18** | `CC-32` | Whether any protocol compatibility contract exists. Neither `S-A2-02` nor `S-A2-03` documents versioning, compatibility, or breaking-change policy; schema artifacts are per-version. | Ask upstream for a stability policy, or accept an AI7-owned schema-fingerprint gate as the whole contract. |
| **UNK-A2-19** | `CC-35` | Whether a pinned sidecar packages and launches in both the zip-portable and NSIS channels. | Package both channels against the exact artifact and run extract, first-run, launch, and removal. |
| **UNK-A2-20** | `CC-39` | Whether an exact, obtainable, immutable version exists with a tracked release channel. | Identify the published artifact and its update cadence for the exact surface. |
| **UNK-A2-21** | `CC-40` | Whether `clientInfo.name` compliance-log identification, `attestation/generate`, or `feedback/upload` transmit anything, and what is enabled by default (`S-A2-02`, `S-A2-03`). | Network capture during a live Run; confirm only the configured model endpoint is contacted. |
| **UNK-A2-22** | `CC-37` | Exact license, `NOTICE`, redistribution, and trademark obligations for the artifact. `S-A2-11` records owner-direction wording, but exact-pin `LICENSE` and `NOTICE` were not retrieved. | Retrieve and read `LICENSE` and `NOTICE` at the selected exact artifact; reconcile the generated third-party notices and branding rule against those exact files. |
| **UNK-A2-23** | `CC-41` | Whether the exact executor surface supplies Harness-owned subagent lifecycle and bounded event projection without creating an AI7 Task/Run, second loop, attempt, or authority record. | Retrieve the exact artifact's subagent lifecycle/event contract, then exercise a nested subagent and verify one parent Run/attempt, inherited source/grant/provider/budget bounds, closed-set signal projection, and zero new domain records. |
| **UNK-A2-24** | `CC-42` | Whether provider fallback is limited to AI7's frozen Approved Fallback Chain and stops on ambiguous provider or Effect outcomes rather than choosing or retrying autonomously. | Retrieve the exact fallback/retry contract; force one unambiguously safe pre-Effect provider failure and one ambiguous post-call outcome, proving only the next frozen binding is used in the first case and no retry/fallback occurs in the second. |
| **UNK-A2-25** | `CC-43` | Whether Agent Data Root and Run Source Scope confinement survives Windows junction/reparse-point traversal and any future supported symlink surface. | Inspect the exact path-resolution and sandbox enforcement code, then attempt in-scope-looking junction/reparse-point escapes and any future supported symlink escape; prove effective out-of-scope targets fail structurally. |
| **UNK-A2-26** | `CC-44` | Whether desktop startup and non-agent editorial access work offline without provider, authentication, marketplace, network, or executor availability. | Start both Windows channels offline with no credentials and the executor unavailable; open and edit local material while capturing startup dependencies and network activity. |

`UNK-A2-06` through `UNK-A2-09` share one exit test: inspecting the tool-registration surface of the exact source. That single piece of evidence is the highest-leverage next step in the whole register, because those four rows carry AI7's most load-bearing accepted constraint — that an editorial Run receives no generic shell, roaming filesystem, or arbitrary network tool (`S-A2-09`, ADR 0017).

## Experimental

Two entries. Both concern *support classification*, not capability. The capabilities in question are documented and may work exactly as described.

| ID | Row | Exact vendor statement | Why it cannot be cured by an adapter |
| --- | --- | --- | --- |
| **EXP-A2-01** | `CC-02` | `S-A2-02`: "The app-server command and WebSocket transport are experimental and aren't supported for production workloads." `S-A2-03`, at the pinned snapshot, scopes the same warning to WebSocket alone: "Websocket transport is currently experimental and unsupported. Do not rely on it for production workloads." | Support classification is the vendor's, not AI7's. No AI7 code changes what upstream supports. The remedy is either an upstream change or an explicit owner acceptance of unsupported status — `DQ-A2-01`. |
| **EXP-A2-02** | `CC-03` | The generic agent loop is reached only through the surface classified in `EXP-A2-01`. | Inherits `EXP-A2-01`. The loop itself is documented and is the surface `S-A2-01` explicitly recommends for AI7's shape. |

The stricter, more current statement governs the production question. Both `S-A2-02`'s recommendation of app-server for embedded products and its exclusion of app-server from production workloads are **simultaneous facts**; neither cancels the other.

Several individually experimental features appear in the matrix without their own entry here, because a row can be Candidate while one of its mechanisms is experimental: `dynamicTools`, `thread/turns/list`, `thread/items/list`, `process/*`, `environment/info`, `thread/backgroundTerminals/*`, Beta permission profiles, and `plugin/*` (`S-A2-02`, `S-A2-03`). None may become a production premise without a recorded compatibility decision.

## Gap claim

**None.** No entry in this register asserts that Codex cannot do something.

This is worth stating plainly because it is the register's most easily misread result. Twenty-six Unknowns and two Experimentals look, at a glance, like a list of Codex shortcomings. They are not. Twenty-six of them are statements about **AI7's evidence**, and two are statements about **OpenAI's support policy**. Not one is a statement about what Codex is capable of.

## Verified Codex Capability Gap

**None.**

Because no gap is verified, three things do not happen and must not be inferred to have happened:

1. **No costed Codex Secondary Development alternatives are produced.** Under `S-A2-06`, costing is a remedy for a *verified* gap. Producing cost models for unverified gaps would manufacture the appearance of a proven problem. `S-A2-07` lists categories that *might* require source-coupled development — loop or compaction changes, native contributor registration, Thread Store replacement, a non-Responses provider protocol, in-process Node embedding — and every one remains a category to test. A2 adopts none.
2. **No maintenance form is selected.** External adapter or extension, upstream contribution, maintained patch set, and fork all remain open (`S-A2-06`). `S-A2-07`'s "adapter/extension first" framing is recorded as evidence and is not adopted. The formal maintenance-policy Question 3 is unanswered. The `Codex App Server Adapter` in the [seam design](./A2-CODEX-SEAM.md) is an AI7-internal module role and is not a maintenance-form decision.
3. **The DeepSeek Runtime Re-entry Gate stays closed.** See below.

## DeepSeek Runtime Re-entry Gate — closed

`S-A2-06` requires **both** necessary conditions before DeepSeek Harness may be compared as a production runtime again:

| Condition | Status |
| --- | --- |
| An exact Codex Capability Gap is verified and remains unclosed | **Assessed and not met.** A2 classified all 44 rows and found zero Verified Codex Capability Gaps. |
| An exact DeepSeek surface is proven a Mature Runtime Alternative | **Not met and not assessed.** No DeepSeek runtime evidence was inspected; the dispatch forbids it until the first condition holds. |

Neither condition is met, so the gate is closed and DeepSeek Harness remains ineligible for any runtime, fallback, package, process, Session, tool, capability-grant, authority, or branding role.

Two misreadings are pre-empted. **`Closure not proven` is not a Codex gap** — it is an evidence state, and `S-A2-06` requires a *verified* gap, not a failed closure attempt, to open the gate. And **passing the gate would never select DeepSeek** — it admits comparison and returns a new choice to the owner, never automatic fallback, dual runtimes, or a second agent loop (`S-A2-05`, `S-A2-06`).

Under `S-A2-05`, a closure pass would have made DeepSeek a non-runtime Development Reference Framework. Closure did not pass, so that conditional reference role does not activate; neither does any runtime role.

For the required A1 candidate-C disposition, A2 records **Keep — deferred candidate evidence only for this A2 evaluation**. “Keep” preserves the already admitted candidate record as deferred evidence; it is explicitly **not** DeepSeek runtime selection or evaluation, Development Reference Framework activation, Runtime Re-entry Gate passage, or a promise of future admission.

## How to read this register later

If a future reader takes one thing from it: **absent evidence and proven limitation look similar in a table and are opposite in consequence.** An Unknown costs a probe or a source retrieval. A Verified Codex Capability Gap costs a secondary-development programme and can reopen a settled runtime choice. This register has twenty-six of the first kind and none of the second.
