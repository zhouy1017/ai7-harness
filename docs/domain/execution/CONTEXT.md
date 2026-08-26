# AI7 Execution

The AI7 product language for Task Intents, Task Skills, Task Ledger records, authority, Effects, and their exact bindings to Harness execution, kept distinct from Harness runtime primitives.

## Language

**Foundation Model**:
A replaceable, externally provided general-purpose language model invoked by AI7 through a governed model boundary; AI7 does not train or update its weights.
_Avoid_: AI7 model, learned editorial memory

**Editorial Intelligence Layer**:
The AI7-owned combination of professional knowledge, exact sources, approved memory, policies, skills, tools, provenance, feedback, and evaluations that adapts Foundation Model capability to editorial work.
_Avoid_: Fine-tuned model, prompt wrapper

**Model Training**:
Any process that updates or creates language-model weights from AI7 editorial materials or behavior; it is outside AI7's accepted product thesis.
_Avoid_: Editorial learning, retrieval, memory

**Agent Behavior**:
The observable way an AI7 agent assembles context, plans, selects and sequences tools, coordinates subagents, follows policy, handles approvals and recovery, and produces evidence and results.
_Avoid_: Foundation Model capability, editorial knowledge

**Agent Behavior Framework**:
A software framework whose extension and composition mechanisms shape, observe, and evaluate Agent Behavior without owning AI7 editorial truth or changing Foundation Model weights; DeepSeek Harness is the accepted foundation for this role.
_Avoid_: Foundation Model, Editorial Intelligence Layer

**Primary Agent Harness**:
The single production framework that supplies AI7's generic model conversation, context assembly, turn progression, model invocation, technical tool dispatch, streamed technical events, compaction, subagent mechanics where used, and in-turn recovery. DeepSeek Harness holds this role and is composed inside the AI7 Node service from an exactly pinned package subset; AI7 retains every product and business authority.
_中文_: 主代理执行框架
_Avoid_: AI7 runtime, product authority, second loop, Model Provider

**Primary Agent Harness Adapter**:
The AI7-owned module in the Node service that presents AI7-shaped execution operations while hiding DSH composition, Session, tool-event, provider-invocation, and storage details. It contains a composed in-process runtime, writes no AI7 domain record, and grants no authority.
_中文_: 主代理执行框架适配器
_Avoid_: Agent loop, AI7 Capability Facade, Provider broker, external process client

**Codex Interaction Model Reference**:
The non-runtime interaction and engineering reference from which AI7 may reinterpret task capture, context, progress, interruption, clarification, history, review, host boundaries, and extension ideas without adopting Codex branding, GUI code, coding defaults, or execution authority. It ships no dependency, process, Session, provider, fallback, adapter target, or source baseline.
_中文_: Codex 交互模型参考
_Avoid_: Codex runtime, Primary Agent Harness, UI baseline, component library, product shell

**Harness Agent Behavior Layer**:
AI7's configured use of the DeepSeek Harness Agent Behavior Framework, shaping Agent Behavior through profiles, bundles, presets, plugins, prompts/context, tools, policies, workflows, subagents, sessions, and hooks.
_Avoid_: Editorial Intelligence Layer, AI7 business authority

**Harness Behavior Composition**:
A versioned, reconstructable selection and configuration of Harness behavior-shaping components used by an agent or task.
_Avoid_: Hidden prompt, model weights

**Agent Behavior Improvement**:
An evaluation-driven, reviewable change to Harness Behavior Composition intended to improve how the agent performs work, without changing Foundation Model weights or silently promoting editorial knowledge.
_Avoid_: Model Training, Editorial Learning, runtime self-rewriting

**Policy Document**:
A versioned, human-reviewable and machine-validatable document that states product rules, scopes, authority boundaries, defaults, exceptions, and provenance; the active version governs behavior without hiding authority in prompts or code-only defaults.
_Avoid_: Configuration fragment, system prompt, informal guideline

**Post-run Policy Review**:
An evidence-based examination of a completed production run to determine whether a Policy Document should remain unchanged or receive a Proposed Policy Revision.
_Avoid_: Model self-training, automatic policy mutation

**Proposed Policy Revision**:
A new, non-destructive Policy Document version or diff authored by a user or AI agent, linked to its production-run evidence, rationale, evaluation, and expected effect; it does not rewrite historical versions.
_Avoid_: In-place policy edit, active policy

**Policy Revision Activation**:
The audited transition that makes one Proposed Policy Revision the active Policy Document version, either through explicit user acceptance or through non-expansive automatic calibration inside a user-approved envelope.
_Avoid_: File save, agent self-authorization

**Task Intent**:
The exact goal, Task Skill, inputs, Book or deliverable context, document/revision/selection pins, and expected Task Outcome of one requested task.
_中文_: 任务意图
_Avoid_: Prompt, Run, Execution Plan

**Execution Plan**:
A versioned plan of capabilities, steps, expected artifacts, declared Effects and gates, stop conditions, and provider needs for one Task Intent.
_中文_: 执行计划
_Avoid_: Plan Preview, Plan Envelope, Harness plan-mode state

**Plan Preview**:
The concise human-readable projection of an Execution Plan and its uncertainties, authority boundaries, and expected outcomes; it carries no authority by itself.
_中文_: 计划预览
_Avoid_: Run Authorization, Plan Envelope

**Plan Envelope**:
The machine-authoritative limits within which Run Authorization permits execution, including capabilities, tools, sources, providers, privacy category, the exact Run Budget Ceiling state, fallback/retry rules, adaptation classes, and Effect gates.
_中文_: 计划权限边界
_Avoid_: Plan Preview, Effect Approval, standing permission

**Run Budget Ceiling**:
The optional AI7-owned hard monetary or usage ceiling for one Run, bound in the Plan Envelope as either an explicit value or `unset`; `unset` is the default and means only that AI7 applies no product-side per-Run ceiling, not that provider service is free, unlimited, or exempt from Provider Account Limits.
_中文_: 任务运行预算上限
_Avoid_: Provider Account Limit, cost estimate, Authority Ceiling, free service, unlimited provider account

**Run Budget Ceiling Reached**:
The terminal Task Outcome classification used when an explicit Run Budget Ceiling prevents further model dispatch; it preserves partial results and actual work but creates no new result-record type and cannot continue through Resume or Retry.
_中文_: 任务运行预算已达上限
_Avoid_: Provider Account Limit, Task success, paused Run, new Task Outcome type

**Plan Adaptation**:
A recorded adjustment to an Execution Plan that remains explicitly permitted by its unchanged Plan Envelope.
_中文_: 计划内调整
_Avoid_: Plan Revision, silent drift

**Plan Revision**:
A material change to a Task Intent, Execution Plan, or Plan Envelope that suspends execution until a renewed Run Authorization binds the new version.
_中文_: 计划修订
_Avoid_: Plan Adaptation, in-place historical edit

**Clarification Request**:
A durable typed wait asking the user for information needed to resolve ambiguity in intent, evidence, authority, or the next safe action.
_中文_: 澄清请求
_Avoid_: Ephemeral chat question, generic approval

**Task Outcome**:
A durable typed result recording actual-versus-planned work, evidence, artifacts or proposals, decisions, Effects and receipts, unresolved matters, and the safe next action.
_中文_: 任务结果
_Avoid_: Raw model response, Effect Receipt, authoritative manuscript state

**Task Ledger**:
The authoritative AI7 persistence plane for task-business facts and provenance links; each Workflow Instance, decision, Effect, and other domain record retains its own semantic ownership. It never duplicates the Harness execution event stream.
_中文_: 任务账本
_Avoid_: Harness Session Ledger, transcript, all AI7 domain storage

**Run Record**:
A stable-identity, append-only or versioned semantic provenance record for one authorized effort under an unchanged Task Intent and Plan Envelope; it may link multiple safe execution attempts or spans and one terminal Task Outcome.
_中文_: 任务运行记录
_Avoid_: Harness Session, Harness Execution Span, execution attempt, transcript

**Harness Session Ledger**:
The authoritative append-only Harness record of model-visible messages, effective requests, turns, steps, tool calls and results, execution events, and Session lineage.
_中文_: Harness 会话账本
_Avoid_: Task Ledger, editorial workflow state, Effect Receipt

**Harness Session**:
A durable Harness-native model-execution context whose Session Ledger records one evolving interaction history; it is not an AI7 Run Record or manuscript branch.
_中文_: Harness 会话
_Avoid_: Run Record, Workflow Instance, Manuscript Branch

**Harness Session Event**:
One ordered event in a Harness Session Ledger describing model or executor history without by itself establishing AI7 business authority or outcome truth.
_中文_: Harness 会话事件
_Avoid_: Domain event, Effect Receipt, editorial decision

**Execution Binding**:
A stable cross-ledger association between an AI7 Task Intent or Run Record and exact Harness identities, sequence ranges, and semantic-envelope digest without transferring authority or copying event content.
_中文_: 执行绑定
_Avoid_: Authorization, Effect Receipt, duplicated transcript

**Harness Execution Span**:
The exact contiguous Harness Session event range or explicit event-range set attributable to one AI7 dispatch, continuation, or retry.
_中文_: Harness 执行区段
_Avoid_: Run Record, execution attempt, whole Harness Session

**Event Projection**:
A non-authoritative, disposable, rebuildable AI7 read view derived from Harness Session Events; only an explicit AI7 domain transition may create business truth from observed execution.
_中文_: 事件投影视图
_Avoid_: Authoritative event, copied Session log, business decision

**Durable Session Watermark**:
The exact persisted Harness Session sequence through which one Event Projection has ingested events; it proves no correctness, completion, commit, progress, or continuation safety.
_中文_: 持久会话水位线
_Avoid_: Run Continuation Checkpoint, completion proof, progress

**Task Skill**:
An immutable declarative workflow package defining editorial purpose, instructions, contracts, requested AI7 Capabilities, eligible scopes, Model Roles, Effect gates, and validation requirements.
_中文_: 任务技能
_Avoid_: Harness Skill, Cordis Plugin, prompt fragment

**Task Skill Manifest**:
The machine-validatable authority-request and compatibility contract of one Task Skill Package; it grants nothing by itself.
_中文_: 任务技能清单文件
_Avoid_: Skill catalog, Capability Grant, editable trust claim

**Task Skill Package**:
The immutable manifest, instructions, resources, examples, and validation material distributed as one content-addressed unit.
_中文_: 任务技能包
_Avoid_: Capability Implementation, mutable skill folder

**Task Skill Candidate**:
A complete non-executing proposed Task Skill Package awaiting independent admission, installation, validation, and enablement.
_中文_: 候选任务技能
_Avoid_: Installed Task Skill Version, enabled skill

**Task Skill Trust Tier**:
A provenance-derived class such as bundled or local-user that limits admission and maximum capability without asserting lifecycle state or current authority.
_中文_: 任务技能信任等级
_Avoid_: Admission State, Task Skill Enablement, manifest trustLevel

**Admission State**:
The lifecycle state recording whether exact Task Skill bytes are rejected, installed-disabled, validated, enabled, disabled, or retired.
_中文_: 技能准入状态
_Avoid_: Task Skill Trust Tier, runtime status

**Installed Task Skill Version**:
An immutable app-managed version identified by Task Skill identity, semantic version, and content digest.
_中文_: 已安装任务技能版本
_Avoid_: Source folder, latest version, Task Skill Activation

**Task Skill Enablement**:
The explicit state allowing one validated Installed Task Skill Version to request authority up to an exact Authority Ceiling in future tasks.
_中文_: 任务技能启用状态
_Avoid_: Run Authorization, Task Skill Activation, Effect Approval

**Authority Ceiling**:
The maximum capabilities, eligible scope kinds, Model Role needs, and Effect classes one Installed Task Skill Version may ever request.
_中文_: 权限上限
_Avoid_: Capability Grant, Run Authorization, standing permission

**AI7 Capability**:
A stable governed product operation available only through policy-aware AI7 boundaries, independent of how Harness exposes an invocation adapter.
_中文_: AI7 能力
_Avoid_: Harness Tool, Capability Implementation, feature screen

**Capability Implementation**:
One pinned installed implementation of an AI7 Capability, kept separate from Task Skill packages and runtime authority.
_中文_: 能力实现
_Avoid_: Task Skill, Model Provider, Harness Skill Provider

**Harness Tool**:
A model-visible invocation adapter in the Harness tool pipeline; its visibility or successful call does not establish AI7 product authority or outcome proof.
_中文_: Harness 工具
_Avoid_: AI7 Capability, Capability Grant, Effect Receipt

**Capability Grant**:
Exact authority for one Task Skill Activation to invoke an AI7 Capability under stated operation and scope constraints.
_中文_: 能力使用许可
_Avoid_: Authority Ceiling, Execution Grant, Effect Approval

**Task Skill Activation**:
The immutable per-Run intersection of Task Skill identity, trust and enablement ceilings, Plan Envelope, Run Source Scope, Provider Resolution Plan, policies, Capability Grants, and credential references.
_中文_: 任务技能运行激活
_Avoid_: Task Skill Enablement, Harness Skill Projection, Harness Session

**Harness Skill Projection**:
The non-authoritative instructional and catalog representation of an admitted AI7 Task Skill in the Harness Skill registry.
_中文_: Harness 技能投影
_Avoid_: Task Skill Package, Capability Implementation, authority grant

**Third-Party DSH Plugin**:
An externally authored open-source DSH plugin admitted into AI7's composition for an identified capability or composition need. It is a code-bearing Capability Implementation or composition dependency, never a Task Skill, Policy Document, Model Provider, credential, Authority Ceiling, Capability Grant, or user-facing brand. It supplies mechanism only; capability expansion never self-activates.
_中文_: 第三方 DSH 插件
_Avoid_: Task Skill, extension marketplace item, Capability Grant, product feature brand

**Plugin Admission Snapshot**:
The dated immutable record of a Third-Party DSH Plugin's repository identity, open-source license, GitHub stars, qualifying update commits, latest qualifying update date, selected version/commit, artifact identity, and notice obligations when AI7 selects that version. These are admission facts, not continuing runtime inputs or scheduled re-measurements; another upstream version requires another snapshot.
_中文_: 插件准入快照
_Avoid_: Health check, quality score, evaluation report, monitoring signal

**Local Plugin Pin**:
The immutable AI7-controlled binding from one admitted plugin identity/version to its exact upstream commit, local artifact digest, manifest entry, lockfile entry, provenance, and rollback predecessor. Ranges, branches, mutable tags, and `latest` are forbidden; AI7 performs no automatic upstream update.
_中文_: 本地插件版本锁定
_Avoid_: Dependency range, update channel, automatic update policy

**Implementation Assumption**:
A design-stage expectation about DSH or platform behavior paired with the bounded response if implementation finds otherwise. It records uncertainty without creating an evidence task, validation gate, authority, or product promise.
_中文_: 实现假设
_Avoid_: Verified capability, defect, acceptance test, Owner blocker

**Run Source Scope**:
The exact Book, Series, Cross-project, source, and revision read boundary authorized for one Run. Its frozen record is never rewritten, while a later effective restriction may reduce executable access and force Plan Revision plus renewed Run Authorization but can never expand access silently.
_中文_: 任务运行来源范围
_Avoid_: Working Corpus, Outbound Data Category, mutation authority

**Model Role**:
A provider-independent function actually needed by a Task Skill, such as planner, writer, reviewer, embedder, or reranker.
_中文_: 模型角色
_Avoid_: Model Provider, model name, Provider Binding

**Fast Interaction Role**:
The Model Role for quick interaction, low-risk candidate generation, and latency-sensitive assistance. Its accepted default binding is DeepSeek V4 Flash.
_中文_: 快速交互角色
_Avoid_: Cheap model, draft-only model, factual authority

**Main Editorial Role**:
The Model Role for Chinese long-form writing, editorial proposals, cross-source synthesis, factual research, and complex instruction following. Its accepted default binding is DeepSeek V4 Pro High.
_中文_: 主编辑角色
_Avoid_: Default model, editor, decision maker, factual authority

**Difficult Escalation Role**:
The Model Role for difficult or unusually consequential work that exceeds the Main Editorial Role's expected capability. Its accepted default binding is DeepSeek V4 Pro Max; escalation is an AI7 policy and plan decision, never a model's own choice.
_中文_: 疑难升级角色
_Avoid_: Retry model, automatic fallback, authority upgrade

**Frontier Model Role**:
The Model Role for challenge or explicitly authorized high-consequence work. Its accepted default binding is DeepSeek V4 Pro Max; an explicitly configured eligible alternative enters the same one-loop topology, Provider Resolution Plan, Credential Broker, Run Budget Ceiling state, and egress boundary.
_中文_: 前沿模型角色
_Avoid_: Second harness, silent fallback, escape hatch, truth oracle

These four named roles remain Model Roles: Task Skills declare hard requirements and soft preferences, never a provider, model, endpoint, or credential. A default binding is a configuration fact, never factual authority; output remains a proposal or research lead.

**Model-role Requirement**:
A non-negotiable capability, context, policy, or compatibility condition for one used Model Role.
_中文_: 模型角色硬性要求
_Avoid_: Model-role Preference, provider choice

**Model-role Preference**:
A quality, cost, or speed ranking applied only after every hard user and policy constraint is satisfied.
_中文_: 模型角色偏好
_Avoid_: Model-role Requirement, hard budget override

**Model Provider**:
An external or local service offering concrete models through an adapter, distinct from skill sources and Capability Implementations.
_中文_: 模型服务提供方
_Avoid_: Provider, Harness Skill Provider, Capability Implementation

**Provider Binding**:
The exact Model Provider, model, profile or configuration revision, adapter version, and opaque credential binding used for one Model Role attempt.
_中文_: 模型提供方绑定
_Avoid_: Model Role, mutable provider preference, credential value

**Provider Resolution Plan**:
The immutable preflighted primary Provider Binding and ordered compatible fallback bindings for the Model Roles in one Run.
_中文_: 模型服务选用方案
_Avoid_: Plan Envelope, dynamic provider selection, skill-owned provider

**Provider Preflight**:
The review that resolves Model Roles and shows Provider Bindings, Outbound Data Category, Run Source Scope, exact Run Budget Ceiling state, and blockers before Run Authorization.
_中文_: 模型服务预检
_Avoid_: Run Authorization, provider picker, live model call

**Provider Account Limit**:
An external Model Provider account quota, spending control, or credit condition that can block dispatch independently of the Run Budget Ceiling and Plan Envelope.
_中文_: 模型服务账户限额
_Avoid_: Run Budget Ceiling, Run Budget Ceiling Reached, provider rate limit, AI7 scheduler capacity, automatic fallback authority, free-service claim

**Connectivity Wait State**:
The durable state of an exactly authorized deferred-start Run that has not begun model work because required network or Model Provider service connectivity is unavailable; it remains cancellable and carries no implication of provider transmission or usage.
_中文_: 联网等待状态
_Avoid_: Resume-ready Run State, Run Capacity Wait, paused Run, provider call in progress

**Reconnect Preflight**:
The deterministic revalidation after connectivity or model-service readiness returns that may automatically dispatch only a Start When Online Run whose exact authorized target, scope, provider, outbound category, Run Budget Ceiling state, credential reference, policies, and other material boundaries remain unchanged.
_中文_: 联网恢复预检
_Avoid_: Resume, new Run Authorization, connection test alone, silent fallback

**Approved Fallback Chain**:
The ordered compatible Provider Bindings already visible and frozen in an authorized Provider Resolution Plan.
_中文_: 已批准备用链
_Avoid_: Silent fallback, any available provider

**Credential Reference**:
An opaque non-secret identifier resolved only inside its authorized consumer boundary.
_中文_: 凭据引用
_Avoid_: API key, secret value, environment variable

**Credential Broker**:
The AI7 authority that maps a Task Skill Activation, AI7 Capability, Run or Domain Command, and logical credential slot to an approved Credential Reference and releases the value only to the final consumer.
_中文_: 凭据代理服务
_Avoid_: Protected Secret Store, credential catalog, prompt injection

**Protected Secret Store**:
The operating-system-protected store holding secret values behind Credential References without exposing them to Task Skills or model-visible state.
_中文_: 安全凭据库
_Avoid_: Credential Broker, ordinary configuration, project data

**Outbound Data Category**:
A policy-defined classification of the exact content permitted to leave the local AI7 authority for Model Provider processing.
_中文_: 外发数据类别
_Avoid_: Run Source Scope, Public Release Permission, credential

**Provider Processing Policy**:
A Policy Document deciding which Outbound Data Categories and scopes may be sent to which configured Model Providers.
_中文_: 模型服务数据处理策略
_Avoid_: External Export Policy, Public Release Permission

_Target-qualified current route_: [`provider-processing-policy.v2.json`](../../policies/provider-processing-policy.v2.json), with its [policy-specific schema](../../policies/provider-processing-policy.v2.schema.json), [own human projection](../../policies/provider-processing-policy.v2.md), and exact [active-set v2 pin](../../policies/active-policy-set.v2.json). Immutable [`v1`](../../policies/provider-processing-policy.v1.json) remains predecessor history with its unchanged [schema](../../policies/provider-processing-policy.v1.schema.json) and [projection](../../policies/provider-processing-policy.md). V2's internal `lifecycleStatus: "active"` becomes repository-current/canonical only at an exact integrated `dev` commit where that same-tree v2 pin matches identity, version, path, and SHA-256; on any unintegrated task branch it is `accepted-but-unintegrated`.

**External Export Policy**:
A Policy Document governing transfer of an exact deliverable revision, source, or package across AI7-controlled storage to a named non-provider destination, including a user-chosen local filesystem destination. It is evaluated for each export Effect and is never a Delivery Package field, standing overwrite grant, Public Release Permission, or outcome proof.
_中文_: 对外导出策略
_Avoid_: Provider Processing Policy, Delivery Package authority, Effect Approval, Effect Receipt, Public Release Permission

_Target-qualified current route_: [`external-export-policy.v1.json`](../../policies/external-export-policy.v1.json), with its [policy-specific schema](../../policies/external-export-policy.v1.schema.json), [human projection](../../policies/external-export-policy.md), and exact [active-set v2 pin](../../policies/active-policy-set.v2.json). Its internal `lifecycleStatus: "active"` becomes repository-current/canonical only at an exact integrated `dev` commit where that same-tree v2 pin matches identity, version, path, and SHA-256; on any unintegrated task branch it is `accepted-but-unintegrated`.

<a id="local-export-preparation"></a>
**Local Export Preparation**:
A frozen per-file pre-Effect record created after platform-native destination and collision resolution, binding one exact Delivery Package version or Editorial Deliverable Revision, rendered format, filename, final local path, fidelity disposition, payload digest, create-or-replace disposition, and applicable External Export Policy. It supplies the exact target for a separate Effect Intent and Effect Approval; a changed path or disposition requires a new preparation.
_中文_: 本地导出准备
_Avoid_: Delivery Package, mutable file-dialog state, standing overwrite permission, Effect Approval, Effect Receipt, exported file

**Bundled Promotion Gate**:
The repository and release process that alone may assign bundled provenance to a validated Task Skill.
_中文_: 内置技能晋级关口
_Avoid_: Task Skill Enablement, in-product trust escalation, self-promotion

**Run Authorization**:
The user's decision to start one exact Task Intent under one exact Plan Envelope digest, including its provider, data, source scope, exact Run Budget Ceiling state, adaptation, and other reviewed bindings.
_中文_: 任务运行授权
_Avoid_: Execution Grant, Effect Approval, standing permission

**Execution Grant**:
One-shot authority for an agent to execute one frozen guarded step within an authorized Run and unchanged Plan Envelope.
_中文_: 单次执行许可
_Avoid_: Run Authorization, durable Effect Approval, editorial acceptance

**Effect**:
One declared authoritative or externally visible action whose identity, authority, outcome, and replay safety are tracked independently from other actions in a Run, workflow, or Domain Command.
_中文_: 受控动作
_Avoid_: Tool call, whole Run, generated suggestion

**Effect Intent**:
The exact pre-dispatch record of a planned Effect, binding its semantic envelope, target or destination, expected version, payload digest, policy, and required authority.
_中文_: 受控动作意图
_Avoid_: Attempt, Effect Receipt, generic plan step

**Effect Approval**:
Durable authority to attempt one exact governed Effect Intent; material target, payload, plan, scope, or policy drift invalidates it.
_中文_: 受控动作批准
_Avoid_: Proposal Decision, Execution Grant, proof of completion

**Effect Receipt**:
Durable outcome evidence binding one Effect identity and idempotency key to its exact authoritative result or classified external outcome without storing the payload itself.
_中文_: 受控动作回执
_Avoid_: Effect Approval, tool result, success toast

**Ambiguous External Outcome**:
The state in which an external Effect may have completed but available evidence cannot prove either completion or safe non-completion.
_中文_: 外部动作结果不明
_Avoid_: Failure, timeout, retryable error

**Manual Outcome Resolution**:
An evidence-bound user determination about one Ambiguous External Outcome, retained with its manual evidence class rather than presented as system verification.
_中文_: 人工结果确认
_Avoid_: Effect Receipt without qualification, arbitrary override

**Domain Command**:
An exact request to change AI7 business state through its owning domain boundary; a direct deterministic Domain Command need not create a Task Skill Run.
_中文_: 领域命令
_Avoid_: Prompt, Harness tool call, Task Intent

**Prepared Command**:
A frozen Domain Command whose target, version, payload, policy, authority, and idempotency conditions have been validated but whose Effect has not yet been proven.
_中文_: 已准备命令
_Avoid_: Effect Receipt, completed command, mutable draft

**Command Outbox**:
The durable Task Ledger record committed with a Domain Command and awaiting deduplicated delivery across the AI7-to-Harness persistence boundary.
_中文_: 命令发件箱
_Avoid_: Harness inbox, completion receipt, transient queue

**Run Continuation Checkpoint**:
A verified AI7 semantic boundary recording unchanged Run state, authoritative workflow and Effect references, and the next safe dispatch into a new Harness Execution Span.
_中文_: 运行续行检查点
_Avoid_: Durable Session Watermark, Session flush, Manuscript Checkpoint

**Resume-ready Run State**:
The settled interrupted-Run state in which unchanged semantics and pins plus a verified Run Continuation Checkpoint permit—but never dispatch—Resume after lightweight revalidation and explicit user action.
_中文_: 任务运行可续行状态
_Avoid_: Cooperative Run Pause, Connectivity Wait State, Run Capacity Wait, Retry availability, process restoration, Run invalidated by an effective source restriction

**Resume**:
User-requested continuation of the same Run under unchanged semantics from authoritative AI7 state after lightweight revalidation, possibly through a new Harness Session or Harness Execution Span; safe restart reconciliation alone never dispatches it.
_中文_: 续行
_Avoid_: Retry, Redo, automatic process restoration, continuation after a material source restriction

**Retry**:
A new explicitly linked execution attempt within the same unchanged Run when evidence proves repetition is safe.
_中文_: 重试
_Avoid_: Resume, Redo, automatic ambiguous-Effect repetition

**Redo**:
A new Run with renewed authorization when semantics change, the user requests a fresh result, or a terminal Run requires a changed Run Budget Ceiling.
_中文_: 重做
_Avoid_: Retry, Resume, in-place Run mutation

**Replay**:
Reconstruction or return of existing durable records without invoking the model, repeating an Effect, or creating a new execution attempt.
_中文_: 重放
_Avoid_: Retry, re-execution, regeneration

**Editorial Capability Profile**:
The shipped capability profile for editorial users, exposing domain-shaped AI7 Capabilities only and never a generic shell, roaming filesystem, or arbitrary network tool. Users cannot escalate out of it.
_中文_: 编辑端能力档案
_Avoid_: Editorial Profile (the Editorial-context dimension defaults), Harness Profile, a settings toggle

**Developer Capability Profile**:
The unshipped capability profile carrying the generic tool surface, used to build AI7 and by Repository Development Dispatch workers. A build and repository artifact, never a product setting.
_中文_: 开发端能力档案
_Avoid_: Editorial Capability Profile, an in-product power-user mode, an escalation path

**Agent Data Root**:
The AI7-owned directory intended to be the platform filesystem boundary for governed Book stores and per-Run scratch; it excludes the Protected Secret Store and lives outside any repository working tree. Run Source Scope is the nested semantic read boundary. Until a concrete Windows or macOS confinement mechanism is selected and shown sufficient for a stronger claim, AI7 capability and service facades are the enforceable boundary and AI7 assumes no whole-process OS filesystem isolation.
_中文_: 智能体数据根目录
_Avoid_: Run Source Scope, a general filesystem grant, a proven whole-process OS sandbox, a repository working tree

**Agent Behavior Asset**:
A versioned prompt, instructional text, task guidance, or bounded ranking parameter that shapes output quality and never grants authority. Agent-proposable, with auto-activation limited to non-expansive calibration inside a user-approved envelope.
_中文_: 智能体行为资产
_Avoid_: Policy Document, House Editorial Memory, model weights, hidden runtime configuration

**E2E Functional Gate**:
The project's sole automated engineering-test surface: one logical provider-free gate running the same complete supported journey IDs and observed-bug regressions on Windows and macOS through the launchable product path. It uses only public test material admitted for the exact journey—public synthetic data or an Owner-designated Public SampleBook—fails when either platform fails, and makes no separate layer, performance, security, provider, packaging, replay, release, or architecture-closure claim.
_中文_: 端到端功能关口
_Avoid_: Factual Verification, Workflow Gate, Effect Receipt, architecture proof
