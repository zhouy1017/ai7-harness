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
The machine-authoritative limits within which Run Authorization permits execution, including capabilities, tools, sources, providers, privacy category, budget, ceilings, fallback/retry rules, adaptation classes, and Effect gates.
_中文_: 计划权限边界
_Avoid_: Plan Preview, Effect Approval, standing permission

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

**Run Source Scope**:
The exact Book, Series, Cross-project, source, and revision read boundary authorized for one Run.
_中文_: 任务运行来源范围
_Avoid_: Working Corpus, Outbound Data Category, mutation authority

**Model Role**:
A provider-independent function actually needed by a Task Skill, such as planner, writer, reviewer, embedder, or reranker.
_中文_: 模型角色
_Avoid_: Model Provider, model name, Provider Binding

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
The review that resolves Model Roles and shows Provider Bindings, Outbound Data Category, Run Source Scope, budget, and blockers before Run Authorization.
_中文_: 模型服务预检
_Avoid_: Run Authorization, provider picker, live model call

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

**External Export Policy**:
A Policy Document governing transfer of an exact deliverable, source, or package to a named non-provider destination.
_中文_: 对外导出策略
_Avoid_: Provider Processing Policy, Public Release Permission

**Bundled Promotion Gate**:
The repository and release process that alone may assign bundled provenance to a validated Task Skill.
_中文_: 内置技能晋级关口
_Avoid_: Task Skill Enablement, in-product trust escalation, self-promotion

**Run Authorization**:
The user's decision to start one exact Task Intent under one exact Plan Envelope digest, including its provider, data, source scope, budget, adaptation, and other reviewed bindings.
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

**Resume**:
Continuation of the same Run under unchanged semantics from authoritative AI7 state, possibly through a new Harness Session or Harness Execution Span.
_中文_: 续行
_Avoid_: Retry, Redo, process restoration

**Retry**:
A new explicitly linked execution attempt within the same unchanged Run when evidence proves repetition is safe.
_中文_: 重试
_Avoid_: Resume, Redo, automatic ambiguous-Effect repetition

**Redo**:
A new Run with renewed authorization when semantics change or the user requests a fresh result.
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
The AI7-owned directory that bounds agent filesystem authority, contains governed Book stores plus isolated per-Run scratch, excludes the Protected Secret Store, and lives outside every repository working tree.
_中文_: 智能体数据根目录
_Avoid_: Run Source Scope, a general filesystem grant, a repository working tree

**Agent Behavior Asset**:
A versioned prompt, instructional text, task guidance, or bounded ranking parameter that shapes output quality and never grants authority. Agent-proposable, with auto-activation limited to non-expansive calibration inside a user-approved envelope.
_中文_: 智能体行为资产
_Avoid_: Policy Document, House Editorial Memory, model weights, hidden runtime configuration

**Behavior Evaluation Gate**:
The two-sided check an Agent Behavior Asset, Policy Document, or composition revision must pass before activation: deterministic replay against a fixed scenario corpus for regression, plus production Delivery Quality Metrics for real-world gain. Sample size below the confidence threshold permits proposal but never auto-activation.
_中文_: 行为评估关口
_Avoid_: Workflow Gate, Standalone Editing Sufficiency Gate, the Pull-request Gate, Effect Approval
