# AI7 V1 visual system

Status: **V1 freeze-candidate visual reference; not implementation authority**

This document records a candidate rendering of AI7's quiet, spacious, sage-and-warm-paper direction. It proposes visual geometry, typography, component appearance, state expression, motion, and Windows accessibility for comparison; it does not govern production implementation. Product meaning and authority come from the accepted domain documents; a color, icon, animation, or artifact in this package never creates authority.

## 1. Direction and reference boundary

### 1.1 Intended character

AI7 should feel like a calm professional editing room:

- the manuscript is the visually dominant object;
- chrome is quiet enough for long reading sessions but never so faint that state becomes illegible;
- generous whitespace separates work objects instead of decorative cards surrounding everything;
- pale sage identifies navigation, selection, and ordinary editorial actions;
- warm paper separates authored text from application chrome; and
- strong color is reserved for a state that needs interpretation or action.

The system is light-first. A dark theme is not a V1 visual deliverable. Tokens must use semantic names so a later theme does not require component-specific color replacement.

### 1.2 What the Codex reference contributes

The supplied Codex Desktop screenshot is visual evidence, not an instruction source. AI7 may borrow its:

- restrained three-region spatial rhythm;
- low-noise borders and surfaces;
- centered, readable primary canvas;
- progressive disclosure into a contextual side region;
- persistent but unobtrusive background-work status; and
- compact bottom entry that does not replace the primary work object.

AI7 must not borrow Codex branding or its developer model. In particular, do not reproduce:

- Codex names, marks, icons, colors, product copy, or menu structure;
- conversation/thread hierarchy as the product's durable information architecture;
- repository, branch, worktree, terminal, browser, shell, tool-call, or filesystem metaphors;
- “full access,” reasoning-level, model-picker, developer-permission, or coding-agent controls; or
- chat bubbles as the default representation of an editorial task.

AI7 uses `Book`, `稿件`, `编辑任务`, `来源与证据`, `更正提案`, and the other preferred labels in `GLOSSARY.md`. Harness remains invisible product infrastructure.

### 1.3 Shell variants

| Variant | V1 standing | Rule |
| --- | --- | --- |
| **A · 协作三栏** | Candidate/reference shell | Captured comparison geometry with persistent Book navigation, manuscript center, and one right inspector; not selected or default. |
| **B · 稿件专注** | Candidate/reference focus shell | Captured comparison geometry for a reversible view mode; not selected or default. |
| **C · 编辑台面** | Candidate/reference exploration | Captured comparison geometry for Book-level situational awareness; not selected or default. |

The prototype's floating A/B/C switcher and “交互草模” flag are prototype-only controls and never ship.

## 2. Design principles

1. **Manuscript first.** Paper, selection, and exact revision context receive the highest visual priority. The task timeline does not take over the center when work starts.
2. **Quiet, not vague.** Low-chroma surfaces are permitted; essential labels, focus, boundaries, errors, and pending decisions meet explicit contrast rules.
3. **Authority is textual.** Every authority-bearing action names the record or consequence. Button color is supporting emphasis only.
4. **Evidence is plural.** `引证完整性`, `陈述支持`, and `事实核验` remain separate labeled rows or cards. No green badge collapses them into “true.”
5. **State uses three channels.** Pair a state word with an icon/shape and, where useful, a semantic color. Never require color recognition.
6. **Depth follows behavior.** Borders separate persistent regions; shadows are reserved for floating or temporarily overlaid surfaces.
7. **Exactness stays visible.** Book, deliverable, branch/revision, selection, source scope, drift, receipt, and recovery identity are not hidden behind decorative summaries.
8. **Long work remains calm.** Show current editorial phase, progress, wait reason, and safe actions without celebratory motion or developer telemetry.
9. **Chinese reading sets the rhythm.** Type, line length, punctuation behavior, and IME safety are first-class constraints, not localization adjustments.

## 3. Foundations

### 3.1 Token naming

Implementation uses three layers:

1. **Primitive tokens** describe a value, for example `sage-750` or `space-16`.
2. **Semantic tokens** describe a role, for example `text-primary` or `surface-paper`.
3. **Component tokens** alias semantic roles only when a component truly needs a stable exception, for example `task-launcher-shadow`.

Components must not contain unexplained literal colors. Token names must not encode an outcome such as `truth-green`, `approved-green`, or `ai-purple`.

### 3.2 Color primitives and semantic roles

The following light-theme values are V1 candidate/reference values only, not accepted, default, or implementation authority. Contrast figures are candidate comparison evidence for the named foreground against the named background; they do not make every pairing valid.

| Semantic token | Value | Intended use | Contrast / restriction |
| --- | --- | --- | --- |
| `surface-canvas` | `#F5F4EF` | App canvas behind paper and panels | Do not place weak text directly on it. |
| `surface-paper` | `#FFFDF8` | Manuscript and primary cards | Base comparison surface. |
| `surface-warm` | `#FAF7EF` | Secondary groups, inactive tabs | Keep large areas subtle. |
| `surface-sage-subtle` | `#F8FBF6` | Chip and hover base | Not a status by itself. |
| `surface-sage-hover` | `#EFF7EB` | Hover and selected secondary action | Pair selection with border/icon/text. |
| `surface-sage-selected` | `#E2F0DC` | Current item or exact text selection | Selection also has a dark inset line. |
| `accent-sage-soft` | `#CFDFC8` | Decorative active track | Never body text. |
| `accent-sage` | `#66856E` | Decorative mark or large icon | 4.01:1 on paper; do not use for normal text. |
| `action-secondary` | `#4F6F59` | Secondary action text/icon | 5.51:1 on paper. |
| `action-primary` | `#3C5846` | Primary button fill or action text | 7.72:1 on paper; white on fill is 7.85:1. |
| `focus-ring` | `#315F46` | Keyboard focus outline | 7.23:1 on paper. Use a 3 px ring. |
| `text-primary` | `#262A27` | Main UI and manuscript ink | 14.32:1 on paper. |
| `text-secondary` | `#4F5751` | Supporting prose | 7.34:1 on paper. |
| `text-muted` | `#626B64` | Metadata that remains meaningful | 5.43:1 on paper. This replaces the prototype's too-light `#737C75` for essential small text. |
| `text-disabled` | `#99A199` | Disabled or purely decorative labels | 2.61:1 on paper; never essential content and never the only disabled cue. |
| `border-subtle` | `#DFE5DC` | Dividers and grouped decoration | Not sufficient as the sole control boundary. |
| `border-default` | `#C9D3C7` | Card edge with an otherwise visible surface | Decorative boundary only. |
| `border-interactive` | `#7F8E82` | Inputs and controls needing a visible boundary | At least 3.13:1 on canvas and 3.22:1 on warm surface. |
| `status-info` | `#456983` | Informational text/icon | 5.33:1 on `#EEF6FB`. |
| `surface-info` | `#EEF6FB` | Informational notice | Always include an “信息” icon or explicit label. |
| `status-warning` | `#9B6326` | Drift, uncertainty, waiting attention | 4.58:1 on `#FFF4DF`. |
| `surface-warning` | `#FFF4DF` | Warning/attention notice | Not used for irreversible failure. |
| `status-danger` | `#9B443B` | Failure, contradiction, destructive consequence | 5.77:1 on `#FFF0ED`. |
| `surface-danger` | `#FFF0ED` | Error/destructive notice | Always name the affected object. |
| `diff-delete-ink` | `#82514B` | Deleted text | 5.44:1 on `#F9E7E3`; also struck through and prefixed by deletion semantics. |
| `diff-delete-surface` | `#F9E7E3` | Deleted range | Never rely on pink alone. |
| `diff-insert-ink` | `#315940` | Inserted text | 6.87:1 on `#E5F2DF`; also underlined and prefixed by insertion semantics. |
| `diff-insert-surface` | `#E5F2DF` | Inserted range | Never rely on green alone. |
| `evidence-highlight` | `#FFF0BD` | Exact fetched source range | Pair with `#7B5721` text/underline (5.72:1) and an accessible label. |

#### Contrast rules

- Normal text and meaningful icon glyphs target at least **4.5:1** against their actual surface.
- Large text (at least 24 CSS px regular or 18.66 CSS px bold) targets at least **3:1**.
- Focus indicators and the essential visual boundary of an input/control target at least **3:1** against adjacent colors.
- `text-muted` may reduce hierarchy but never reduce legibility. `text-disabled` is unavailable for timestamps, revision identifiers, scope, evidence state, error detail, or recovery state.
- Gradients are decorative. Text sits on a stable opaque or near-opaque surface, not directly on a changing gradient.
- Success sage means only a recorded/committed state such as journal persistence or a verified receipt. It does not mean a manuscript assertion is factually true.

### 3.3 Status grammar

Every compact status has the anatomy `icon + explicit state word + optional detail`. A tooltip alone is insufficient. Recommended semantics are:

| Family | Icon shape | Color role | Example label |
| --- | --- | --- | --- |
| Neutral / not started | hollow circle | `text-muted` | `尚未开始` |
| In progress | segmented ring or clock | `status-info` | `正在核对第 3 项` |
| Waiting / clarification | question in circle | `status-warning` | `等待补充来源` |
| Paused | pause bars | `text-secondary` | `已暂停` |
| Recorded / committed | check in circle | `action-secondary` | `已写入修订日志` |
| Warning / drift / conflict | triangle | `status-warning` | `稿件修订版已变化` |
| Failure / contradiction | octagon or x in circle | `status-danger` | `应用失败，未改动稿件` |
| Cancelled / rejected | slash-circle | `text-secondary` or danger when consequential | `任务已取消` / `提案已拒绝` |

Do not use a green dot without a word. Do not animate a dot indefinitely without a visible current phase and wait reason.

### 3.4 Typography

#### Font families

| Role | Stack | Rule |
| --- | --- | --- |
| UI Chinese | `"Microsoft YaHei UI", "Source Han Sans SC", "Noto Sans CJK SC", system-ui, sans-serif` | Windows-native first for dependable metrics and ClearType. Do not download a web font at runtime. |
| Manuscript Chinese | `"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif` | Serif only for authored manuscript/deliverable text and proposal text. If a font is bundled, licensing and third-party notices are a release requirement. |
| Code-like identity | `Consolas, "Cascadia Mono", monospace` | Stable IDs and hashes only; never ordinary editorial prose. |

UI font fallback must be tested with common CJK punctuation, fullwidth characters, rare-character fallback, Latin names, and numerals. A fallback glyph must not change the stored manuscript or break exact selection.

#### Type scale

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `type-caption` | `12 / 18 px` | 400–600 | Secondary metadata; never below 12 px for essential text. |
| `type-label` | `13 / 20 px` | 600 | Field labels, tabs, compact actions. |
| `type-ui-body` | `14 / 22 px` | 400 | Default UI prose and controls. |
| `type-ui-strong` | `14 / 22 px` | 600 | Current object and card title. |
| `type-panel-title` | `16 / 24 px` | 600 | Inspector and local page headings. |
| `type-section-title` | `20 / 30 px` | 600 | Full work-surface section title. |
| `type-manuscript` | `17 / 34 px` | 400 | Default long-form manuscript reading/editing. |
| `type-manuscript-h2` | `20 / 32 px` | 600 | Manuscript section heading. |
| `type-manuscript-h1` | `26 / 40 px` | 600 | Manuscript title in the editor. |

The UI uses no all-caps English eyebrow as the only label in Chinese-first surfaces. English record IDs may appear after the preferred Chinese name in details or diagnostics.

#### Chinese long-form composition

- The preferred reading column is **30–38 fullwidth Chinese characters**, approximately 34 at the default size. The paper outer width caps at 780 px; the text block normally caps near 640 px.
- Use `line-height: 2` for the default manuscript view and `letter-spacing: 0.02em` to `0.035em` after font-specific visual testing. Do not track headings so widely that punctuation looks detached.
- Use strict CJK line breaking (`line-break: strict`) and normal word breaking. Unbroken URLs or identifiers may wrap without widening the manuscript.
- Chinese punctuation, brackets, quotation marks, ellipses, em dashes, Latin names, and inline numerals must remain selectable as exact Unicode ranges.
- Justification is a view preference, not stored text. It must not insert spaces or rewrite punctuation. If the chosen Chromium/font combination produces visibly uneven CJK spacing, left alignment is preferable to false typographic polish.
- First-line indent, paragraph spacing, heading spacing, comments, notes, and other styles reflect the document/style profile. A visual indent must never insert fullwidth spaces into the source.
- Continuous editing does not simulate print pages. Page breaks, headers, and footers appear as explicit structural markers where fidelity requires them.
- UI annotations, comments, findings, citations, and evidence labels remain in the UI sans-serif; only quoted or proposed manuscript text uses the manuscript serif.
- IME composition text must keep the operating system's composition underline and candidate behavior. No proposal, task, search, or keyboard shortcut fires while composition is active.

### 3.5 Spacing, dimensions, radius, and elevation

The spacing system uses a 4 px base: `2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Use 12–16 px inside compact controls/cards, 18–24 px inside inspectors, and 40–76 px between a paper edge and authored text when space permits.

V1 candidate/reference shell dimensions at 100% effective scale; these values are not accepted, default, or implementation authority:

| Element | Default | Compact behavior |
| --- | --- | --- |
| Context top bar | 62 px high | Preserve revision and save/recovery identity before secondary actions. |
| Left navigation | 252 px wide | Collapse below 1180 effective CSS px. |
| Right inspector | 374 px wide | May reduce to 350 px, then become a drawer below 860 effective CSS px. |
| Editor toolbar | at least 48 px high | Wrap or move secondary controls into overflow; do not shrink targets. |
| Primary/decision button | at least 40 px high | Full-width in a narrow inspector when needed. |
| Ordinary button/icon target | at least 36 × 36 px | Icon remains 16–20 px within the target. |
| Task launcher | 660 px max, 58 px min height | `viewport - 18 px` on narrow layouts; it must not cover selected text or prototype controls. |

Radius tokens:

- `radius-selection: 3px` for inline text highlights;
- `radius-paper: 8px` for the manuscript sheet on roomy layouts, square on narrow layouts;
- `radius-control: 10px`;
- `radius-card: 12px`;
- `radius-group: 14px`;
- `radius-floating: 18px`; and
- `radius-pill: 999px` only for chips, counts, and compact segmented controls.

Do not round every persistent region. The shell and inspector use dividers; floating composer/drawers use radius and elevation.

Elevation tokens:

- `shadow-soft: 0 8px 24px rgba(48, 58, 49, 0.08)` for a mini-nav or small floating card;
- `shadow-floating: 0 18px 44px rgba(48, 58, 49, 0.11)` for a task launcher/drawer; and
- `shadow-paper: 0 12px 36px rgba(67, 63, 48, 0.08)` for the manuscript sheet on canvas.

Persistent cards, badges, save states, and evidence outcomes do not use shadow to signal importance.

### 3.6 Iconography

- Use one outline icon family with rounded terminals, 1.5–1.75 px stroke at 16–20 px, rendered as vector paths with `currentColor`.
- Icons describe editorial objects: book, manuscript, outline, evidence, proposal, task, workflow, history/recovery, package, search, pause, cancel, and receipt.
- Never use a terminal prompt, code brackets, repository branch, robot head, sparkle, or model logo as the general symbol for AI7 work.
- An icon-only control requires an accessible name and a visible tooltip on hover/focus. Authority-bearing and destructive actions always include a text label.
- Emoji are forbidden as production status or navigation icons; emoji in the throwaway prototype are placeholders.
- Badges and notification counts use tabular numerals and an accessible phrase such as `待处理 3 项`.

## 4. Layout and density

### 4.1 Spacious desktop density

V1 has one density: spacious professional editing. There is no user-visible compact-density switch. Dense tables may use 40 px rows, but reading, evidence, decisions, and recovery states use at least 48–56 px per logical item and clear group spacing.

The central paper should visually outweigh both side regions. Avoid a dashboard made of equal cards. A card exists only when it groups one decision, evidence record, receipt, or independently actionable state.

### 4.2 Responsive bands

Breakpoints use **effective CSS pixels after Windows scaling**, not physical display pixels.

| Effective viewport | Layout |
| --- | --- |
| `>= 1280 px` | Candidate Variant A reference: 252 px navigation, flexible manuscript center, 374 px inspector. Each side may collapse independently. |
| `861–1279 px` | Compact A: left navigation collapses to an opener; manuscript plus at most one expanded inspector remain. Secondary top-bar labels move to overflow. |
| `<= 860 px` | Manuscript-first: side regions are modal/nonmodal drawers as appropriate, never simultaneous permanent columns. Inspector width is at most 390 px and no more than `viewport - 16 px`. |
| `<= 560 px` | Narrow-window fallback: paper loses decorative radius/shadow, horizontal padding reduces to 28 px, split comparison stacks, decision buttons may become full width. |

At 1366×768 with Windows 125% and 150% scaling, verify the effective viewport rather than assuming the physical resolution. At 150%, the primary acceptance state is manuscript plus at most one open side panel; top-bar controls may collapse, but Book, revision, journal state, and recovery warning stay reachable.

Resizing must not:

- change the current Book, selection, task draft, proposal decision, or comparison mode;
- scroll the editor to an unrelated Manuscript Block;
- close an unsaved task draft without confirmation; or
- turn an inspector into a full-page conversation.

### 4.3 Focus mode candidate

Variant B, if adopted, is entered with a named `专注模式` view action and exited with the same action or `Esc` when no modal is open. It may hide persistent navigation and float one context drawer, but it must retain:

- Book/deliverable/revision context;
- journal and recovery state;
- global position in the full manuscript;
- pending-decision and clarification indicators; and
- access to the same authoritative records as A.

Focus mode is a view preference only. It never pauses Runs, changes task source scope, or creates a different manuscript representation.

## 5. Component specifications

### 5.1 Context top bar

**Anatomy:** AI7 mark/name, `Book / 编辑交付成果 / 稿件修订版` breadcrumb, journal/checkpoint/recovery cluster, scoped search, attention entry, and overflow.

- Keep the differentiating Book and revision identity in the accessible name when visible text truncates.
- `已写入修订日志`, `有未建立稿件修订检查点的改动`, and `从恢复快照恢复` are distinct adjacent states, not one cloud/check icon.
- The search control always exposes its current scope (`本稿件`, `本 Book`, `已选来源`, or `本机`).
- Do not show provider/model selection or developer access state here.

### 5.2 Book navigation and global work queue

- Book rows use a book/manuscript icon, title, optional Series label, and a text-backed count. A task is nested under its Book or projected in the work queue; it is not a peer “chat.”
- Current location uses background + left/inset marker + `aria-current`, not background alone.
- The global queue groups `待我处理`, `运行中`, `发生变化`, `失败`, and `最近完成`; opening an item navigates to the authoritative object.
- The left sage-to-warm gradient is optional atmosphere. In high contrast or reduced graphics it disappears without losing hierarchy.

### 5.3 Manuscript paper and windowed loading

- Center one paper surface; do not render stacked fake print pages for the continuous editor.
- The current loaded-window boundary is a labeled divider such as `已加载至第 28 个稿件结构块；继续滚动以载入`, never an infinite-scroll spinner alone.
- A whole-manuscript position indicator names chapter/block and an overall indexed position even when the scrollbar represents only the loaded window.
- Selection uses a pale sage fill and dark underline. Evidence exact-range highlight uses amber fill and a distinct source-link glyph/label.
- Comments, findings, and proposals attach to exact ranges with margin/inspector anchors; multiple types use different icons and labels, not multiple arbitrary highlight colors.
- Whole-manuscript find/replace shows indexed scope and background progress while ordinary editing remains enabled.

### 5.4 Task launcher and task composer

**Collapsed launcher:** selected template/task label, exact context summary, task state if one is active, and one named open/start action. It is sticky/floating above content and never resembles a chat bubble.

**Expanded composer:**

- natural-language Task Intent input;
- Task Skill template picker;
- exact Book/deliverable/revision/selection summary;
- source-scope and Editorial Dimension chips;
- expected outcome;
- provider-processing/outbound-data summary; and
- `生成计划预览` as the next action.

Chips are summaries, not permissions. A selected source scope includes text/checkmark and a remove action. Text areas have a persistent label; placeholder text never serves as the only label.

### 5.5 Plan Preview and task-run authorization

- Plan Preview is a bordered summary with sections for target, intended result, source scope, dimensions, processing, budget, possible governed Effects, and material exclusions.
- The primary action is `授权运行此任务` or a similarly exact label. Never label the card or button merely `批准`, `确认`, or `继续`.
- A short notice directly above the action states: task-run authorization does not apply a proposal, grant public release, or prove a controlled action completed.
- Material drift replaces ordinary progress with a warning card naming old/new scope and actions `查看计划修订` and `停止任务`. The primary run button is absent until renewed authorization.

### 5.6 Running task and clarification

The normal task component uses a calm vertical timeline:

- completed phases use a check + past-tense label;
- one active phase uses a ring/clock + current object + determinate progress when available;
- future phases remain neutral;
- the footer exposes `暂停` and `取消任务` as different actions; and
- expandable technical diagnostics are secondary and sanitized.

A Clarification Request is a durable warning card containing the exact ambiguity, affected task, what can proceed, and response options. Closing the inspector does not dismiss it. An indeterminate spinner may appear only while work is genuinely advancing; after a wait threshold, replace or accompany it with the reason (`等待来源导入`, `等待编辑回答`).

### 5.7 Evidence and factual status

At the decision point, use a three-card/three-row group in this fixed order:

1. **引证完整性**;
2. **陈述支持**; and
3. **事实核验**.

Each row has its own state word, icon, short explanation, evidence count, and `查看依据` action. The `事实核验` outcomes `证据支持`, `证据反驳`, `证据冲突`, `尚未解决`, and `不适用` remain distinct textual outcomes. Do not replace the group with one “已溯源” or “已核实” badge.

An Evidence Link card includes:

- source identity and 源材料版本;
- evidence role;
- quoted range and provenance;
- freshness;
- `精确读取成功` or its failure state; and
- an action that opens and highlights the exact authoritative range.

A foundation-model lead uses the blue information style, is titled `研究线索`, and explicitly says `不是事实依据`. Editorial interpretation is titled `专业判断` and presents rationale/passages without a truth checkmark.

### 5.8 Proposal diff and comparison

Small proposals default to inline semantic markup:

- deletions use a real `<del>` semantic, pink surface, dark deleted-text ink, strike-through, and an accessible `删除：…` description;
- insertions use a real `<ins>` semantic, pale green surface, dark inserted-text ink, underline, and an accessible `新增：…` description; and
- unchanged context stays plain manuscript text.

Do not remove strike/underline in high contrast. Screen readers must encounter coherent base and proposal text, not a repeated character-by-character diff.

Large/structural proposals offer a segmented view control: `行内比较` and `并列比较`. A wide screen shows `当前稿件修订版` and `提案修订版`; a narrow screen stacks them. If drift exists, add a third clearly identified `当前目标` state or a drift summary before any action. Never label columns only “旧/新.”

### 5.9 Decision surface and controlled action receipt

Only one locally recommended action receives primary-button emphasis. Alternatives are plain bordered buttons or a menu, but remain keyboard reachable. Exact labels include:

| Decision | Example primary label | Required adjacent disclosure |
| --- | --- | --- |
| Run Authorization | `授权运行此任务` | Scope/plan boundary and what it does not authorize. |
| Proposal Decision | `接受提案` | Records a 提案处理决定; does not by itself prove application. |
| Compound proposal + apply | `接受并应用` | States that separate decision/action records are created and completion waits for a 受控动作回执. |
| Review Decision | `记录编辑评审决定` | Names the 工作关口 and evidence considered. |
| Effect Approval | `批准此受控动作` | Shows exact target, payload, replay policy, and drift state. |
| Public Release Permission | `授予公开发布许可` | Shows public destination/material; never combined with signoff/export. |

After a controlled action begins, show `正在应用；尚无回执`, not success styling. A receipt card appears only when authoritative evidence exists and includes:

- `受控动作回执` heading and stable receipt identity;
- exact target and resulting revision/version;
- committed time and outcome;
- any partial/ambiguous classification; and
- `打开结果` / `查看完整记录`.

An ambiguous external outcome uses the warning family, blocks automatic retry, and offers `核对结果` rather than `再试一次`.

### 5.10 Save, checkpoint, and recovery

These states are visually adjacent but semantically separate:

| Record/state | Label examples | Visual treatment |
| --- | --- | --- |
| Working edit pending persistence | `正在写入修订日志` | neutral/blue activity; do not navigate away without durable handling. |
| 修订日志 persisted | `已写入修订日志` | check + sage text; may include last-written time. |
| Uncheckpointed manuscript change | `有未建立稿件修订检查点的改动` | amber dot/triangle + action `建立稿件修订检查点`. |
| 稿件修订检查点 | `稿件修订检查点：初审完成` | named record with time, revision, and creator. |
| Recovered working state | `已恢复未完成编辑` | information notice; restoring creates a descendant. |
| Recovery Snapshot | `恢复快照可用` | shield/history icon, verification time, independent status. |
| Persistence failure | `未能写入修订日志` | danger notice, preserved local state explanation, retry/export-safe-next-step. |

Never use a cloud icon as a generic save claim. “已保存” alone is too ambiguous. Recovery confirmation must name whether it restores working state, a 稿件修订检查点, or a 恢复快照 and state that history will not be overwritten.

### 5.11 Import fidelity report

The report groups inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and round-trip behavior. Each row shows one of:

- `保留` with a check and exact scope;
- `降级处理` with a warning and plain-language consequence; or
- `无法导入` with a blocking icon and reason.

The overall action is unavailable while silent loss or an unacknowledged named degradation remains. Do not show a reassuring overall percentage that hides a rejected structure.

### 5.12 Workflow, delivery, learning, and audit

- Workflow phases use labeled state rows (`未开始`, `进行中`, `等待`, `已完成`, `已跳过：原因`, `已重新打开`) rather than a single Book percentage.
- A 工作关口 card lists required evidence, missing evidence, drift, 编辑评审决定, and signoff separately.
- Signoff, external export, and 公开发布许可 are separate buttons/cards with distinct icons and confirmation text.
- Optional result feedback is a compact nonblocking row. Reasons are unselected by default; selection uses border + check, not sage fill alone.
- Learning Material, 编辑记忆, and 学习审计记录 use ordinary professional record styling, not magical sparkle/brain imagery. Scope (`Book`, `书系`, `社级`) is always text-visible.
- Editor-facing governance-rule activation controls remain excluded until the recorded authority conflict is resolved.

### 5.13 Controls and system states

- **Hover:** subtle sage surface change; it never reveals essential information that keyboard users cannot reach.
- **Focus:** 3 px `focus-ring`, 2 px offset, not clipped by scroll containers.
- **Pressed/selected:** darker inset border or checkmark plus state label.
- **Disabled:** reduced contrast plus disabled semantics and, when the reason is not obvious, nearby explanation. Never rely on opacity alone.
- **Loading:** preserve control width and label the activity (`正在生成计划预览`). Prevent duplicate activation without making the whole editor inert.
- **Error:** keep user input, place error next to the affected field, summarize at the top for multi-field forms, and move focus only on submit.
- **Empty:** name what is absent and a safe first action; do not use a mascot as the primary explanation.

## 6. Motion and feedback

Motion explains spatial change; it never celebrates AI output or hides an authority transition.

| Token | Duration | Use |
| --- | --- | --- |
| `motion-instant` | 0–80 ms | Pressed state and focus feedback. |
| `motion-fast` | 120 ms | Hover, chip selection, small disclosure. |
| `motion-panel` | 180 ms | Inspector/drawer enter or width transition. |
| `motion-context` | 240 ms max | Comparison-mode or work-surface transition. |

Use an ease-out curve for entry and ease-in for exit. Avoid parallax, spring bounce, typewriter text, pulsing proposal highlights, confetti, and animated gradients. A task may use a restrained progress indicator; it must not imply determinacy when progress is unknown.

When `prefers-reduced-motion: reduce` is active:

- remove smooth scrolling and transform-based panel movement;
- replace looping spinners with a static activity glyph plus updated text where possible;
- make transitions immediate; and
- preserve focus placement and state announcements.

State changes that matter to screen-reader users use a polite live region. Errors, persistence failure, drift that suspends work, and an available Clarification Request use an assertive announcement only when immediate action is required. Do not announce every percentage tick.

## 7. Windows and accessibility requirements

### 7.1 High DPI and scaling

- Build layout in CSS logical pixels/DIPs. Do not compensate for Windows scaling with browser zoom or manually multiplied coordinates.
- Test 100%, 125%, 150%, and 200% scaling on at least the target 1366×768 class and a larger desktop display.
- Icons are SVG/vector and raster assets provide sufficient resolution. Never rasterize Chinese labels or manuscript text.
- Do not use borders thinner than 1 CSS px. Recheck 1 px dividers at fractional scaling for blur; essential control boundaries use the stronger token.
- Text reflows rather than clipping. A 200% text/zoom check must preserve the action name, state word, revision identity, and error message.
- Respect Windows font rendering and system font fallback. Do not disable font smoothing or force antialiasing modes.
- Use the native Windows pointer, text cursor, selection behavior, clipboard conventions, and IME candidate window placement.

### 7.2 Keyboard and focus

- Focus order follows top context, left navigation, center work surface, right inspector, then floating task entry as the visual structure requires; drawers trap focus only when modal.
- Every essential function is reachable without pointer precision. A visible `跳到稿件正文` action bypasses repeated shell navigation.
- `Esc` closes the topmost non-destructive drawer/popover and never cancels a task or discards a draft.
- Shortcuts do not fire during IME composition. Destructive or authority-bearing actions require explicit focus and are never single unmodified letter keys.
- After opening exact evidence, focus moves to the highlighted source range or its heading. Returning restores focus to the originating Evidence Link.
- After an action receipt appears, focus remains on the action area and a polite announcement provides the result; do not jump the editor unexpectedly.

### 7.3 Windows high contrast / forced colors

Under `forced-colors: active`:

- allow controls and text to adopt system colors such as `Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, `Highlight`, `HighlightText`, and `GrayText`;
- remove gradients and nonessential shadows;
- keep 1–2 px system-color boundaries around inputs, cards that carry decisions, selected navigation, and focused controls;
- render SVG icons with `currentColor` and do not set `forced-color-adjust: none` except for a tested, essential visualization;
- retain status words and icons when fills disappear; and
- retain `<del>` strike-through, `<ins>` underline, and visible `删除` / `新增` labels when diff colors disappear.

High contrast acceptance is performed on every authority-bearing surface, not only the shell landing state.

### 7.4 Additional accessibility acceptance

- Essential text and controls meet the contrast thresholds in section 3.2 in default, hover, selected, disabled-explained, and error states.
- Zoom/reflow never creates two simultaneous modal regions or horizontal scrolling of ordinary UI prose.
- Touch is not a primary V1 input, but target size remains at least 36 px and adjacent destructive actions have 8 px separation.
- Error, warning, selection, proposal insert/delete, evidence outcome, and task state are understandable in grayscale.
- Accessible names include the object where repeated controls would otherwise collide, for example `打开《雾港来信》来源“海陵港务档案”` rather than three `查看` buttons.

## 8. Microcopy system

### 8.1 Voice

Use concise, professional Simplified Chinese. Prefer object + action + current consequence. Be calm, specific, and non-technical. Do not anthropomorphize the model or imply certainty that the records do not establish.

| Prefer | Avoid | Reason |
| --- | --- | --- |
| `正在核对 6 项引文中的第 3 项` | `AI 正在思考…` | Names editorial work rather than model theater. |
| `已写入修订日志` | `已保存` | Names the durable record. |
| `事实核验：证据冲突` | `已溯源` | Preserves the exact evidence state. |
| `接受提案；尚未应用` | `已批准` | Separates decision from effect. |
| `应用失败，稿件未发生改动` | `出错了！` | Names affected object and safety outcome. |
| `此任务会将所选段落发送给已配置的模型服务` | `允许联网？` | Explains controlled processing and data scope. |
| `授予公开发布许可` | `发布/导出` | Keeps public authority separate from export. |

### 8.2 Naming rules

- Use the preferred Simplified Chinese labels in `GLOSSARY.md`. Stable English identifiers appear only where they help audit/support work.
- Never use unqualified `批准`, `审批`, `检查点`, `版本`, `恢复`, or `范围` when the qualified domain term is available.
- Do not call a task `对话`, a Book `项目文件夹`, a 提案分支（Proposal Branch） `AI 草稿聊天`, or Harness activity `后台代理`.
- “完成” always names what completed: `事实核验任务已完成`, `导出已完成`, or `受控动作已提交`. It never means the Book is factually correct, signed off, or publicly releasable.
- A cancel confirmation states that already committed controlled actions are not undone. A pause message states what remains resumable.
- A warning headline states the problem; the body states impact and safe next action. Do not use exclamation marks for routine states.
- Button labels are verbs with objects. Use an ellipsis only when the action opens a further required input/confirmation step.
- Relative time may accompany, but never replace, an absolute local timestamp in receipts, 稿件修订检查点, 稿件修订版, and audit records.
- Truncated Book/source titles retain a full accessible name and hover/focus disclosure.

### 8.3 Synthetic design content

Prototype examples must remain conspicuously synthetic. Do not paste real manuscripts, private sample prose, real unpublished titles, manuscript-derived indexes, or model-provider payloads into Figma, screenshots, fixtures, or this documentation.

## 9. Implementation and visual QA checklist

Before a candidate V1 surface is considered visually complete within this reference, verify:

1. its candidate shell variant is named explicitly and is not presented as selected, accepted, authoritative, or default;
2. the manuscript remains the highest-priority surface;
3. all meaningful text passes contrast with its actual background;
4. no state, outcome, or selection depends on color alone;
5. Book, exact revision, persistence/recovery state, and source scope stay reachable;
6. decision labels name the exact authority and receipts remain distinct from decisions;
7. the evidence triad is not collapsed;
8. proposal insertion/deletion remains understandable without color and to assistive technology;
9. Chinese typography, rare-character fallback, punctuation, exact selection, clipboard, and IME composition have been exercised;
10. 125%, 150%, and 200% Windows scaling, keyboard-only navigation, reduced motion, and Windows high contrast have been exercised;
11. all loading, empty, error, drift, conflict, disabled, and recovery states exist, not only the happy path; and
12. no Codex developer object, Harness branding, provider secret, manuscript content, or repository metaphor has leaked into the editorial UI.

## 10. Relationship to current artifacts

- [Requirements](./requirements.md) record what this candidate visual system is intended to make understandable.
- [Information architecture](./information-architecture.md) records candidate region ownership and responsive navigation.
- [HTML prototype](./prototype/README.md) demonstrates candidate A/B/C timing and the factual-verification/correction journey. Its CSS and the token corrections in this document are reference evidence, not production requirements.
- The captured Figma frames remain raw V1 candidate/reference evidence. No component-library continuation, native componentization, or Variant A promotion is authorized on this branch.
