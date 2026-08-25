# AI7 V1 UI/UX requirements

Status: **V1 freeze-candidate requirements; not user-validated or canonical**

## 1. Product outcome

AI7 must let a professional Chinese publishing editor perform long-form editing and governed AI-assisted editorial work in one Windows desktop environment without learning developer concepts. The manuscript remains the primary work surface. AI work remains visible, interruptible, evidence-linked, and subordinate to exact editorial authority.

Success means that an editor can:

1. find and edit the intended Book and exact manuscript revision;
2. start a bounded AI task from exact text or Book context;
3. continue editing while work runs;
4. understand evidence, uncertainty, and source scope;
5. review and deliberately apply or reject a proposal;
6. distinguish a decision from proof that an action completed;
7. recover work without silent text loss; and
8. locate every imported source and generated deliverable without filesystem literacy.

## 2. Primary user and environment

The primary modeled user is a **responsible editor in a leading literary publishing house in mainland China**. They are professionally expert in text and editorial judgment, but are not assumed to understand model routing, agent loops, shell permissions, endpoints, repositories, or filesystem sandboxes.

V1 environment:

- Windows Standalone desktop only;
- Chinese-first labels, help, errors, and keyboard behavior;
- laptop and desktop screens, including 1366×768 at Windows 125% and 150% scaling;
- mouse, trackpad, keyboard-only, and Chinese IME use;
- zip portable-folder and NSIS installer channels; and
- local-first operation with configured model calls as controlled processing.

## 3. Experience principles

### UX-P01 — Text before chat

The current manuscript or Editorial Deliverable owns the central canvas. A task timeline, conversation, or model result must not replace it by default.

### UX-P02 — Exact context is visible

Whenever a user starts, reviews, resumes, or authorizes work, AI7 shows the relevant Book, deliverable, branch, revision, selection, source scope, and intended outcome.

### UX-P03 — Business state before technical events

Normal users see editorial stages such as “核对引文” or “等待补充资料,” not tool calls, subagent identities, command output, context compaction, or raw provider diagnostics.

### UX-P04 — Authority is named

Task-run authorization, proposal handling, editorial review, controlled-action approval, and public-release permission use distinct Chinese labels and actions. A compact interaction may create multiple exact records, but the UI must disclose what each one means.

### UX-P05 — Evidence does not become truth by color

`引证完整性`, `陈述支持`, and `事实核验` are separate fields. No single green “已溯源” status may collapse them.

### UX-P06 — Hidden is permitted; silent is not

Technical machinery may stay out of the normal interface. Material scope, drift, degradation, uncertainty, committed actions, recovery, and future learning effects may not be hidden.

### UX-P07 — Long operations do not hold the editor hostage

Whole-manuscript search, replace, verification, indexing, import, and export run outside the UI thread, show business-readable progress, and support safe cancellation where permitted.

## 4. Functional requirements

### 4.1 Shell, navigation, and work queue

- **UX-IA-001**: The primary navigation is Book-first. A Book is not inferred from a folder or current working directory.
- **UX-IA-002**: The global work queue aggregates running work, durable clarification requests, changed plans, pending decisions, failures, and completed outcomes across Books.
- **UX-IA-003**: The work queue is a projection. Opening an item navigates to its authoritative Book, task, Workflow Instance, proposal, or receipt record.
- **UX-IA-004**: The current Book, deliverable, branch/revision, save status, and recovery status remain visible in a persistent context header.
- **UX-IA-005**: The left navigation can collapse independently from the right inspector. There is no fourth permanent panel.
- **UX-IA-006**: Global search makes the search scope explicit: local instance, current Book, current manuscript, or selected sources.
- **UX-IA-007**: `Editorial Review / 编辑审读` and `Review Article / 评论文章` use visibly different navigation labels.

### 4.2 Book, Series, and deliverables

- **UX-BOOK-001**: A Book overview exposes the manuscript plus its Promotion Article, News Report, and Review Article deliverables without pretending they share one phase.
- **UX-BOOK-002**: Series membership and Series retrieval are explicit. Series is not rendered as an ordinary folder hierarchy.
- **UX-BOOK-003**: Cross-project source scope is selected for a task; it is not a standing global workspace.
- **UX-BOOK-004**: Every imported source and generated deliverable has a reachable record, provenance, version, and export path inside the product.
- **UX-BOOK-005**: Recent Books and pinned Books are convenience views and never alter source or mutation authority.

### 4.3 Import and document fidelity

- **UX-IMP-001**: Import uses a user-selected file picker and does not expose agent filesystem access.
- **UX-IMP-002**: Before commit, the import report classifies inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and round-trip behavior as preserved, degraded with disclosure, or rejected.
- **UX-IMP-003**: Silent loss is a blocking failure. A user may proceed only after seeing and accepting disclosed degradation for the named workflow.
- **UX-IMP-004**: Import records the source identity, import time, format, detected structure, and resulting Manuscript Revision.
- **UX-IMP-005**: Reimport never silently remaps ambiguous structural identities; ambiguity is shown for resolution.

### 4.4 Long-manuscript editor

- **UX-ED-001**: The editor presents a centered continuous manuscript surface with stable Chinese line length and windowed content loading.
- **UX-ED-002**: The interface never claims or visually implies that the complete manuscript is resident in the renderer.
- **UX-ED-003**: Outline, full-text find, replace, and indexed jump operate across the whole manuscript, not merely the loaded window.
- **UX-ED-004**: Exact Unicode range selection works with Chinese IME, punctuation, clipboard, keyboard navigation, comments, findings, quotations, Task Intents, proposals, and Effects.
- **UX-ED-005**: The editor supports durable undo/redo, autosave acknowledgment, explicit 稿件修订检查点, and crash recovery.
- **UX-ED-006**: “已写入修订日志” appears only after 修订日志 persistence. It is distinct from “已建立稿件修订检查点.”
- **UX-ED-007**: Recovery shows whether content is recovered working state, a 稿件修订检查点, or a Recovery Snapshot. Restoring creates a new descendant rather than rewriting history.
- **UX-ED-008**: Whole-manuscript operations show progress and cancellation while ordinary editing remains responsive.
- **UX-ED-009**: The outline and global position indicator express whole-manuscript position when the scroll thumb represents only the loaded window.

### 4.5 Task capture, preflight, and authorization

- **UX-TASK-001**: A lightweight bottom entry starts an editing task without obscuring the manuscript. Drafting the task expands the right inspector.
- **UX-TASK-002**: Natural-language input is combined with a Task Skill template; neither free chat nor a mandatory wizard is the only path.
- **UX-TASK-003**: Before execution, the user sees target Book/deliverable/revision/selection, source scope, Editorial Dimensions, expected outcome, provider-processing summary, outbound-data category, budget, and possible governed Effects.
- **UX-TASK-004**: Plan Preview is always reachable and is not presented as authorization itself.
- **UX-TASK-005**: Run Authorization names the exact task and plan boundary. It never implies proposal application, editorial review, public release, or Effect completion.
- **UX-TASK-006**: Expanding source, provider, outbound-data, budget, capability, expected outcome, or Effect class suspends the task and presents a Plan Revision.
- **UX-TASK-007**: Permitted Plan Adaptations remain available as an expandable actual-versus-planned record without interrupting ordinary work.

### 4.6 Running work and continuation

- **UX-RUN-001**: Running work uses editorially meaningful phases, current object, next step, and wait reason.
- **UX-RUN-002**: Users can continue editing and can switch Books while independent Runs continue.
- **UX-RUN-003**: Pause and cancel are separate. Cancellation explains that committed Effects are not rolled back.
- **UX-RUN-004**: Clarification Requests are durable, reopenable, and bound to the exact ambiguity and task state.
- **UX-RUN-005**: Resume, Retry, Redo, and Replay use their preferred Chinese labels and explain their distinct consequences.
- **UX-RUN-006**: An ambiguous external outcome blocks automatic retry or fallback and directs the user to reconciliation evidence.
- **UX-RUN-007**: Raw model thinking, secret values, full tool payloads, and unpublished manuscript excerpts are not copied into the global queue or notifications.

### 4.7 Evidence, review, and factual verification

- **UX-EVD-001**: Every Evidence Link opens the exact source or manuscript revision and highlights the exact range.
- **UX-EVD-002**: Evidence cards show source identity, exact 源材料版本 or 稿件修订版, evidence role, quoted range, provenance, freshness, and whether Exact Fetch succeeded.
- **UX-EVD-003**: `引证完整性`, `陈述支持`, and `事实核验` are simultaneously visible where a factual decision is made.
- **UX-EVD-004**: The `事实核验` outcomes `证据支持` (`supported`), `证据反驳` (`contradicted`), `证据冲突` (`conflicting`), `尚未解决` (`unresolved`), and `不适用` (`not-applicable`) remain distinct.
- **UX-EVD-005**: Foundation Model knowledge is labeled as a research lead, never as factual evidence.
- **UX-EVD-006**: Editorial interpretation is labeled as professional judgment with rationale and relevant passages, not objective proof.
- **UX-EVD-007**: An unresolved finding can become an editor/author query or remain unresolved; the interface must not force a rewrite.

### 4.8 Proposal review, application, and conflicts

- **UX-PROP-001**: Generated text changes first appear on a 提案分支（Proposal Branch） and never silently alter active text.
- **UX-PROP-002**: Small changes default to inline review; large or structural changes can switch to base/current/proposal comparison.
- **UX-PROP-003**: Review supports accept, accept with editor changes, selective use, retain as alternative, redo, reject, and defer where applicable.
- **UX-PROP-004**: Proposal Decision and application status remain separate even when one “接受并应用” interaction creates both exact records.
- **UX-PROP-005**: Application success is shown only after an Effect Receipt or classified reconciliation evidence exists.
- **UX-PROP-006**: Drift displays the proposal pin and current target pin before the user acts.
- **UX-PROP-007**: Same-block competing edits, edit/delete, interacting moves, and structural ambiguity enter explicit conflict resolution with no partial apply.
- **UX-PROP-008**: A model-composed conflict resolution remains a proposal.

### 4.9 Deliverable workflows and delivery

- **UX-WF-001**: Each deliverable shows its exact Workflow Profile version and independent Workflow Instance.
- **UX-WF-002**: Phases show not started, active, waiting, completed, skipped with reason, and reopened. They are not reduced to one Book percentage.
- **UX-WF-003**: The 工作关口 surface identifies required evidence, missing evidence, drift, Review Decision, and signoff status.
- **UX-WF-004**: Editorial Artifacts show stable type, version, provenance, pins, status, decisions, receipts, and supersession.
- **UX-WF-005**: Signoff, external export, and Public Release Permission are different interactions.
- **UX-WF-006**: A Delivery Package exposes exact deliverable version, included artifacts, signoffs, destination, permissions, missing requirements, and final receipts.
- **UX-WF-007**: Workflow completion or signoff never displays factual, legal, regulatory, learning, or public-release authority that it does not hold.

### 4.10 Feedback, quality, learning, and audit

- **UX-LEARN-001**: Result feedback is optional and non-blocking.
- **UX-LEARN-002**: Accept, reject, and edit feedback offers two or three relevant reasons, pre-selects none, and records guessed-reason acceptance versus correction.
- **UX-LEARN-003**: Result feedback, Learning Material eligibility, Memory Candidate review, and audit remediation are separate decisions.
- **UX-LEARN-004**: A Learning Material decision shows the material, Book/Series/House scope, immediate action, possible future effect, and any explicit override.
- **UX-LEARN-005**: Learning Audit supports forward tracing from material to memory use and backward tracing from a result to all influencing material.
- **UX-LEARN-006**: Exclusion or forgetting previews affected memory, running tasks, and historical markers without implying deletion of original editorial evidence.
- **UX-LEARN-007**: Quality views pair delivery quality with workload displacement and never substitute acceptance rate alone.
- **UX-LEARN-008**: Per-task time tracking is absent.
- **UX-LEARN-009**: Policy Documents remain hidden developer-reviewed assets; the editorial UI exposes no Policy Document identity, authoring, revision, or activation control.

### 4.11 Settings and onboarding

- **UX-SET-001**: First run locates the data root and explains portable-folder or installer behavior without requiring path literacy.
- **UX-SET-002**: An unwritable portable location can fall back to `%LOCALAPPDATA%\AI7` with a plain notice.
- **UX-SET-003**: Placement beneath a known sync/backup root produces a clear non-blocking unpublished-material warning.
- **UX-SET-004**: Credentials are configured through named provider connections; secret values never appear in task prompts, results, diagnostics, or the portable folder.
- **UX-SET-005**: Provider settings explain processing policy and outbound category without implying Public Release Permission.
- **UX-SET-006**: Editorial Dimensions and Editorial Profiles are user-manageable with stable identities, version history, prospective changes, and archive-not-delete behavior.
- **UX-SET-007**: Workflow Profile configuration distinguishes reusable profile editing from one deliverable's active Workflow Instance.
- **UX-SET-008**: The Editorial Capability Profile is not presented as a user-switchable security level, and no Developer Capability Profile escalation exists in the shipped UI.

## 5. Non-functional requirements

### 5.1 Scale and responsiveness

- Below 500K Chinese characters, no sensible performance degradation is visible.
- Up to 1M characters, no critical operation blocks work; long work shows progress.
- Up to 10M characters, the application remains responsive, does not exhaust memory, does not crash, and does not lose text.
- Typing latency depends on the loaded window, never total manuscript size.
- Concrete latency budgets are set by the accepted store-and-index spike, not invented in UI documentation.

### 5.2 Accessibility and Chinese input

- All essential controls are keyboard reachable with visible focus and native focus order.
- Meaning never depends only on color; status pairs text, icon/shape, and semantic color.
- Chinese IME composition is never intercepted by task shortcuts, search, or proposal actions.
- At 1366×768 and Windows 150% scaling, the manuscript remains usable with at most one expanded side panel.
- Controls, error text, and status remain legible in Windows high-contrast conditions.

### 5.3 Privacy and trust

- The interface never suggests that a configured model call is public release.
- It exposes data scope before model processing and public destination before public release.
- It never encourages storing manuscripts in repositories, hosted CI, distributable fixtures, or logs.
- Prototype and test fixtures use generated synthetic content only.

## 6. Acceptance gate

A future UI/UX package is accepted only when:

1. all requirements above map to a screen, state, component, documented non-visual behavior, or explicit deferred constraint;
2. the Figma and HTML prototypes cover every V1 region at comparable detail;
3. the owner completes an expert walkthrough with no unresolved critical semantic defect;
4. three to five professional editors can complete the defined journeys; and
5. no participant critically confuses source scope, factual status, proposal acceptance versus application success, signoff versus public release, or pause versus cancellation.

The HTML prototype demonstrates these requirements but does not prove production performance, persistence, import fidelity, sandbox enforcement, provider behavior, or ProseMirror suitability.

**Freeze-candidate status:** this candidate does not pass the package gate. Full-region HTML/Figma coverage, the owner walkthrough, and professional-editor sessions have not occurred; the Figma artifact is raw-frame reference evidence only.
