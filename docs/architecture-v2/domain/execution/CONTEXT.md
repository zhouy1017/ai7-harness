# Execution (V2 candidate)

Status: **candidate-local definition owner; noncanonical**

This context defines only V2-specific execution roles. All established AI7 terms retain their canonical definitions in [`docs/domain/execution/CONTEXT.md`](../../../domain/execution/CONTEXT.md), especially Task Ledger, Run Record, Harness Session Ledger, Execution Binding, Harness Execution Span, Task Skill Activation, Capability Grant, Capability Implementation, Provider Resolution Plan, Run Authorization, Effect Approval, Effect Receipt, Resume, Retry, Redo, and Replay.

## Language

**Primary Agent Harness** (`主代理执行框架`):
The single production framework that supplies AI7's generic model conversation, context assembly, turn progression, model invocation, technical tool dispatch, streamed technical events, compaction, subagent mechanics where used, and in-turn recovery. In the V2 candidate this role is assigned to DeepSeek Harness, composed inside the AI7 Node service from an exactly pinned package subset. AI7 retains every product and business authority.
_Avoid_: AI7 runtime, product authority, generic harness, second loop, Model Provider.

**Primary Agent Harness Adapter** (`主代理执行框架适配器`):
The AI7-owned module in the Node service that presents AI7-shaped execution operations while hiding DSH composition, session, tool-event, provider-invocation, and storage details. It is a containment boundary around a composed in-process runtime, not a protocol bridge to a separate product. It writes no AI7 domain record and grants no authority.
_Avoid_: agent loop, capability facade, provider broker, external process client.

**Codex Interaction Model Reference** (`Codex 交互模型参考`):
The non-runtime interaction and engineering reference from which AI7 may reinterpret task capture, context, progress, interruption, clarification, history, review, host boundaries, and extension ideas without adopting Codex branding, GUI code, coding defaults, or execution authority. It is not a dependency, process, session owner, provider, fallback, adapter target, or source baseline.
_Avoid_: Codex runtime, Primary Agent Harness, UI baseline, component library, product shell.

**Fast Interaction Role** (`快速交互角色`):
The Model Role for quick interaction, low-risk candidate generation, and latency-sensitive assistance. Default binding: DeepSeek V4 Flash.
_Avoid_: cheap model, draft-only model, factual authority.

**Main Editorial Role** (`主编辑角色`):
The Model Role for Chinese long-form writing, editorial proposals, cross-source synthesis, factual research, and complex instruction following. Default binding: DeepSeek V4 Pro High.
_Avoid_: default model, editor, decision maker, factual authority.

**Difficult Escalation Role** (`疑难升级角色`):
The Model Role for difficult or unusually consequential work that exceeds the Main Editorial Role's expected capability. Default binding: DeepSeek V4 Pro Max. Escalation to it is an AI7 policy and plan decision, never a model's own choice.
_Avoid_: retry model, automatic fallback, authority upgrade.

**Frontier Model Role** (`前沿模型角色`):
The Model Role for challenge or explicitly authorized high-consequence work. Default binding: DeepSeek V4 Pro Max; the user may explicitly configure another eligible provider/model, which enters the same one-loop topology, Provider Resolution Plan, credential brokering, budget, and egress gate.
_Avoid_: second harness, silent fallback, escape hatch, truth oracle.

All four are Model Roles: Task Skills declare a role with hard requirements and soft preferences, never a provider, model, endpoint, or credential. A default binding is a configuration fact, never factual authority — output at any role remains a proposal or research lead.

**Third-Party DSH Plugin** (`第三方 DSH 插件`):
An externally authored, open-source DSH plugin admitted into AI7's composition for an identified capability or composition need. It is a code-bearing Capability Implementation or composition dependency, never a Task Skill, Policy Document, Model Provider, credential, Authority Ceiling, Effective Capability Grant, or user-facing brand. It supplies mechanism only; capability expansion never self-activates.
_Avoid_: Task Skill, extension marketplace item, capability grant, product feature brand.

**Plugin Admission Snapshot** (`插件准入快照`):
The dated, immutable record of a Third-Party DSH Plugin's repository identity, open-source license, GitHub stars, qualifying update commits, latest qualifying update date, selected version/commit, artifact identity, and notice obligations at the moment AI7 selects that version. Its facts are admission facts, not continuing runtime inputs or scheduled re-measurements. Selecting a different upstream version requires a new snapshot.
_Avoid_: health check, quality score, evaluation report, monitoring signal.

**Local Plugin Pin** (`本地插件版本锁定`):
The immutable AI7-controlled binding from one admitted plugin identity and version to its exact upstream commit, local artifact digest, manifest entry, lockfile entry, provenance, and rollback predecessor. It prevents upstream change from silently changing a build or an installed composition. Ranges, branch names, mutable tags, and `latest` are forbidden, and AI7 performs no automatic upstream update.
_Avoid_: dependency range, version constraint, update channel, auto-update policy.

**Implementation Assumption** (`实现假设`):
A design-stage expectation about DSH or platform behavior paired with a bounded response if implementation finds otherwise. It records uncertainty without creating an evidence task, validation gate, authority, or product promise.
_Avoid_: verified capability, defect, acceptance test, owner blocker.

## Retained boundaries

- The AI7 Task Ledger and domain ledgers own business truth; the Harness Session Ledger owns DSH technical history.
- Execution Bindings and Harness Execution Spans correlate ledgers without copying transcripts or transferring authority. A binding also pins the composed DSH configuration digest and admitted plugin pins.
- Run Authorization, execution-layer approval, Effect Approval, editorial decisions, Public Release Permission, and Effect Receipts remain distinct.
- Resume continues the same unchanged Run, Retry creates a new safe attempt, Redo creates a new authorized Run, and Replay performs no execution.
- Provider Preflight and the Provider Resolution Plan bind Model Roles, providers, fallback, outbound data, credentials, and budget before execution. Provider fallback exists; harness fallback does not.
- The Task Skill Activation and Capability Grants are enforced at both the DSH-facing tool guard and the AI7 Capability Facade.
- AI7 schedules and DSH converses: AI7 owns which Runs exist, concurrency, budget, continuation, and model-free background work, and does not use the Harness `schedule`, `jobs`, or workflow packages.

The former candidate terms Harness Capability Closure, Codex Capability Gap, Mature Runtime Alternative, and DeepSeek Runtime Re-entry Gate were retired when Clarification 0004 removed the proof ladder. The candidate terms Development Reference Framework, Codex Secondary Development, and Codex Desktop-like Interaction Reference are retired by Clarification 0005: DeepSeek Harness is the production Primary Agent Harness, and Codex's residual role is the Codex Interaction Model Reference.
