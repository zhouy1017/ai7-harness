---
status: accepted
---

# Align the editor-facing surfaces to the Owner's September 2026 decisions

On 2026-09-08 the Owner looked at the seven tracer surfaces and said the product still read as an engineer's console: 「我现在看到的 UI 依旧不是一个中文编辑应该看到的，它更像程序员、工程师或者运维专家的操作面。」 [ADR 0071](./0071-state-the-decision-layer-and-run-liveness-rules.md) had moved technical identities one step away and replaced English headings, but it did not change what the surfaces put in front of an editor. A design session followed on 2026-09-08 and 2026-09-09: the Fable session built clickable prototypes screen by screen, the Owner decided each screen in writing, and the decisions are quoted below verbatim. Under [ADR 0064](./0064-reweight-repository-development-toward-value-first-delivery.md) the frozen design references change only through an ADR that names the clause. This is that ADR. It records design; the per-screen handoff that turns it into renderer work is a separate document.

## Decision

### The clauses this ADR changes

- `docs/ui-ux-v2/requirements.md`: V2-UX-VIS-001, V2-UX-IA-007, V2-UX-IA-010, V2-UX-BOOK-001, V2-UX-ED-015, V2-UX-ED-020, V2-UX-ED-052, V2-UX-ANALYSIS-001, V2-UX-ANALYSIS-004, V2-UX-TASK-001, V2-UX-TASK-035, V2-UX-PDEC-012, V2-UX-EAPP-003 are revised in place; V2-UX-IA-012, IA-013, COPY-015, ED-059, ANALYSIS-025, SRC-013, TASK-044 to 046, EXP-023 are added; new sections `## Editorial marks` (V2-UX-MARK-001 to 010), `## Manuscript review` (V2-UX-REV-001 to 012), `## Manuscript evaluation and reader's report` (V2-UX-EVAL-001 to 013), `## Knowledge Base` (V2-UX-KB-001 to 005) and `## Findings center` (V2-UX-FIND-001 to 003) are added.
- `docs/ui-ux-v2/information-architecture.md`: the relationship map, `## Persistent navigation`, `## Book Work Overview`, `## Right-side manuscript navigation`, `## Coverage-aware manuscript analysis`, `## Task capture entry` and `## Proposal review surfaces` are revised; `## Editorial marks`, `## Manuscript review workspace`, `## Manuscript evaluation workspace`, `## Knowledge Base`, `## Findings center` and `## External evidence retention` are added.
- `docs/ui-ux-v2/interaction-spec.md` (`## Outline and structure adjustment`, `### Search and Jump Entry`, `## Task Intent capture`), `docs/ui-ux-v2/visual-direction.md` (reference qualities, work-surface rhythm, proposal review paragraphs) and `docs/ui-ux-v2/journeys.md` (J-04, J-05) gain the matching sentences.
- `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md` gain the presentation terms; `docs/domain/editorial/CONTEXT.md` and root `GLOSSARY.md` gain the domain objects listed in §9. `docs/ui-ux-v2/README.md` records the direction as D-089.
- `kick-in/10-editorial-dimensions.md` and `kick-in/20-deliverable-workflow-and-artifacts.md` are interview history and are not edited; §7 states where this ADR supersedes them in part.

No other clause moves. In particular ADR 0071's layering and liveness rules, the exact-disclosure requirements, the Apply boundary's separate records, Provider Processing and External Export policy, and every Journey's pinned values stand; this ADR changes what an editor sees and the order in which decisions are asked, not the records behind them.

### 1 · The manuscript is the entry

「对于中文编辑而言，点开一个稿件，最优先需要被看到的就是上次以工作的稿件本身，这个包含任务总览和治理内容的工作台实际上不应该是一个稿件的最优先入口。」

Opening a Book that has a primary Manuscript enters the Manuscript at the editor's last position, exactly as V2-UX-RET-002 already states; the Book Work Overview becomes the sidebar destination `工作概览` and is the entry only for a zero-Manuscript Book. The renderer's current route (Book route → overview → `打开稿件`) is an implementation deviation, not a design change. Returning to the last position shows one transient floating notice that disappears by itself (COPY-015).

### 2 · Navigation

「左侧应当是遵循之前的状态，保持不变，同时需要有一个toggle侧栏的按钮」「使用图标」「规范文件应当属于例如"知识库"的另一个功能下管理，我们应当存在一个中心化管理这些资料的模块」「一定要存在一个所有发现问题（混合ABC和潜在的其他检查等）的集中查看与管理的总入口」「A的排序应该往后一些……对于编辑而言不那么重要」

- The stable global layer becomes `待我处理`, `书库`, `书系`, `知识库`, `质量与学习` (IA-007). `知识库` is the centralized home of house-managed professional material: review guideline documents, evaluation profiles, expert skills (工序), House Editorial Memory and exemplars; it also houses the native-artifact/Rule management projection whose placement Issue #86 had deferred.
- The current Book's navigation is grouped `工作`（稿件 / 审阅 / 评估 / 交付物）, `处理`（发现）and `资料与记录`（分析 / 来源与证据 / 工作概览 / 历史与恢复）(IA-012). `发现` is the Book-level aggregate entry for every unresolved finding from analysis gaps, review categories, evaluation risk items and other checks (IA-013); `待我处理` keeps only cross-Book decisions.
- The sidebar remembers its collapsed state and has a toggle in the manuscript context header; collapsed rows are icons with accessible names plus the current Book's first character (IA-010).

### 3 · The manuscript surface

「应当是一次性提示，以悬浮窗模式提醒，之后自动消失」「专注模式应当保留，反而保存为里程碑版本应当是一个特殊的保存选项，这不是一个高频率操作，不需要长期显示」「任务应当对应查看本项目内正在运行的所有任务对话，派发新的全局任务。底部任务输入框不需要长时间显示，反而应当在选中文字后右键呼出」「不需要对话的应当以一个简单卡片描述任务内容和任务执行状态，并且对于完成的任务有直接跳转的功能（特别注意，这一类的全局跳转，要么采用悬浮窗口，要么要提供一键回到跳转前的操作）」「大纲与搜索应当与全稿位置合并设计一个整体导航，这样就不需要并列两个滚动条了」「右键选项应当更加丰富地设计一下，复制粘贴和其他常见文字处理是一个大类，以LLM任务为核心的如"发起任务"为一个大类，加入任务范围和稿件中搜索似乎不是需要的功能，更重要的功能是编辑手动加入高亮，或者修改批注，或者备注说明这一类真正的与某段文字强关联的编辑工作」

- One `导航` entry replaces the two persistent entries of ED-015: the outline, the search-and-jump panel and the Whole-manuscript Position Rail form one right column; the rail stays visible when the panel is closed, chapter ticks sit on one side of the track and marks on the other, and the local scrollbar appears only while scrolling (ED-059). The two navigation scales of ED-010/011 remain distinct.
- `保存为里程碑版本` moves into the save menu opened from the persistence status (ED-052); `专注` stays in the header.
- The Context-bound Task Composer is on demand: a selection's context menu offers `就这段发起任务…` with the composer anchored to the selection, and the `任务` panel offers `发起全书任务` (TASK-001, VIS-001). The panel lists this Book's tasks; a dialogue task offers `回答` and `打开对话`, a non-dialogue task is a card of content and state; a completed task's result opens in a floating window aligned to the text column with jump links, and any jump shows a persistent `回到<位置>` chip until used (TASK-044 to 046). `加入任务范围` lives inside the composer as `再选一段加入`.
- The selection menu has three groups: 文字处理 (剪切 / 复制 / 粘贴 / 粘贴为纯文本), 编辑标记 (提出修改建议 / 添加批注 / 添加备注 / 加高亮), AI7 任务 (就这段发起任务… / 就这段提问… / 常用工序). The three preset 工序 are 润色这段, 核查人名与称谓一致, 检查与前文的连贯.

### 4 · Editorial marks

「应当存在至少三种对象"修改建议""批注""备注"，其中备注……编辑自己的记录，不随稿件导出，"修改建议"是对原文的直接替代式修改，其展示方式应当是一段单独保留的高亮色，左键点击以后将文本直接替换为修改后文本供查阅，同时以悬浮窗形式弹出建议理由和接受修改，拒绝修改，修改后接受的选项……批注是单纯的可导出的说明。……AI7系统用提供的批注建议等信息也要使用这一套模式来进入稿件，也因此，这些功能都需要标注作者来源。AI7系统提供的标注中还要有跳转到对应任务/来源等原始细节信息供编辑审核的设计」「给一些系统功能性高亮固定对应颜色，另外提供3种个性化颜色给用户即可」「改为一键，接受即应用」「（导出选项）提供选项」「（AI7 批注转为修改建议）允许」「在修改建议中的"修改并接受"工序中应当提供一个记录本次修改原因的可选文本框」「编辑自己涂的高亮应该具备右键点击后取消高亮或者转为备注批注修改建议等真实使用的入口」「1. 接受并应用 2. 是，同样的右键入口」

`修改建议` is the editor-facing form of a Proposal Change Item; `批注` is an exportable comment; `备注` is an editor-private note; `高亮` is a personal mark in three colors. Each kind has a fixed system color and every mark carries its author or source (V2-UX-MARK-001 to 010). For one inline 修改建议 the single action `接受并应用` records the Proposal Decision, records the Effect Approval and dispatches the Apply in one editor interaction; the three records stay separate. Batch review keeps `记录提案决定` and `准备应用` but presents `准备应用` as one inline confirmation strip ending in `确认应用` (PDEC-012, EAPP-003). `修改后接受` carries an optional reason field that satisfies FDBK-003. Review findings and manuscript marks are one record family and stay in sync on both surfaces (MARK-010). Export offers `不含批注` and `不含修改建议` (EXP-023). Imported DOCX comments and tracked changes enter as marks with the file's author as source.

### 5 · Baseline analysis shows only what the baseline is for

「稿件分析tab的整体思路有问题，你把太多不同领域的问题混在一起处理」「A 作为稿件的基本操作（基线分析），它完成了包括切割分块和在尽可能保留准确细节的情况下提供全文梗概，章节梗概，人物，事件，关系，设定等信息，这些信息一部分是对用户可见的，如梗概类，但是具体的分割分块是不可见的」「（基线里的矛盾线索在 A 页面不显示，只喂给审阅）同意」

The Manuscript Analysis Overview shows 梗概, 各章, 人物与名称, 事件, 关系, 设定 and the four axes as four sentences in editorial Chinese (覆盖范围 / 全书综合 / 与当前稿件 / 可信程度); Analysis Units, digests and reducer stages stay in the technical layer; the baseline's conflicts and unresolved items are not shown on the overview but are the immediate, model-free leads of the review category 情节逻辑与前后一致 (ANALYSIS-001, 004, 025). The destination sits under `资料与记录`.

### 6 · Manuscript review

「包括前后矛盾之类的待处理issue，反而应当属于基于基线分析上的另一重"审阅"操作的范畴……审阅应当包含如下的大类：1. 错别字，错误符号，不规范用语，格式问题等……以配置文件为载体的参考guidlines……2. 前后矛盾，时间错乱，逻辑不合理……3. 事实性错误核查 4. 学术道德审查（抄袭，洗稿，不合规引用等）5. 中国大陆出版特殊的政策、意识形态风险 6.文学性修饰性改进……包括但不限于……除了1以外的其他项目也可能需要一些专家经验形成的文档或者类skill类辅助……可选某几项或者全部，针对某个部分或者全部进行审查，并具备分类地返回结果与报告」「（B 独立目的地）OK」「4类查重需要允许外网查询，不然没有意义」「（第 5 类只标风险点）可以」「查重主要是使用搜索引擎，这个和把文本交给LLM服务商一样，是允许的范围。为了减少用户负担，也无需在界面上显示这些信息和单独授权」「（八个类别、三级严重度、批量确认条、忽略需说明、报告结构）可以」「要注意这里的审阅结果是要同步到稿件视图的」

`审阅` is a Book-level destination with its own Review Runs, coverage matrix and Reports (V2-UX-REV-001 to 012). The baseline categories are 错别字与规范用语, 体例与格式, 情节逻辑与前后一致, 事实核查, 学术道德与引用, 出版政策与风险, 文学性与表达改进 and 跨交付物一致性; each names its basis — Review Guideline Documents from `知识库`, expert 工序, search-engine use — and its output kind. 学术道德与引用 and 出版政策与风险 mark only `需人工复核的风险点`; AI7 never states a compliance verdict, which keeps kick-in/20's exclusion of automated legal, regulatory or ideological authority. Search-engine use by a category is stated once in its description and configuration and needs no per-Run disclosure or separate authorization (REV-010); model transmission disclosure under TASK-035 and LAYER-002 is unchanged.

### 7 · Evaluation and reader's report

「撰写审稿意见与进行稿件评估……对稿件进行多个维度的评分，给出一个总评和分项评分以及评语，找出优缺点，市场定位，市场策略，以及可能的市场回报/评奖汇报的预测与评估，这个评分系统也是可以由编辑反馈……编辑可以就评分项或者总项给出简短意见，而AI7系统协助编辑来正确体现评估」「应当是总分100分，每一项要平均分配分数，按照加权后的分数显示出来」「权重不要显示给编辑，编辑只需要看到总分100基础下，每个分项的满分与得分」「默认情况下定价与首印区间不主动预测，而是冻结发稿后，提醒编辑手动输入，经过数据积累后……在设置中才允许打开」「（预测）放进v1」「v1只针对两种就可以了，营销要点可以从写作任务生成」「（校准）后台处理，在设置中留入口查看」「（审稿意见）作为一个固定的特殊任务，与审稿意见C在操作逻辑上在一起」「实际部署时会有很多过往已出版的真实审稿意见作为参考，包括未来的新闻稿和写作任务都具备这一特性」

`评估` is a Book-level destination producing a versioned Evaluation Record (V2-UX-EVAL-001 to 013): a 100-point total split over the scored items by the house Evaluation Profile with the editor seeing only each item's 满分 and 得分; risk items outside the total that cap the conclusion; a readiness list; AI7's score and the editor's score side by side with the record keeping the editor's; a conclusion the editor chooses; a market section with a labeled low-certainty prediction block in V1; pricing and first-print actuals entered after a Publication Version is designated with prediction enableable only after enough actuals; background calibration disclosed under Settings; version-to-version comparison; and 审稿意见 as a fixed special task with two V1 templates whose drafts are Editorial Artifacts seeded with house exemplars.

This supersedes in part two interview records: kick-in/10's statement that the dimension catalog is "not a universal numerical scoring rubric" still holds for the catalog, while an evaluation task may score a house-configured subset of dimensions; kick-in/20's deferral of "awards" automation from V1 core no longer applies to the labeled prediction block, which is a prediction presented as such and never a claim or an external action.

### 8 · External evidence retention

「涉及外部来源的资料都要本地化保存原文和链接，并标识对应句子，然后非中文材料还要进行翻译。这个是后端和界面都要有的，这一部分的业务逻辑按照我的思路属于内置的profile/skill配置的一种」

A built-in 工序 (External Evidence Retention Procedure) used by 事实核查, 学术道德与引用, 出版政策与风险 and the evaluation's market section retains every external source it uses as a Book-owned Source Version — full text snapshot, link, acquisition time and route — within the authorizing Task, creates sentence-level Evidence Links between the manuscript sentence and the source passage, and produces a 来源译文 for a non-Chinese source that is shown beside and never replaces the original (SRC-013). SRC-001's explicit-retention rule now governs editor-initiated retention only. The Factual Verification Policy Document keeps deciding what counts as evidence; this 工序 decides how evidence is fetched, stored, aligned and translated.

### 9 · Terms

Presentation terms added to the UI/UX context: Editorial Mark, Change Suggestion, Annotation, Editor Note, Personal Highlight, Mark Card, Return Chip, Task Panel, Unified Manuscript Navigation, Review Workspace, Evaluation Workspace, Findings Center. Domain objects added to the editorial context: Annotation, Editor Note, Personal Highlight, Review Run, Review Guideline Document, Finding Disposition, Evaluation Record, Evaluation Profile, Reader's Report, Report, Knowledge Base, Exemplar, Source Translation, Evidence Sentence Link, Pricing and First-print Actuals, External Evidence Retention Procedure. `修改建议` is the editor-facing label of a Proposal Change Item; `提案` remains the record term.

## Consequences

- The seven executable Journeys keep their pinned records; what changes is the surface they assert, so each per-surface unit that applies this ADR re-pins its Decision Layer readings under ADR 0071's rule.
- The renderer's Book route enters the manuscript; the Book Work Overview, the analysis card and the authorization card become destinations or sub-surfaces rather than the first screen.
- New projections are needed for marks, review runs, evaluation records, the findings aggregate, knowledge-base items, source translations and sentence-level evidence links; the per-screen handoff names each field and its source.
- Thresholds named here (30 books with actuals before prediction can be enabled; 10 calibrations before the house offset applies) are defaults derived from one session; changing them changes EVAL-010 or EVAL-011 through an ADR, not a constant in code.
- Search-engine retrieval by review categories and evaluation is product behavior authorized by the Owner for the product; it changes nothing about development-time Provider testing, which stays under ADR 0065 and ADR 0067.

## Rejected alternatives

- **Keep the Book Work Overview as the entry and add a quick "open manuscript" link.** Rejected: the Owner's complaint was the entry itself, and RET-002 already said the manuscript is where an editor returns.
- **Keep the two-step `采纳` then `批准并应用到稿件` for single inline suggestions.** Rejected by the Owner; the three records the two steps produce still exist, initiated by one interaction.
- **Show baseline conflicts on the analysis overview as leads.** Rejected: the Owner separated analysis (what the manuscript contains) from review (what needs judgment); showing leads in both places recreates the mixed surface this ADR removes.
- **Disclose each search-engine query before a review Run.** Rejected by the Owner as burden without decision value; the category description states it once.
- **Fold `知识库` into `质量与学习` or Settings.** Rejected: guidelines, profiles, skills and exemplars are working material a house curates, not learning history or preferences.

This decision governs presentation, the objects an editor works with and the order in which decisions are asked. It changes no Provider policy, no export policy, no Effect or Apply record structure, no Journey pin, and it authorizes no implementation, dependency, Provider call or release by itself.
