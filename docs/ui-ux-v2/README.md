# AI7 V2 UI/UX design session

Status: **61-question base and Issue #5 9-question feature delta complete; candidate design only; no implementation authority**

This directory records owner decisions from the independent AI7 V2 UI/UX interview. It defines product presentation and interaction only; it does not authorize product code, prototypes, Figma work, dependency installation, testing, review, publishing, or external action.

## Authority and reference

- The V2 architecture input is exact Git object `247b7dacb267ba2f4076ca8461c95e5f0508b343`. It governs product authority, runtime boundaries, state meaning, and the Codex Interaction Model Reference.
- The V1 freeze input is exact Git object `587d6455f6a578d3df8a39f534ec7a057c07a18c`. It contributes requirement semantics, state distinctions, fourteen journey hypotheses, and design assumptions only.
- The owner-provided Codex Desktop screenshot dated 2026-08-24 is visual and interaction reference evidence. It is not an asset, layout specification, component implementation, or permission to copy Codex identity.

## Accepted direction

### D-001 — Codex-referential desktop presentation

The owner wants AI7's overall visual presentation and interaction manner to feel similar to Codex Desktop. AI7 will therefore develop an AI7-owned desktop interaction language from the reference's calm light shell, restrained chrome, progressive disclosure, persistent context, focused central work surface, contextual side surfaces, compact task entry, and visible interruptible work.

Similarity is experiential, not literal copying. AI7 does not copy Codex branding, text, assets, source, exact geometry, coding objects, generic terminal/chat hierarchy, or product authority. Books, Editorial Deliverables, manuscripts, workflows, tasks, evidence, proposals, named decisions, Effects, and receipts remain the organizing product concepts.

This direction resolves the previously planned general visual-direction question early.

### D-002 — Book-anchored workbench

The shell is organized as **Book anchor → active Editorial Deliverable or manuscript work surface → contextual Task layer**. A Book supplies the stable editorial context; the center presents one current work object; Tasks attach to the exact Book, deliverable, manuscript revision or selection, and intended outcome rather than becoming peer conversations.

Cross-Book Runs, Clarification Requests, pending decisions, failures, and completed outcomes may appear in a Global Attention View. That view is a navigation projection only: opening an item returns to its authoritative Book and record.

### D-003 — Continuity-first return

Startup and restart prioritize editorial continuity. A recovery state requiring confirmation opens its exact Book and recovery explanation first without silently overwriting text; otherwise AI7 returns to the last active Book, Active Work Object, and whole-manuscript position. Global attention never steals focus merely because background work changed state. When no Book exists, AI7 opens Book creation/import.

### D-004 — Two-level contextual sidebar

AI7 uses one persistent, collapsible left sidebar with two contextual levels. Stable global destinations occupy the upper area; pinned and recent Books plus the current Book's contextual navigation occupy the Book area. The complete Book collection remains searchable through the library instead of expanding into a filesystem-like tree, and Settings remains in the bottom application/account area.

### D-005 — Manuscript-anchored Book overview

Within a Book, the Manuscript is the dominant visual and continuation anchor. Promotion Article, News Report, and Review Article remain independent Editorial Deliverables with their own Workflow Instances and appear as secondary work cards. Workflow, Tasks, Evidence, Proposals, Series context, sources, and recovery remain contextual Book- or deliverable-owned entry points rather than peer product roots. AI7 shows no single Book progress percentage.

### D-006 — Action-first Global Attention

Global Attention groups work as `异常与结果待确认`, `等待你的决定`, `运行中与已暂停`, and `最近完成`, in that order. Every decision item retains its exact named authority instead of becoming generic approval. The sidebar badge counts only unresolved items requiring editor action in the first two groups; routine running and completed work never inflate it.

### D-007 — Manuscript-dominant work-surface modes

The editing shell supports four explicit presentation modes: normal manuscript editing, contextual collaboration in the supporting side surface, a temporary dedicated workspace for comparison or evidence-intensive work, and a distraction-reduced focus mode. The Manuscript remains the normal central object; Run activity or completion never changes modes automatically, and presentation-mode changes carry no business authority.

### D-008 — Continuous manuscript with dual-scale navigation

Editors experience one continuous Manuscript rather than technical windows or Manuscript Blocks. Fine reading scroll operates around the current bounded window, while a distinct whole-manuscript position system exposes the current structural location and coarse global position. Crossing window boundaries remains visually continuous; distant indexed jumps load the target neighborhood with a short business-readable state and preserve exact cursor, selection, and Chinese IME behavior.

### D-009 — Navigation-first outline with explicit structure adjustment

The virtualized hierarchical outline is normally a navigator in the right contextual navigation. A separate Whole-manuscript Position Rail provides sparse global markers. Reordering, level changes, or other structural edits require an explicit Structure Adjustment Mode with affected-range disclosure and durable undo; model-suggested structural changes remain Proposals. The right navigation also contains a persistent `搜索与跳转` entry, whose detailed search behavior is decided separately.

### D-010 — Manuscript-scoped Search and Jump

The right-side Search and Jump Panel is local and restricted to the current Manuscript and active revision context. It provides `文字`, `标题`, and `位置` modes: whole-manuscript text search with optional current-chapter/current-selection narrowing, tolerant heading lookup, and structural/proportional/revision-character positioning. Results remain revision- and range-bound, preserve a return position, and become visibly stale rather than silently retargeting after edits.

### D-011 — Previewed atomic manuscript replacement

Single-hit replacement behaves as a normal exact revalidated edit. Selected/all replacement freezes an explicit match set after preview, executes off the renderer, may be cancelled before its atomic commit boundary, and applies all or none after exact revalidation. Success writes one durable undoable Edit Journal transaction and an accurate completion summary, never a Manuscript Checkpoint; cancellation after commit is presented as undo, not reversal of history.

### D-012 — Explicit multi-range manuscript anchoring

Ordinary text selection remains ephemeral. An editor explicitly pins one or more exact manuscript ranges for a Task or other record; each range carries exact Book, branch, revision, stable block, Unicode range, and digest context. Unaffected ranges may re-resolve exactly across later edits, while changed or structurally ambiguous ranges become visibly drifted and require review, reselection, or removal rather than fuzzy retargeting.

### D-013 — Journal-first persistence with explicit checkpoints

Editing persists continuously to the Edit Journal. `Ctrl+S` and `保存` request immediate journal durability and report success only after service acknowledgement; they never create a Manuscript Checkpoint. The user-facing meaningful action is `保存为里程碑版本`: for a Manuscript it validates current journal state into an immutable Manuscript Revision and adds the explicit milestone label/purpose without clearing durable undo/redo. Persistence status distinguishes journal state, latest milestone relation, and failure, while Recovery Snapshots remain recovery-only records.

### D-014 — Staged fidelity-reviewed manuscript import

Manuscript import is a local staged flow: file selection, local preflight, content-class fidelity review, then atomic commit. Inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and round-trip behavior are classified as `完整保留`, `降级导入`, or `不支持导入`. Material degradation requires explicit unselected acceptance; critical rejection blocks editable import. Reimport compares staged structure with current manuscript state and never silently remaps ambiguity or overwrites the active Manuscript.

### D-015 — Context-bound Task Intent drafting

The Codex-referential bottom composer prepares a durable Task Intent Draft rather than sending a model message. It visibly inherits only the exact Book, work object, branch/revision, and explicitly pinned ranges selected by the editor. `准备任务` expands the right Task surface for further definition without creating a Run or model transmission. Drafts remain bound to their original context across Book switching and never follow silently.

### D-016 — Natural-language-first Task Skill resolution

Task drafting begins with natural-language editorial intent. AI7 presents one transparent contextual Task Skill recommendation or, where genuinely ambiguous, two or three unselected candidates. Required structured fields appear progressively; the original goal stays editable. Skill recommendation/selection grants no activation, capability, provider, Run, or Effect authority, and a changed goal never silently swaps the selected skill. No unmatched intent falls back to unbounded generic chat.

### D-017 — User-approved default execution rules

After developing confidence in a repeatable task pattern, a user may approve a versioned Default Execution Rule. A future user-initiated Task that matches the exact Task Skill/version and rule envelope and passes deterministic preflight receives its own exact Task Intent, Execution Plan, Plan Envelope, and per-Run Run Authorization and starts without separate Task Intent review. Rule applicability and per-Run source scope remain separate; mismatch or drift falls back to standard preparation. Rules are inspectable, revocable, and never grant factual authority, Proposal Decision, Review Decision, Effect Approval, Signoff Record, Public Release Permission, or automatic Apply. See [ADR 0001](./adr/0001-user-approved-default-execution-rules.md).

### D-018 — Three-layer Task data boundary

Task preparation keeps `要处理什么`, `允许参考什么`, and `哪些内容可能发送给模型` visibly separate. Task Skills may propose the minimum required exact source set, but Series, Cross-project, or House-memory expansion is explicit and uses product records rather than filesystem paths. Read access never grants mutation or provider transmission. Run Authorization freezes exact source versions, and Default Execution Rules cannot widen the approved source/outbound envelope.

### D-019 — Six-part bounded Plan Preview

Standard preparation presents one concise editorial Plan Preview with goal/outcome, target/sources, three-to-seven business steps, expected editor-participation points, provider/budget, and possible results/Effects plus important negative guarantees. A two-column boundary distinguishes in-envelope Plan Adaptations from changes requiring suspension, Plan Revision, and renewed Run Authorization. Exact machine detail is expandable, the preview is explicitly not authorization, and the same frozen version remains available for Default-executed Runs.

### D-020 — Inline one-click Run Authorization

The standard path ends with an inline sticky authorization bar inside Plan Preview, not a generic approval modal. One current valid `授权并开始任务` action creates the exact Run Authorization and Run Record and hands the Run to scheduling; it then shows queued or running state with pause/cancel. Drift replaces the action with `查看计划修订`. The bar states that authorization covers this Run only and grants no proposal, Effect, signoff, or public-release decision.

### D-021 — Role-and-capability-first model controls

The primary Task surface gives editors only compact controls for Model Role and user-understandable model capability requirements. Exact provider/model binding, credential readiness, outbound categories, fallback, estimate and budget remain available but occupy one compact non-silent disclosure row; detailed controls live in secondary Task detail and tertiary Settings/Usage surfaces. Blocking changes surface inline. Model capability never implies factual authority.

### D-022 — Layered editorial Run activity

Running work uses a compact business-state header in the right Task surface and an expandable Editorial Milestone Timeline. AI7 shows numeric progress only when a real, stable denominator exists; otherwise it shows the current editorial phase, current object, last meaningful milestone, and any exact wait reason. Only usable candidate content or structured partial results may stream into the interface, always marked non-authoritative; raw model reasoning, Harness events, tool traces, and subagent mechanics remain excluded. Run activity never displaces the Manuscript automatically, and a Dedicated Work Workspace opens only by explicit editor action.

### D-023 — Book-grouped concurrent Run presentation

Concurrent Runs remain grouped by their authoritative Book and work object instead of becoming a global thread list. Global Attention provides a compact Book-grouped projection, while the current Book exposes a small Run switcher with only one foreground activity surface at a time. Switching the foreground projection neither pauses background work nor loses per-Run activity position. Routine background changes stay quiet; only clarification, failure, or a result requiring named editor action enters actionable attention. Capacity waits use exact queue language and never invent an unstable position or time estimate.

### D-024 — Cooperative pause and terminal cancellation

Pause is a one-click cooperative request that first shows `正在暂停`, reaches a safe boundary, durably captures continuation state, and then shows `已暂停`; it preserves authorization, candidates, evidence, and committed Effects. Cancellation is a separately confirmed terminal request that stops future work as safely as possible and preserves all prior records. A cancelled Run cannot resume. Neither action claims to reverse an Effect already committed, and an ambiguous external outcome moves to `结果待确认` rather than being flattened into successful cancellation. Controls are per Run; no default global bulk action is exposed.

### D-025 — Context-bound, choice-first clarification

A Clarification Request appears as a durable card bound to its exact Book, target, Run, and causal context rather than as generic chat. The card states the question, reason, blocked scope, and consequence of answering. Where sensible, clarification and other bounded user-input requests present concise selectable choice cards, visibly mark one recommendation without preselecting it, and always retain a free-input path. Only dependent work pauses; independent in-envelope work may continue with explicit disclosure. An answer inside the current envelope may continue the Run, while a material boundary change creates Plan Revision and renewed authorization rather than treating the answer as authority.

### D-026 — Append-only Run Rewind

AI7 distinguishes the accepted execution continuations: Resume continues the same unchanged Run; Retry creates a linked safe attempt inside that Run; Redo creates a newly authorized Run; Replay performs no execution. `回退并调整方向` adds an editor-facing workflow over those semantics: the editor selects an eligible earlier business milestone, reviews retained and non-reversible consequences, and gives a new direction. An in-envelope Rewind creates a linked attempt branch inside the same Run; later work remains visible as superseded rather than being erased. Material direction change routes through Plan Revision and Redo. No continuation action reverses a committed Effect or treats historical authority as current. See [ADR 0002](./adr/0002-append-only-run-rewind.md).

### D-027 — Quiet, privacy-safe notification hierarchy

Routine progress remains inline, and ordinary foreground completion receives only a quiet transient notice plus durable `最近完成` history. Clarification, failure, ambiguous outcomes, and named decision-ready records create persistent actionable in-app attention. Windows notifications are reserved for backgrounded action-required or abnormal states by default; ordinary completion is configurable. System notifications reveal no Book title, manuscript/source text, claim, or candidate content and make no sound unless the editor explicitly changes those settings. Events coalesce by Book, deep-link to the exact record, and use outcome-accurate language rather than equating model or Harness completion with business completion.

### D-028 — Contextual, bounded Proposal review

Small single-range manuscript Proposals are reviewed inline beside their exact text context. Large, structural, cross-chapter, or multi-range Proposals open an explicit Dedicated Work Workspace with a virtualized change navigator and bounded comparison surface. Chinese prose defaults to inline differences, while structurally complex changes may use side-by-side comparison. Rationale, source, and evidence detail is progressive and keeps Reference Integrity, Claim Support, and Factual Verification distinct. Every view exposes the exact base Manuscript Revision and marks drift immediately without fuzzy retargeting. Review position persists, and inspecting or selecting a Proposal never applies it.

### D-029 — Exact three-way conflicts with Diff-Merge quick actions

A stale Proposal base is classified exactly as unchanged target, safe non-interaction, or real conflict. Real conflicts compare pinned base, current authoritative text, and proposed text. Editors build a Resolution Draft through choice-first actions and Diff-Merge quick operations such as taking current, taking proposed, keeping both in an explicit order, editing the result, and moving to the next conflict. Quick operations are reversible, keyboard-operable, and construct a new Proposal version; they never directly mutate the Manuscript. Structural ambiguity, deletion, and interacting ranges require explicit resolution and never fuzzy retarget. Original proposals and conflict history remain immutable.

### D-030 — Drafted, explicit Proposal Decision

Per-change `拟采纳`, `拟拒绝`, and `暂不决定` choices first accumulate in a reversible Proposal Decision Draft with fast next-item, keyboard, filtered, and exact non-conflicting batch operations. Nothing is preselected, and conflicts remain excluded. One explicit `记录提案决定` action presents and commits the exact Proposal version, scope, disposition counts, unresolved items, and base state as an immutable Proposal Decision. Optional choice-first reasons are collected non-blockingly. Acceptance means only that selected Proposal content may enter later Apply preparation; it proves neither factual correctness nor manuscript mutation.

### D-031 — Exact, atomic Apply preparation

`准备应用` opens a local Apply Preparation surface and never edits the Manuscript. It derives a default set from accepted, exact, conflict-free Proposal changes while allowing explicit exclusions, then shows target Book/branch/current revision, Proposal/decision identity, included and excluded ranges, bounded resulting-text preview, and expected new revision. Exact current-state and structural revalidation blocks drift or conflict. The final Apply Change Set freezes one stable Effect identity, target, payload, atomic scope, and replay policy. Preparation and scope editing grant no Effect Approval; excluded accepted changes remain `已采纳 · 尚未应用`.

### D-032 — One-step exact Apply approval and dispatch

A current frozen Apply Preparation ends in one sticky inline approval bar, not a duplicate modal. `批准并应用到稿件` creates the exact Effect Approval and immediately dispatches the bound Effect as two distinct records in one deliberate interaction. The action is idempotent, becomes `正在应用`, survives navigation, and never derives from Run Authorization, Default Execution Rule, or Proposal Decision. Any target, payload, decision, manuscript, or policy drift removes the action and requires preparation again. No applied-success language appears until a verified Effect Receipt exists.

### D-033 — Durable Apply receipt and reversal by new Effect

Every dispatched manuscript Apply resolves to a durable compact receipt/outcome card with exact `已应用`, `未应用`, `正在确认应用结果`, or `结果待确认` state. Verified commit binds Effect identity, actor/time, old and new Manuscript Revisions, atomic change count, and Proposal Decision; confirmed non-commit explains why the Manuscript is unchanged. Recovery queries local authority by Effect identity and never re-dispatches. Unresolved outcomes block repetition. A committed Apply can be reversed only through a separately prepared and approved Reverse Apply Effect against current authority; the original Effect Receipt remains immutable. See [ADR 0003](./adr/0003-reverse-committed-apply-with-a-new-effect.md).

### D-034 — Revision-bound, low-noise factual-verification overview

Editors may start factual verification from an exact selection, current chapter, or whole Manuscript Task. Findings bind one Manuscript Assertion to an exact revision/range and appear as restrained margin markers plus a virtualized right-side fact-check lens, not dense full-text decoration. The surface separately reports Reference Integrity, Claim Support, and Factual Verification; supported, suspected error, insufficient/conflicting evidence, unverifiable, and pending remain explicit sub-states rather than model confidence. Marker density favors selected, high-risk, and action-required findings. Drift invalidates the affected anchor. Model knowledge is never evidence, and suspected errors route to Correction Proposal rather than direct rewriting.

### D-035 — Assertion-centered evidence comparison with deferred assurance choice

One Manuscript Assertion opens an evidence workspace with exact assertion/revision/policy context, source cards, a pinnable comparison matrix, source-lineage grouping, conflicting evidence, and an explicitly non-evidentiary AI7 summary. A source candidate may appear before every assurance check completes, but candidate snippets and fully checked exact evidence must never look equivalent. Exact Fetch remains required before a quotation is certified, model summaries remain non-evidence, source derivation stays visible, and conflicts cannot be silently collapsed. The owner requested fewer blocking checks for speed; Question 35/60 now determines which assurance work is lazy/background and which remains mandatory before a factual determination.

### D-036 — Tiered progressive evidence assurance

Evidence work uses `快速整理`, default `标准核查`, and `严格核查` levels. Quick mode prioritizes candidates and permits pending findings or evidence-incomplete Correction Proposal drafts but cannot record supported/contradicted formal verification. Standard mode renders progressively, checks selected/high-relevance sources in background, and blocks only on the active policy's minimum gate before determination. Strict mode completes full selected-evidence authority, freshness, integrity, lineage, Exact Fetch, and conflict checks for high-risk or policy-required work. No level turns model knowledge into evidence, certifies a quotation without Exact Fetch, hides conflict, or undercuts a Policy Document minimum. Raising the level reuses prior work. See [ADR 0004](./adr/0004-use-tiered-progressive-evidence-assurance.md).

### D-037 — Compact separation of verification result and Review Decision

AI7 first records a versioned evidence-backed factual-verification result bound to assertion, evidence snapshot, assurance level, policy, and three-dimensional status. The same workspace then presents an unselected choice-first review card for `接受当前核查结论`, `要求补充证据`, `维持未决`, `不采纳该核查判断`, or free input. `记录核查审阅决定` creates a distinct Review Decision bound to that result version without a duplicate page or generic approval. Later evidence/result versions never rewrite prior decisions. Review determines the editorial next route—supplementary Task, close attention, or prepare Correction Proposal—but creates no manuscript mutation or downstream authority.

### D-038 — Minimal, option-first Correction Proposal drafting

`准备更正提案` creates a draft bound to the exact Editorial Error Finding, Review Decision, current manuscript target/revision, selected evidence state, and policy version. Where meaningful alternatives exist, AI7 offers two or three unselected correction variants plus free editing; one clear minimal correction remains one recommendation. Every variant exposes resulting text, evidence, limitations, and affected scope. The default scope is only what resolves the finding; style/structure extras cannot ride along silently. Repeated facts use explicit separately excludable exact ranges, and citation/reference/body corrections remain typed. Evidence-incomplete and target-drift states persist. `保存为更正提案` creates a versioned Correction Proposal and no acceptance or Apply.

### D-039 — Deliverable-owned, action-first nonlinear Workflow

Each Editorial Deliverable exposes one contextual Workflow lens with its pinned Workflow Profile/version and seven Chinese-first shared phases: `接收与准备`, `来源建设`, `起草`, `审阅与核查`, `定稿`, `交付`, and `维护`. Phases may overlap, block, complete, reopen, or be skipped with an explicit reason; no linear stepper or scalar progress percentage misrepresents them. The default summary is `下一项需要处理`, linking exact Gates and named decisions. Phase detail projects related Tasks, Evidence, Proposals, Findings, Gates, Signoff, and Delivery records. Only deterministic AI7 commands change Workflow state; Run success does not. Profile migration is separate and explicit, and Workflow state proves no factual truth, Signoff, delivery, or release.

### D-040 — Separate Gate readiness and deterministic Gate disposition

Each Workflow Gate card shows exact Deliverable/phase/profile context, mandatory and advisory criteria, evidence, missing/abnormal items, and downstream consequences. Computed Gate Readiness remains separate from unselected editor choices to pass, return for work, conditionally pass, defer, or write another response. Mandatory failures block passage; conditional passage exists only where the pinned profile permits and retains exact outstanding conditions. `记录关口决定` invokes a deterministic business command and may create a separate Review Decision where required, but the two records stay visible. Gate history is immutable, no bulk pass exists, and passage implies no Signoff, delivery, release, or factual authority.

### D-041 — User-facing Milestone Version instead of Signoff workflow

The target People's Literature Publishing House workflow exposes no `Signoff` or `签发` step. Editors use `保存为里程碑版本`, provide a version label and stated purpose, and receive one immutable exact Deliverable/Manuscript version. If current manuscript working state is not yet a revision, the action first creates a Manuscript Checkpoint; it then records milestone metadata and a separate internal Signoff Record asserting readiness only for that stated next use. The internal term remains absent from ordinary UI. Multiple milestones may coexist, later edits show `自「{标签}」后有修改`, and no milestone implies Delivery, export, factual truth, or Public Release Permission. See [ADR 0005](./adr/0005-project-signoff-as-a-user-facing-milestone-version.md).

### D-042 — Milestone-bound local Delivery Package preparation

`准备交付` opens a local package-preparation surface centered on one explicitly selected exact Milestone Version; AI7 may recommend but never silently chooses the latest delivery candidate. The editor sees post-milestone edits, package purpose, included files/formats/artifacts, version/source/factual materials, unresolved limitations, explicit exclusions, and export-fidelity summary. Profile-required gaps link to exact work. `准备交付包` creates a locally staged immutable package version with stable Package ID and manifest; changing milestone, content, format, attachment, or purpose creates a new package version. One package serves one stated local-export purpose and sends nothing externally or publicly.

### D-043 — Purpose-specific DOCX, Markdown, and PDF representations

DOCX is the ordinary editor's primary editable import/export and professional exchange format. Markdown is a revision-pinned internal Agent Exchange Projection and an explicitly selected fallback export, not manuscript storage or text authority; an agent may read that projection, while agent-authored changes return as an exact-revision Proposal rather than overwriting a Markdown file or Manuscript Revision. PDF is an optional fixed-layout export with no editable round-trip promise. Export Fidelity Review discloses preserved, degraded, and unavailable content classes per chosen format before exact local export approval. Every committed local export is atomic and receipted, and no format choice grants delivery or Public Release authority. See [ADR 0006](./adr/0006-use-purpose-specific-document-representations.md).

### D-044 — V1 ends at local export

AI7 V1 provides local export only. It does not send files through email, cloud drives, publishing-house OA, or any other external channel, and it does not add `记录已交接`, `确认送达`, recipient tracking, or manually asserted delivery states. A successful Local Export Receipt proves only that the exact files were atomically published to the user-selected Windows location. The UI stops at `已导出到所选位置`; it never infers `已发送`, `已交付`, or `已确认送达`. External-channel delivery may be designed in a later release without changing the V1 local-export record.

### D-045 — User-facing Publication Version instead of public-release permission workflow

Ordinary local export has no public-release interaction. When an editor explicitly identifies one exact immutable version for publication use, AI7 presents `设为发稿版本` and `发稿版本`, not `公开发布候选` or a generic Public Release Permission screen. The interaction creates a user-facing Publication Version designation and a separate internally authoritative Public Release Permission bound to that exact version, identified publication scope/public channel, actor, time, and basis. Later material edits do not inherit it. `发稿版本` means only that this exact version may be used for that stated publication route; AI7 V1 neither sends nor publishes it, and export still ends at its local receipt. See [ADR 0007](./adr/0007-use-publication-version-as-public-release-permission-projection.md).

### D-046 — Book-bound recovery comparison and descendant restoration

When recoverable manuscript data exists, AI7 opens a Book-bound Recovery Workspace rather than a global blocking system modal or ordinary recent work. It compares the most recent durable Recovered Working State, relevant Milestone Version/Manuscript Checkpoint, and any applicable independently verified Recovery Snapshot without presenting any as already restored. The recommended action is `恢复为新版本`: restoration creates a new descendant and preserves every prior state. `仅查看`, `稍后处理`, and safe export/copy remain available; choosing older material never silently deletes newer journal state. Deferral keeps the affected manuscript read-only for ordinary editing while other Books remain usable. After restoration, `当前为恢复的工作状态` persists until the editor reviews it and saves a new Milestone Version. Multiple affected Books remain separate Global Attention items.

### D-047 — Bounded Editing Protection Mode on local durability interruption

When Edit Journal acknowledgement or the local AI7 service becomes temporarily unavailable, the affected manuscript enters Editing Protection Mode rather than immediately discarding input or permitting open-ended unsafe editing. Chinese IME and typing may continue briefly into a strictly bounded process-local safety buffer. Persistent status shows `本地写入中断`, the Last Durable Edit Boundary, and the known At-risk Edit Extent; no saved wording appears. Unsafe navigation, close, branch change, Apply, bulk replacement, and other graph-changing work are blocked. Successful service acknowledgement drains the buffer through deterministic commands and returns to normal. Approaching the buffer limit switches to Protective Read-only State with retry and safe copy/export actions. Provider or network unavailability alone never triggers this mode.

### D-048 — Explicitly authorized deferred start after connectivity returns

Local editing and local-only operations remain fully available without a provider or network while their authoritative local service state is healthy. An editor may prepare a Task offline and choose either `仅保存任务草稿` or the explicit `授权并在联网后开始`. The latter creates an exact Run Record and Run Authorization in Connectivity Wait State; it is not yet model activity. When connectivity/service returns, AI7 performs Reconnect Preflight and auto-starts only when the plan, source pins, provider/fallback binding, outbound category, budget, Credential Reference, and governing constraints remain materially unchanged and live credential/service readiness is valid. Material boundary drift routes to Plan Revision and renewed authorization; a connection or credential-readiness blocker alone preserves the exact authorization and routes to remediation without silent fallback. The user may cancel while waiting, no unselected draft starts merely because connectivity returns, and network return never launches a closed AI7 application/service. See [ADR 0008](./adr/0008-authorize-exact-runs-for-deferred-connectivity-start.md).

### D-049 — One quiet contextual feedback prompt, with history kept global

After an exact Proposal Decision, Review Decision, or clear Task Outcome, AI7 may actively offer at most one compact Contextual Feedback Prompt beside that originating record. The prompt is optional, choice-first, immediately dismissible, and never blocks the next editorial action. An existing accept/edit/reject decision or version difference is already a Quality Signal, so the prompt asks why rather than adding a duplicate score; a Task Outcome may use one equivalent outcome-specific reason set, never a separate rating survey. It offers two or three unselected contextual alternatives plus `其他 / 自行输入`. Any generated suggestion is explicitly labeled `AI7 的猜测`, and AI7 records whether the editor accepted, corrected, replaced, or ignored it. Dismissal means only that no reason was supplied: it creates no satisfaction judgment, Learning Eligibility Decision, memory activation, factual conclusion, or other authority. The prompt never repeats, produces an attention badge, or enters Global Attention. `质量与学习` keeps Feedback History and real governed learning decisions without turning ordinary work into a feedback inbox.

### D-050 — Quiet Learning Material candidates with explicit Book-first eligibility

Identifying feedback, an edit difference, or another exact item as candidate Learning Material does not append another question to the originating feedback flow. A real unresolved eligibility decision appears as a Book-grouped `学习准入待处理` item and opens one Learning Material Review Card showing a bounded excerpt/item, provenance, originating Book/Task/decision, why it is a candidate, and how later editorial assistance could be influenced. All choices start unselected. AI7 recommends `仅纳入当前 Book`; `纳入当前书系` and `纳入出版社经验` are separate explicit scope choices with the exact wider consequence disclosed inline. `明确排除`, `稍后决定`, and optional free explanation remain equally available. Inclusion creates only an exact Learning Eligibility Decision for the displayed material and scope. It does not approve or activate memory, widen Run Source Scope, establish factual correctness, train a Foundation Model, or grant any Effect/publication authority. See [ADR 0009](./adr/0009-use-explicit-book-first-learning-eligibility.md).

### D-051 — Object-centered bidirectional Learning Audit and layered remediation

`质量与学习 > 学习回溯` opens with a searchable, filterable, Book-grouped list rather than a technical event log or an always-expanded relationship graph. Opening one object shows a compact bidirectional Learning Lineage Explorer from exact Learning Material through eligibility, signals, candidates and activated memory to the Tasks that used it. From a result, `为什么会影响这个结果` traces backward; from a material or memory item, `后来影响了什么` traces forward. Ordinary nodes expose editor-readable source, scope, state and consequence, while immutable identities, governing-version references and technical detail remain under `审计详情`; no hidden Policy/Composition editor appears. Before `停止今后使用`, a Learning Remediation Impact Preview separates future use, running work and completed history. Future influence stops or re-evaluates, affected running work pauses for revalidation, and completed outputs remain immutable but gain a historical-impact marker. Re-inclusion appends a new decision/evaluation. Batch remediation is available only for one explicitly summarized common scope and disposition and never silently expands to Series or House.

### D-052 — Local-first launch with on-demand Model Service setup

First launch never requires a Provider connection, credential or budget setup before the editor can create/import a Book and use every healthy local-only capability. The first Task that actually requires a model performs normal preflight; if service setup is missing, a compact Model Connection Blocker Card appears in Task context, names the blocked Model Role and missing connection state, and links to `设置 > 模型服务`. Returning from setup restores the exact Task draft, target/source context, Plan Preview state and focus rather than starting over or authorizing execution. Model Service Settings are organized first by the four Model Roles and their readiness; Provider connection, exact model, fallback and credential management remain secondary. A credential entry is never redisplayed or copied: it may only be replaced or removed. Budget defaults remain secondary settings, while reliable estimate/range and hard ceiling still appear before each Run Authorization. Historical and aggregate consumption belongs to `用量`, not permanent workbench chrome.

### D-053 — Settings-centered channel/data location with exception-led notices

Normal portable/installer and Product Data Location state stays in `设置 > 数据与存储` rather than permanent navigation or editor chrome. The Data and Storage Summary shows `运行方式：便携版 / 安装版`, the actual user-readable data location, local footprint, `查看数据位置`, and the statement that Model Service credentials are protected separately by Windows and never travel with the portable folder. A writable portable folder uses its own separated program/data areas; the installer normally uses `%LOCALAPPDATA%\AI7`. If a portable location is unwritable, AI7 falls back to the supported local location, reports the actual location once, and keeps the state reviewable in Settings rather than continuing to claim complete portability. A known sync/backup root produces a clear non-blocking unpublished-material warning. A prohibited development/repository location routes to supported-location guidance without asking an editor to judge technical risk. V1 has no arbitrary Agent Data Root picker; viewing a location changes no storage, source scope or agent permission.

### D-054 — Windows-first limited shortcut remapping with discoverable action entries

AI7 preserves familiar Windows editing commands and makes only navigation, search and view commands eligible for Limited Shortcut Remapping with conflict detection and reset. Text editing, OS-reserved and IME-reserved behavior is not remappable. Run Authorization, Proposal/Review Decision, Effect Approval, `设为发稿版本` and destructive actions have no global shortcut; where a focused exact surface supports a modified shortcut, its named action and consequence remain visible there. IME-safe Command Guard prevents AI7 commands from intercepting keys during active composition. Every supported action has a pointer- and keyboard-reachable Discoverable Action Entry, but this does not require permanent always-on chrome: secondary or infrequent actions may live in a clearly labeled disclosure, overflow menu or second-level menu. No action exists only as a shortcut, hover affordance, unlabeled icon or hidden gesture. A currently required authority/safety action and its exact consequence cannot be demoted from its accepted contextual bar merely to save space.

### D-055 — Layered workbench density, adjustable reading typography and flexible work surfaces

Workbench chrome and manuscript reading are configured independently. Workspace Density Mode offers `标准` (default) and `紧凑`; compact mode may reduce navigation, table, queue and metadata spacing but never compresses manuscript prose, decision consequences, error text or usable target size into unreadability. Manuscript Reading Presets start with an editing-oriented and reading-oriented rhythm, while font family, size, line height, text width and related view typography remain user-adjustable. The initial recommendation is a dependable Chinese serif manuscript font around 17 px, 1.9–2.0 line height and 30–38 fullwidth characters, not a locked token. These are View-only Typography Preferences and never alter manuscript text, DOCX semantics or export layout.

Subpages and supporting regions may be resized by accessible drag separators with keyboard alternatives, safe minimums and `恢复默认布局`; resulting layout is local view state. Lower-importance cards/views may be collapsed, hidden or closed and restored from `视图`, while current Book/revision identity, durability/recovery danger, exact decision consequences and currently required authority actions cannot be permanently hidden. Hiding a projection never dismisses or resolves its record. AI7 also provides `在独立窗口打开稿件`. Question 55 resolves this as a Manuscript Surface Transfer rather than a second Reader: the exact editable manuscript subpage moves between the Book Workbench and a Detached Manuscript Window, while the service remains authoritative and every Renderer remains bounded.

### D-056 — Transfer one editable manuscript surface instead of creating a parallel reader

A Detached Manuscript Window hosts the same editable manuscript subpage that normally appears in the Book Workbench. It preserves the page's eligible editing, selection, search/replace/jump, contextual Task, Proposal, factual-review and named-authority interactions without adding any new authority. For one exact Book/manuscript/branch, an Active Manuscript Surface Binding permits only one interactive Renderer surface at a time; detaching is re-hosting, not copying, mirroring or concurrent editing.

The main workbench unloads that manuscript body and shows a quiet `稿件已在独立窗口打开` placeholder with `显示独立窗口` and `移回工作台`. Transfer waits for active Chinese IME composition to end naturally and for current Edit Journal acknowledgement. Editing Protection Mode, an At-risk Edit Extent or a Bounded Edit Safety Buffer blocks transfer so process-local input is never treated as portable state. Closing the detached window normally performs the same guarded transfer back to the workbench. A failed transfer leaves the source surface active; it never creates two writable surfaces or destroys the only one. See [ADR 0010](./adr/0010-transfer-one-editable-manuscript-surface-between-windows.md).

### D-057 — System-following light/dark themes with Windows forced-colors priority

AI7 defaults its Application Theme Preference to `跟随系统` and lets the user choose `浅色` or `深色` manually. The preference is local, applies coherently to the main workbench and every detached/application window, and changes display only. Light mode uses cool-neutral shell chrome with a slightly warm manuscript surface; dark mode uses low-glare charcoal chrome and a neutral reading surface without pure black/white glare.

Windows high contrast/forced-colors always overrides AI7's decorative theme as an unconditional system behavior, not a fourth theme. Components consume semantic color roles rather than hard-coded state colors; color never owns status, authority or factual meaning. V1 offers no custom accent palette. Theme choice changes no manuscript content, selection, Task, record, decision, Effect, export or authority.

### D-058 — One presentation grammar without flattening domain states

AI7 presents state through one restrained grammar: `精确中文状态词 + 图标或形状 + 必要边界/结构 + 可选详情与安全下一步`. Focus, selection, disabled, loading and error behavior share component rules across cards, lists, panels and action regions, while each business state keeps its exact domain name and consequence. Color is supplemental and the UI avoids walls of badges, saturated status cards or decorative animation.

Only an authoritative AI7 record, classified outcome evidence or verified Effect Receipt may receive its corresponding committed/completed treatment. A model response, Harness Session success, tool result, generated proposal, current selection or optimistic local animation never receives authoritative completion styling. Selection cannot resemble Proposal acceptance; disabled actions expose a reason; indeterminate work names its real phase or wait condition rather than using generic progress.

### D-059 — Consequence-first Chinese microcopy with sanitized technical detail

AI7 uses a two-layer message pattern. The first layer concisely answers `什么对象发生了什么`, `什么仍安全或没有改变` and `下一步做什么`. Headings use `对象 + 状态`; actions use `动词 + 对象` and preserve each named authority. Field errors stay beside the field and retain input; Run errors stay with the exact Run; durability and authority blockers remain visible. A modal is reserved for continuing actions that could lose manuscript input or create an irreversible misunderstanding.

Provider/Harness diagnostics, codes and support data live under `查看技术详情` and are sanitized before display or copy so manuscript excerpts, credentials, request bodies and hidden behavior/policy content are absent. Generic text such as `出错了`, `失败，请重试`, `任务完成`, `已保存`, `AI 正在思考`, `批准` and `继续` is prohibited where it hides the real consequence. Ambiguous external outcomes never offer ordinary Retry. Durable receipts, milestone/version records and audit entries show an absolute local time, while less consequential transient messages may use relative time.

### D-060 — Retain V1 semantics, reshape them through V2, and drop frozen artifacts

AI7 retains the frozen V1 package's portable semantic assets: Book-first/editor-first outcomes, exact context and authority distinctions, three independent factual states, Proposal-first mutation, durability/recovery distinctions, continuation meanings, DOCX fidelity disclosure, Windows professional-work behavior and all fourteen journey IDs. It reshapes them through the accepted V2 Book Workbench, action-first Global Attention, Task/Run shortcuts and default execution, role-first model setup, Milestone/Publication Version language, local-only export, governed learning, detached editable manuscript-page transfer and the V2 theme/state/copy system.

AI7 drops the frozen A/B/C geometry, HTML prototype, Figma frames, component tree, exact visual tokens, developer/coding metaphors, editor-facing Policy/Composition elevation, formal Signoff ceremony, external send/handoff tracking and standalone usability/accessibility/performance/UI gates. Dropping those artifacts never deletes their retained professional outcome. The mapping is explicit in [`migration-from-v1.md`](./migration-from-v1.md), and [`journeys.md`](./journeys.md) keeps `J-01`–`J-14` as V2 semantic continuity IDs. Question 60 subsequently closes the identified `J-01` import-completion and `J-13` Series-membership seams in D-061.

### D-061 — Close import and Series journey seams with durable low-ceremony records

Successful manuscript import ends with a user-facing Manuscript Import Record. `稿件已导入` appears only after the original-file record, Import Fidelity Review, accepted degradation, provenance and resulting Book/Manuscript Revision are persisted atomically. The compact completion surface offers `打开稿件` and `查看导入记录`; accepted degradation remains named. The record is import evidence, not a Manuscript Checkpoint, export receipt or generic success toast. Any internally applicable Effect Receipt remains a separate linked technical/authority record rather than replacing the editor-facing name.

`书系 > 成员与共享范围` owns exact `加入书系` and `移出书系` commands. A Series Membership Impact Preview names the Book/Series and separates consequences for future Tasks, already authorized/running Runs, governed Series Knowledge/learning records and immutable history. Membership makes a Book eligible for explicit future Series-scope selection but grants no Run Source Scope, Learning Eligibility, Provider transmission or mutation authority. Removal stops future membership-derived selection/recommendation; it does not rewrite frozen Runs or history, and related knowledge/learning records continue through their own review/remediation paths. Every command appends a Series Membership Change Record.

### D-062 — Close the interview as a documentation-only candidate design

The 61-question UI/UX interview is complete. `docs/ui-ux-v2/` is the normative candidate UI/UX input produced by this session, subordinate to the exact V2 architecture authority and future explicitly accepted product decisions. No exposed product-design question remains in this interview.

This completion grants no implementation, prototype, Figma, dependency, test, verification, formal-review, merge, push, publish or release authority. Pixel-level tokens, a component library, production layout measurements, Figma frames and runnable prototypes are later design-production/implementation artifacts constrained by this package, not silently unresolved product choices. New feature requirements enter as an explicit decision delta and update the candidate documents before implementation.

### D-063 — Anchor every independently reviewable Proposal change to the Manuscript

Every independently reviewable manuscript Proposal change has one stable exact-range or exact-range-set anchor and one persistent Manuscript-anchored Proposal Card identity. The Manuscript presents readable inline insertion/deletion semantics plus a compact Proposal Margin Anchor; only the active or nearby card expands, while other cards collapse and virtualize so long-manuscript review does not become a wall of cards. Cross-chapter, structural, table and long-rewrite work uses the existing Dedicated Work Workspace but preserves the same change identity, anchor, card state and later Proposal Decision. This adopts Word-like revision semantics without copying Word geometry or requiring the renderer to materialize every card or comparison.

### D-064 — Decide Proposal changes by semantic item with explicit atomic exceptions

A Proposal Change Item carries one semantically independent editorial intent, exact target range or range set, and separate accept/reject/defer/edit state. Adjacent items may share one visual card group for scanning, but proximity, paragraph membership, Task/Run origin or one model response never merges their decision identity. When partial acceptance would make the Manuscript internally inconsistent, AI7 may declare an Atomic Proposal Change Group whose named items must be accepted or rejected together, with the exact dependency and non-splittable consequence visible. Ordinary terminology normalization and unrelated factual or stylistic changes remain separate items and may receive exact reversible batch dispositions. See [ADR 0011](./adr/0011-use-proposal-change-items-and-explicit-atomic-groups.md).

### D-065 — Separate Proposal content, rationale, support and editor disposition

Every Manuscript-anchored Proposal Card uses four named regions in a stable hierarchy: `修改内容` leads with the exact current-to-proposed wording and change scope; `修改理由` contains AI7's concise Proposal Change Rationale without chain of thought or evidentiary status; `依据与核查` independently expands exact sources, evidence and the separate Reference Integrity, Claim Support and Factual Verification states; and `你的处理` owns accept/reject/defer/edit controls plus the editor's optional Non-blocking Decision Reason. Proposed wording, AI7 rationale, supporting evidence and the editor's reason therefore remain different records and cannot substantiate one another by visual proximity.

### D-066 — Use one reusable-procedure entry without creating one ambiguous asset type

Editors invoke one low-burden `将以上工序保存为可复用工序` action and receive a Reusable Procedure Classification Preview before anything is saved. AI7 recommends exactly one result: a Default Execution Rule for an already defined Task Skill pattern; a Task Skill Candidate for reusable model-assisted work with variable inputs; a Workflow Profile Draft for deliverable phases, gates, responsibilities and lifecycle; or a Developer Capability Proposal when new code, tools or external-system capability is required. The editor may correct a Task Skill versus Workflow Profile classification, while a developer-capability result may recommend Plugin development but can never generate, install, enable or activate a Plugin. The shared entry is presentation economy only; it creates no generic persisted `skill/workflow/plugin` object and grants no capability or runtime authority.

### D-067 — Extract reusable procedure structure without copying instance data or authority

Reusable Procedure Capture starts from one completed Run or an explicitly selected ordered set of completed user-visible editorial steps. A Reusable Procedure Extraction Preview lets the editor add, remove and reorder eligible business steps and shows `将提取什么` versus `不会保存什么`. The resulting draft may contain reusable purpose, steps and branches, parameterized inputs, output types, source classes, Model Roles, requested AI7 Capabilities, possible Effect classes and applicable Workflow structure. It never embeds manuscript text, Book identity, concrete source content, credentials, provider/model bindings, factual conclusions, decisions, approvals, receipts, hidden Harness activity or unsuccessful/corrected steps unless the editor explicitly supplies a corrected reusable version. The capture record retains local provenance separately from the reusable asset content, and AI7 never creates a candidate silently from recent activity. See [ADR 0012](./adr/0012-extract-reusable-structure-without-instance-authority.md).

### D-068 — Separate Task Skill authoring, admission and enablement

A Task Skill result offers `仅保存候选版本` and `保存并送交检查`. Either path first creates one immutable local-user Task Skill Candidate version; the second enters the AI7-owned admission sequence that may install the exact version disabled and run an independent provider-free check. The authoring Run cannot validate, install, enable, approve, promote or activate its own output. A successfully checked version remains disabled until the editor separately invokes `查看权限上限并启用`; that action displays the admitted Authority Ceiling and permits only future Tasks to request authority within it. It grants no Run Authorization, Capability Grant, Effect Approval, Proposal Decision, Review Decision or Public Release Permission. Repair and update create new immutable versions while old Runs keep their original version identity.

### D-069 — Manage typed automation versions centrally without breaking historical pins

`自动化中心` is one global management projection over Task Skills, Workflow Profiles, Default Execution Rules and Developer Capability Proposals; it is not a generic persisted automation object or a new runtime. It groups each typed stable identity by exact version and exposes a Version-linked Work and Delivery View for the Runs, Workflow Instances, Editorial Deliverables, Editorial Artifacts and Delivery Packages that actually reference that version. A new unpinned Task Skill use defaults to the newest enabled compatible version, while every authorized Run, Default Execution Rule and existing Workflow Instance keeps its exact pin. Manual deletion permanently removes only an unreferenced never-admitted candidate/draft; referenced or authority-bearing versions retire from future use and may shed safely removable package bytes but retain a Historical Version Stub and all authoritative linked records. Active pins block deletion until completion, cancellation, migration or disablement. See [ADR 0013](./adr/0013-use-latest-eligible-new-version-and-preserve-historical-pins.md).

### D-070 — Make enabled Task Skills broadly discoverable without broadening source access

An enabled local-user Task Skill is discoverable across the local AI7 instance by default through Automation Center, intent-based Task Skill Recommendation and manual selection. Its Recommendation Applicability may be narrowed to named Books, Series, Editorial Deliverable types or Workflow phases, but that filter affects suggestion only. Reusing a Task Skill in another Book carries its parameterized procedure and no original Book identity, manuscript/source content, factual result or prior decision. Every new Task independently defaults its Run Source Scope to the current Book; Series, Cross-project and House Editorial Memory access remains explicit and separately authorized. Manual selection may use an enabled compatible skill outside its recommendation filter after AI7 discloses the mismatch, and no catalog/recommendation state grants capability, source or Run authority.

### D-071 — Keep every reusable-result publication and activation path explicit

A Workflow Profile result may be saved as a new inactive draft version, published as a new immutable version, and only then separately designated as the default for newly created Editorial Deliverables; existing Workflow Instances never migrate without their own exact impact preview and confirmation. A Default Execution Rule result may be saved as a draft version or reviewed and explicitly enabled only after its exact Task Skill/version, applicability, source rule, provider/egress, budget, result and Effect envelope are visible; it reacts only to future user-submitted exact matches and never schedules work or applies results. A Developer Capability Proposal offers `保存开发建议` only: it records the missing capability, implementation direction and possible Plugin route for later developer work but cannot generate, install or enable code. Every later edit creates a new version and preserves old links.

## Current documents

- [UI/UX context](./CONTEXT.md) — candidate-local design language.
- [Glossary](./GLOSSARY.md) — bilingual index for candidate UI/UX terms.
- [Visual direction](./visual-direction.md) — accepted reference qualities, required reinterpretations, and exclusions.
- [Requirements](./requirements.md) — accepted and pending UI/UX requirements.
- [Information architecture](./information-architecture.md) — accepted organizing model and still-open navigation decisions.
- [Interaction specification](./interaction-spec.md) — accepted state and transition contracts.
- [V1 semantic migration](./migration-from-v1.md) — retain/reshape/drop mapping from the exact frozen reference.
- [Semantic journeys](./journeys.md) — complete V2 continuity mapping for frozen IDs `J-01`–`J-14`.
- [Commander handoff](./HANDOFF.md) — artifact inventory, authority boundary and requested next intake.
- [Decision queue](./DECISION-QUEUE.md) — material open choices exposed by accepted answers.
- [ADR 0001](./adr/0001-user-approved-default-execution-rules.md) — accepted speed-versus-authority boundary for recurring task execution.
- [ADR 0002](./adr/0002-append-only-run-rewind.md) — accepted append-only history and Effect boundary for editor-directed Run rewind.
- [ADR 0003](./adr/0003-reverse-committed-apply-with-a-new-effect.md) — accepted immutable-receipt and new-Effect boundary for reversing a committed manuscript Apply.
- [ADR 0004](./adr/0004-use-tiered-progressive-evidence-assurance.md) — accepted efficiency-versus-evidence boundary for progressive factual verification.
- [ADR 0005](./adr/0005-project-signoff-as-a-user-facing-milestone-version.md) — accepted target-house mapping from user-facing milestone versions to separate internal checkpoint/signoff records.
- [ADR 0006](./adr/0006-use-purpose-specific-document-representations.md) — accepted authority and fidelity boundary across user-facing DOCX/PDF export and internal/fallback Markdown.
- [ADR 0007](./adr/0007-use-publication-version-as-public-release-permission-projection.md) — accepted mapping from the target-house `发稿版本` interaction to a separate exact internal Public Release Permission.
- [ADR 0008](./adr/0008-authorize-exact-runs-for-deferred-connectivity-start.md) — accepted delayed-consent boundary for an exact authorized Run that may start after connectivity returns.
- [ADR 0009](./adr/0009-use-explicit-book-first-learning-eligibility.md) — accepted low-interruption and least-surprise scope boundary for editor-decided Learning Material eligibility.
- [ADR 0010](./adr/0010-transfer-one-editable-manuscript-surface-between-windows.md) — accepted single-active-surface and guarded window-transfer boundary for editable manuscript work.
- [ADR 0011](./adr/0011-use-proposal-change-items-and-explicit-atomic-groups.md) — accepted per-change decision identity and the narrow explicit exception for semantically indivisible change groups.
- [ADR 0012](./adr/0012-extract-reusable-structure-without-instance-authority.md) — accepted reusable-procedure extraction boundary that excludes manuscript instance data, secrets and prior authority.
- [ADR 0013](./adr/0013-use-latest-eligible-new-version-and-preserve-historical-pins.md) — accepted latest-eligible default for new use together with exact historical pins and non-destructive referenced-version removal.
