# Ubiquitous Language

Status: **accepted bilingual language guide**

This is a concise bilingual reading view of AI7's ambiguity-sensitive domain language. The complete English-to-Simplified-Chinese label catalog is in [GLOSSARY.md](./GLOSSARY.md); canonical definitions remain owned by the context files linked there, so this guide must not create competing meanings.

## Editorial text and verification

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Textual Source of Record** | 文本原文基准 | The exact revision that establishes what a text says, not whether its assertions are true. | 事实权威、真相来源 |
| **Manuscript Assertion** | 稿件陈述 | A factual, logical, referential, or semantic claim expressed or implied by manuscript text. | 已核实事实 |
| **Factual Verification** | 事实核验 | The evidence-based assessment of a Manuscript Assertion against appropriate factual authority. | 原文匹配、模型判断 |
| **Evidence Link** | 证据关联 | A typed exact-revision relationship from a quotation, assertion, finding, or correction proposal to evidence and its assigned role. | 显示引用、无类型来源列表 |
| **Reference Integrity** | 引证完整性 | The check that cited evidence has the stated identity, revision, location, digest, and text. | 陈述支持性、事实核验 |
| **Claim Support** | 陈述支持性 | The check that evidence supports a claim for its assigned role and scope. | 引证完整性、普遍事实真相 |
| **Quotation Verification** | 引文核验 | The exact-text check against authoritative original text under declared presentation-only normalization. | 模糊匹配、语义相似、事实核验 |
| **Source Search** | 来源检索 | Non-authoritative discovery of candidate source identities or passages. | 原文精确提取、权威原文 |
| **Exact Fetch** | 原文精确提取 | Authorized resolution of a stable reference against one exact revision to return authoritative text and integrity evidence. | 检索候选、模型重构文本 |
| **Semantic Review** | 语义审读 | Editorial assessment of coherence, meaning, reference, contradiction, and intended consistency. | 语法检查、事实核验 |
| **Editorial Error Finding** | 编辑差错发现项 | A revision-bound, evidence-linked record of a suspected factual or semantic defect. | 模型裁决、已完成更正 |
| **Correction Proposal** | 更正提案 | A suggested exact-revision change that does not alter the active manuscript until accepted and committed. | 静默改写、已应用修改 |

## Manuscript history

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Source Version** | 源材料版本 | An immutable imported-evidence version that may seed editable work but is not editable manuscript history. | 稿件修订版、当前稿 |
| **Manuscript Block** | 稿件结构块 | A stable structural text identity whose lineage continues across edits and moves. | 检索块、行号、书签 |
| **Manuscript Revision** | 稿件修订版 | An immutable, reconstructable checkpoint of one complete editable manuscript state. | 源材料版本、自动保存 |
| **Edit Journal** | 修订日志 | The durable ordered changes since a branch's base revision that reconstruct current working state. | 稿件历史、操作日志 |
| **Manuscript Checkpoint** | 稿件修订检查点 | The validated transition that commits journal-reconstructed state as a new Manuscript Revision. | 操作续行检查点、恢复快照 |
| **Proposal Branch** | 提案分支 | An isolated branch carrying one lineage of proposed generated text changes from an exact base. | 更正提案、活动稿件 |
| **Recovery Snapshot** | 恢复快照 | Independently stored and verified state sufficient to reconstruct protected manuscript history after failure. | 稿件修订检查点、普通备份声明 |
| **Manuscript Pin** | 稿件精确绑定 | The exact Book, branch, revision, and digest identity governing a dependent record or decision. | 当前稿、最新版本、置顶 |

## Deliverables and workflows

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Manuscript** | 稿件 | The Book's primary long-form editable text, with its own manuscript history. | 源材料、全部编辑交付成果 |
| **Promotion Article** | 宣传文章 | A Book-related deliverable written for an identified promotional audience or channel. | 公开发布许可、通用生产文案 |
| **News Report** | 新闻报道 | A Book-related factual deliverable with explicit source, quotation, chronology, signoff, and correction requirements. | 未核实宣传稿 |
| **Review Article** | 评论文章 | A publishable deliverable discussing a work under evidence, quotation, disclosure, and signoff requirements. | 编辑审读、编辑评审决定 |
| **Deliverable Workflow** | 交付成果工作流程 | The durable editorial process governing one deliverable independently of its Book's other deliverables. | 整本书单一阶段、Harness Workflow |
| **Workflow Profile** | 工作流程方案 | A versioned reusable definition of phases, gates, required artifact types, and default responsibilities for a deliverable family. | 编辑维度方案、Harness Profile |
| **Workflow Instance** | 工作流程实例 | One deliverable's durable application of an exact Workflow Profile version. | Harness Session、Harness Workflow |
| **Workflow Phase** | 工作阶段 | A named area of work with durable status, evidence, responsibility, and next action. | 进度百分比、统一出版阶段 |
| **Workflow Gate** | 工作关口 | A profile-defined evidence and human-decision requirement before a specified transition or delivery. | 受控动作批准、通用审批 |
| **Editorial Artifact** | 编辑工作资料 | A versioned, typed, provenance-bearing supporting record around a deliverable. | 编辑交付成果、任意运行输出 |
| **Signoff Record** | 签发记录 | A human decision that exact evidence and an exact revision are ready for a stated next use. | 公开发布许可、事实证明 |
| **Delivery Package** | 交付包 | The exact deliverable revision, required artifacts, signoffs, destination, and release/export authority for one handoff. | 压缩包、已发布证明 |
| **Editorial Review** | 编辑审读 | Professional assessment that produces findings and Review Decisions rather than a publishable article. | 评论文章、单独事实核验 |

## Learning and model boundaries

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Editorial Learning** | 编辑经验学习 | Governed reuse of eligible professional feedback and patterns outside model weights. | 模型训练、智能体行为改进 |
| **Model Training** | 模型训练 | Creation or modification of language-model weights, which AI7 does not perform. | 编辑经验学习、检索记忆 |
| **Agent Behavior Improvement** | 智能体行为改进 | Evaluated changes to Harness behavior composition without absorbing editorial knowledge or changing model weights. | 编辑经验学习、模型训练 |
| **House Editorial Memory** | 社级编辑记忆 | Provider-independent, inspectable editorial knowledge derived for reuse across eligible unrelated Books. | 原始语料镜像、模型权重、Session 记忆 |
| **Series** | 书系 | An explicitly related group of Books sharing continuity, canon, identity, or other durable editorial knowledge. | 文件夹、推断集合、仅指丛书 |

## Task planning and outcomes

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Task Intent** | 任务意图 | The exact requested goal, Task Skill, inputs, editorial context and pins, and expected Task Outcome. | 提示词、Run、执行计划 |
| **Execution Plan** | 执行计划 | A versioned statement of intended capabilities, steps, artifacts, Effects/gates, stop conditions, and provider needs. | 计划预览、计划权限边界、Harness plan mode |
| **Plan Preview** | 计划预览 | The human-readable projection of an Execution Plan and its uncertainty, authority, and expected outcomes. | 任务运行授权、计划权限边界 |
| **Plan Envelope** | 计划权限边界 | The machine-authoritative capabilities, sources, providers, privacy, budget, limits, adaptation rules, and Effect gates permitted by Run Authorization. | 计划预览、受控动作批准、长期权限 |
| **Plan Adaptation** | 计划内调整 | A recorded plan adjustment that stays inside the unchanged Plan Envelope. | 计划修订、静默漂移 |
| **Plan Revision** | 计划修订 | A material intent, plan, or envelope change that suspends execution and requires renewed Run Authorization. | 计划内调整、原地改写历史 |
| **Clarification Request** | 澄清请求 | A durable typed wait for user information needed to resolve intent, evidence, authority, or the next safe action. | 临时聊天问题、通用审批 |
| **Task Outcome** | 任务结果 | A durable typed result carrying actual-versus-planned work, evidence, proposals/artifacts, decisions, Effects/receipts, unresolved matters, and next action. | 原始模型回答、编辑工作资料、受控动作回执 |

## Task Skills, capabilities, and trust

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Task Skill** | 任务技能 | An immutable declarative editorial-workflow package that may request governed capabilities but carries no authority by itself. | Harness Skill、Cordis Plugin、提示词 |
| **Task Skill Manifest** | 任务技能清单文件 | The machine-validatable authority-request and compatibility contract inside a Task Skill Package. | 技能目录、权限许可、信任决定 |
| **Task Skill Package** | 任务技能包 | One immutable content-addressed unit of manifest, instructions, resources, examples, and validation material. | 可变技能目录、能力实现 |
| **Task Skill Candidate** | 候选任务技能 | A complete non-executing proposed package awaiting independent admission. | 已安装任务技能版本、已启用技能 |
| **Task Skill Trust Tier** | 任务技能信任等级 | A provenance-derived class limiting admission and maximum capability. | 技能准入状态、当前权限 |
| **Admission State** | 技能准入状态 | The lifecycle state of exact skill bytes from rejection through installation, validation, enablement, disablement, or retirement. | 信任等级、运行状态 |
| **Installed Task Skill Version** | 已安装任务技能版本 | An immutable app-managed skill identity, semantic version, and content digest. | 最新文件、任务技能运行激活 |
| **Task Skill Enablement** | 任务技能启用状态 | The state allowing a validated version to request authority up to its exact Authority Ceiling. | 任务运行授权、运行激活 |
| **Authority Ceiling** | 权限上限 | The maximum authority one installed Task Skill version can ever request. | 能力使用许可、单次执行许可、受控动作批准 |
| **AI7 Capability** | AI7 能力 | A stable governed product operation independent of its Harness invocation adapter or implementation. | Harness 工具、能力实现、功能界面 |
| **Capability Implementation** | 能力实现 | One pinned installed implementation of an AI7 Capability. | 任务技能、模型服务提供方 |
| **Harness Tool** | Harness 工具 | A model-visible invocation adapter whose visibility is not product authority. | AI7 能力、能力使用许可 |
| **Capability Grant** | 能力使用许可 | The exact AI7 Capabilities one Task Skill Activation may use under stated constraints. | 权限上限、单次执行许可 |
| **Task Skill Activation** | 任务技能运行激活 | The immutable per-Run intersection of skill identity, ceilings, plan, scope, provider plan, policies, capabilities, and credential references. | 启用状态、Harness Session |
| **Harness Skill Projection** | Harness 技能投影 | The non-authoritative instructional/catalog representation of an admitted Task Skill inside Harness. | 源技能包、权限来源 |
| **Run Source Scope** | 任务运行来源范围 | The exact Book, Series, Cross-project, source, and revision read boundary authorized for one Run. | 工作语料库、外发数据类别、修改权限 |

## Model services, credentials, and outbound data

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Model Role** | 模型角色 | A provider-independent function actually required by a Task Skill. | 模型名、模型服务提供方 |
| **Model-role Requirement** | 模型角色硬性要求 | A condition a concrete model binding must satisfy before it is eligible. | 模型角色偏好 |
| **Model-role Preference** | 模型角色偏好 | A soft quality, cost, or speed ranking applied only after hard constraints pass. | 模型角色硬性要求、提供方选择 |
| **Model Provider** | 模型服务提供方 | An external or local service offering concrete models through an adapter. | 能力实现、Harness Skill Provider |
| **Provider Binding** | 模型提供方绑定 | The exact provider, model, configuration revision, adapter, and credential reference for one role attempt. | 模型角色、动态偏好 |
| **Provider Resolution Plan** | 模型服务选用方案 | The immutable primary binding and ordered compatible fallback bindings for one Run. | 计划权限边界、动态选择 |
| **Provider Preflight** | 模型服务预检 | The pre-authorization review of bindings, outbound-data category, source scope, budget, and blockers. | 任务运行授权、实时调用 |
| **Approved Fallback Chain** | 已批准备用链 | The ordered provider bindings already frozen inside the authorized resolution plan. | 任意可用提供方、静默回退 |
| **Credential Reference** | 凭据引用 | A persistent non-secret handle to a protected secret. | API Key、秘密副本 |
| **Credential Broker** | 凭据代理服务 | The authority that resolves an approved reference only for the final authorized consumer. | 安全凭据库、凭据目录 |
| **Protected Secret Store** | 安全凭据库 | The OS-protected store that alone holds secret values. | 普通配置、凭据代理服务 |
| **Outbound Data Category** | 外发数据类别 | The policy classification of exact content permitted to leave local AI7 for model processing. | 任务运行来源范围、公开发布许可 |
| **Provider Processing Policy** | 模型服务数据处理策略 | The rule governing which content categories and scopes may be sent to which configured model services. | 对外导出策略、公开发布许可 |
| **External Export Policy** | 对外导出策略 | The rule governing transfer of exact material to a named non-provider destination. | 模型服务数据处理策略、公开发布许可 |
| **Bundled Promotion Gate** | 内置技能晋级关口 | The repository/release gate that alone assigns bundled Task Skill provenance. | 技能启用、应用内信任升级 |

## Task and Harness execution records

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Task Ledger** | 任务账本 | AI7's authoritative business record for task intent, Runs, commands, authority, Effects, outcomes, and provenance references. | Harness 会话账本、全部领域数据 |
| **Run Record** | 任务运行记录 | One stable-identity, append-only or versioned authorized semantic/provenance record linked to one or more actual execution attempts without copying them. | Harness 会话、执行区段、智能体运行日志 |
| **Harness Session Ledger** | Harness 会话账本 | The authoritative Harness record of model messages, requests, turns, steps, tool activity, events, and Session lineage. | 任务账本、工作流程状态 |
| **Harness Session** | Harness 会话 | One durable Harness-native model-execution context. | 任务运行记录、稿件分支 |
| **Harness Session Event** | Harness 会话事件 | One ordered fact in the Harness execution history that carries no AI7 business authority by itself. | 领域事件、结果证明 |
| **Execution Binding** | 执行绑定 | The stable identity-and-range association between AI7 business records and exact Harness execution. | 授权、回执、日志副本 |
| **Harness Execution Span** | Harness 执行区段 | The exact Session-event range belonging to one dispatch, continuation, or retry attempt. | 任务运行记录、尝试结果 |
| **Event Projection** | 事件投影视图 | A rebuildable status/read view derived from Harness events. | 权威事件、第二执行账本 |
| **Durable Session Watermark** | 持久会话水位线 | The last persisted Session sequence safely processed by a projection. | 完成证明、检查点 |
| **Domain Command** | 领域命令 | An exact request to change state through the owning AI7 domain boundary. | 任务意图、提示词、工具调用 |
| **Prepared Command** | 已准备命令 | A validated and frozen Domain Command that has not yet proved a committed outcome. | 已完成命令、受控动作回执 |
| **Command Outbox** | 命令发件箱 | A durable command-delivery record committed with AI7 business state across the Harness persistence boundary. | 临时队列、完成回执 |
| **Run Continuation Checkpoint** | 运行续行检查点 | Verified semantic state from which the same unchanged Run can safely dispatch a new Harness Execution Span. | 稿件修订检查点、Harness 技术检查点 |
| **Resume** | 续行 | Continuation of the same unchanged Run from authoritative state. | 重试、重做、进程恢复 |
| **Retry** | 重试 | A new safe execution attempt inside the same unchanged Run. | 续行、重做、不明结果自动重复 |
| **Redo** | 重做 | A newly authorized Run created for changed semantics or a requested fresh result. | 重试、原地修改旧 Run |
| **Replay** | 重放 | Reconstruction of existing records without model invocation or Effect repetition. | 重试、重新执行、重新生成 |

## Authority, decisions, and outcome proof

| English term | 推荐简体中文 | Definition | Aliases to avoid |
| --- | --- | --- | --- |
| **Run Authorization** | 任务运行授权 | The user's decision to start one exact task/provider/data/scope/budget envelope. | 单次执行许可、受控动作批准 |
| **Execution Grant** | 单次执行许可 | One-shot authority for an agent to execute one frozen Plan or guarded step. | 长期授权、提案处理决定 |
| **Proposal Decision** | 提案处理决定 | The editor's content decision about one generated proposal without proof that integration completed. | 受控动作批准、实施结果 |
| **Review Decision** | 编辑评审决定 | A professional editorial judgment at a review gate. | 事实证明、受控动作批准 |
| **Effect** | 受控动作 | One authoritative or externally visible action tracked independently for authority, outcome, and replay. | 效果、副作用、整个操作 |
| **Effect Intent** | 受控动作意图 | The exact pre-dispatch envelope of one planned Effect. | 操作、尝试、受控动作回执 |
| **Effect Approval** | 受控动作批准 | Durable authority to attempt one exact governed Effect Intent. | 提案处理决定、结果证明 |
| **Effect Receipt** | 受控动作回执 | Durable evidence of the exact authoritative or classified external outcome of one Effect. | 批准、工具返回、成功提示 |
| **Public Release Permission** | 公开发布许可 | Authority to release identified Unpublished Editorial Material through an identified public channel. | 内部受控动作批准、任务运行授权 |
| **Ambiguous External Outcome** | 外部动作结果不明 | The state where an external Effect may have completed but available evidence cannot prove completion or safe non-completion. | 失败、可重试错误 |
| **Manual Outcome Resolution** | 人工结果确认 | An evidence-bound user determination about one ambiguous external outcome, visibly classified as manual evidence. | 系统核验、任意覆盖 |

## Relationships

- A **Run Authorization** may permit an agent to request one or more **Execution Grants**, but neither grants an unplanned **Effect Approval**.
- A **Task Skill Package** becomes an **Installed Task Skill Version** only through admission; **Task Skill Enablement** sets its **Authority Ceiling**, while **Task Skill Activation** computes the narrower exact authority for one Run.
- A **Capability Grant** identifies which **AI7 Capabilities** an activation may use; an **Execution Grant** permits one guarded step now, and neither is an **Effect Approval**.
- A **Harness Skill Projection** and visible **Harness Tools** help the model act, but AI7 service boundaries enforce the Task Skill Activation independently.
- **Run Source Scope** governs what may be read; **Outbound Data Category** and **Provider Processing Policy** separately govern what may be sent to a model service.
- A **Credential Reference** is a non-secret handle, the **Credential Broker** authorizes resolution, and the **Protected Secret Store** holds the value.
- A **Plan Preview** explains one **Execution Plan**, while the **Plan Envelope** is the exact machine-authoritative boundary bound by **Run Authorization**.
- A **Plan Adaptation** stays inside an unchanged Plan Envelope; a **Plan Revision** suspends execution until renewed Run Authorization binds its new digest.
- A **Task Outcome** reports what happened and what remains unresolved; it does not by itself become an Editorial Artifact, applied manuscript revision, Effect Receipt, or factual resolution.
- The **Task Ledger** and **Harness Session Ledger** form one causal graph but own different facts; an **Execution Binding** references exact **Harness Execution Spans** without copying their events.
- One **Run Record** may bind several Harness Sessions or Spans, and one **Harness Session** may contain activity for several Runs; only an explicit **Execution Binding**, never timestamp or adjacency, establishes causality.
- A **Harness Session Event**, **Event Projection**, or **Durable Session Watermark** never proves a Run outcome, business mutation, or Effect result.
- A Harness tool result or Session event never proves an **Effect** committed; only an **Effect Receipt** or explicitly classified reconciliation evidence establishes that outcome.
- A **Domain Command** becomes a **Prepared Command** before reliable dispatch through the **Command Outbox**; delivery or tool success still does not replace the applicable business record or Effect Receipt.
- **Resume** continues one Run, **Retry** makes a new safe attempt inside that Run, **Redo** creates a new Run, and **Replay** performs no execution.
- A single editor interaction may create both a **Proposal Decision** and an **Effect Approval**; the two records retain separate identities and meanings.
- An **Effect Approval** applies to exactly one unchanged **Effect Intent**; material drift requires a new intent and fresh authority.
- An **Effect Receipt** proves only its own **Effect**. A receipt for persisting a **Proposal Branch** cannot prove manuscript application.
- A **Manuscript Checkpoint** creates a **Manuscript Revision**; a **Run Continuation Checkpoint** safely continues unchanged task semantics; a **Recovery Snapshot** reconstructs protected manuscript state. Harness owns its own technical checkpoints.
- A **Book** owns related **Editorial Deliverables**, but each deliverable follows its own **Workflow Instance** pinned to a versioned **Workflow Profile**; one Book may therefore have a Manuscript in finalization and a Promotion Article in drafting at the same time.
- A completed **Workflow Gate** or **Signoff Record** establishes readiness for its stated next use only; it never establishes factual truth, Public Release Permission, or Learning Eligibility.
- An **Editorial Review** is work performed on a deliverable; a **Review Article** is itself a deliverable.
- **Editorial Learning**, **Agent Behavior Improvement**, and **Model Training** are three different processes; only the last changes model weights, and it is outside AI7's product thesis.

## Example dialogue

> **开发者：**“编辑点击‘接受并应用’，是不是记一条审批就够了？”

> **领域专家：**“不够。同一次交互可以同时产生一条**提案处理决定**和一条绑定精确稿件版本的**受控动作批准**，但两条记录的含义不同。”

> **开发者：**“工具返回成功后，就可以说稿件已经更新了吗？”

> **领域专家：**“不可以。只有对应的**受控动作回执**或明确分类的核对证据才能证明结果；如果外部动作结果不明，必须停止自动重试。”

> **开发者：**“那原稿里的历史事实写得很确定，能直接作为核验依据吗？”

> **领域专家：**“原稿只是**文本原文基准**，证明它写了什么；其中的**稿件陈述**仍需要独立的**事实核验**。”

> **开发者：**“一本书的稿件已经进入定稿，宣传文章也必须跟着进入定稿吗？”

> **领域专家：**“不需要。它们属于同一本书，但分别拥有自己的**工作流程实例**；稿件可以在定稿，宣传文章仍在撰写与编辑。宣传文章完成**签发记录**也不等于已经取得**公开发布许可**。”

> **开发者：**“运行中发现还要检索另一部未在范围内的书，智能体可以把它当作计划内调整吗？”

> **领域专家：**“不可以。扩大来源范围会越过原来的**计划权限边界**，必须暂停并提出**计划修订**；用户对新版本重新作出**任务运行授权**后才能继续。”

> **开发者：**“本地任务技能已经启用，是不是可以直接调用写稿能力并把结果导出？”

> **领域专家：**“不是。**任务技能启用状态**只确定这个版本的**权限上限**；本次任务还要形成**任务技能运行激活**和具体的**能力使用许可**，导出仍需单独的受控动作权限。”

> **开发者：**“它能读取当前书稿，是否就能把全文发送给已经配置的模型？”

> **领域专家：**“也不能推出。**任务运行来源范围**只管读取；是否可外发全文由**外发数据类别**和**模型服务数据处理策略**决定，并必须出现在本次计划权限边界中。”

> **开发者：**“为了显示进度，要不要把 Harness 的每条消息和工具事件再写进 AI7 的 Operation 日志？”

> **领域专家：**“不要。**Harness 会话账本**已经是执行事实来源；AI7 的**任务账本**只保存业务事实和**执行绑定**，界面状态从会话事件投影即可重建。”

> **开发者：**“程序重启后创建了新的 Harness 执行区段，这算新任务吗？”

> **领域专家：**“不一定。语义不变时可以是同一任务运行记录的**续行**或安全**重试**；只有语义变化或要求重新产出时才是新 Run 的**重做**。”

## Flagged ambiguities

- “Approval / 批准 / 审批” previously mixed task start, one-shot execution, proposal handling, review judgment, exact Effect authority, and public release. Use the six named records instead.
- “Effect” is not translated as “效果” or user-facing “副作用”; use **受控动作** and its 意图/批准/回执 family.
- “Checkpoint / 检查点” must be qualified as **稿件修订检查点**, **运行续行检查点**, or Harness technical checkpoint; none is a **恢复快照**. **操作续行检查点** is reserved for imported legacy history.
- **Operation Record / 操作记录**, **Operation Event / 操作事件**, and `operationRuns` are legacy-read terms only. New execution truth lives in the **Harness 会话账本**, while AI7 business truth lives in the **任务账本**.
- **任务运行记录**, **Harness 会话**, **Harness 执行区段**, and an execution attempt are four different identities and need not map one-to-one.
- “Version / 版本” must be qualified as **源材料版本** or **稿件修订版**.
- “Series” uses **书系**, not the narrower **丛书**, because it also covers sequels and shared-world works.
- **文本原文基准** establishes wording, never factual truth.
- **工作流程方案** is an editorial-business definition, not an **编辑维度方案**, Harness Profile, or Harness Workflow.
- **编辑审读** is an assessment activity; **评论文章** is a public-facing deliverable. Never abbreviate both to an unqualified “Review / 评审”.
- Unqualified “Plan / 计划” previously mixed intended behavior, its human-readable view, and execution authority. Use **执行计划**, **计划预览**, or **计划权限边界** explicitly.
- **计划内调整** never includes expanded scope, provider, budget, goal, output, or Effect authority; those changes are **计划修订**.
- Installation, enablement, and activation are not one generic “启用”: use **已安装任务技能版本**, **任务技能启用状态**, and **任务技能运行激活**.
- **任务技能**, **AI7 能力**, **能力实现**, **Harness 工具**, and **Harness 技能投影** are five distinct concepts; none gains authority by being visible or loaded.
- Never use unqualified “Provider / 提供方”: distinguish **模型服务提供方**, Capability Implementation, Harness Skill Provider, credential backend, and MCP endpoint.
- **权限上限**, **能力使用许可**, **单次执行许可**, and **受控动作批准** answer four different authority questions.
- Model processing, external export, and public release cannot imply one another; **公开发布许可** remains the only public-release term.
