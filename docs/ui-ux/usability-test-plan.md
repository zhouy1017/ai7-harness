# AI7 V1 usability test plan

Status: **V1 candidate validation reference; no usability sessions have been run or authorized on this branch**

## 1. Purpose and decision boundary

This plan validates whether one Chinese-first Windows desktop experience lets a professional literary-publishing editor complete AI7 V1 work without confusing editorial authority, evidence status, or recovery state. It evaluates the UI/UX requirements and prototypes; it does not prove production persistence, ProseMirror suitability, provider behavior, sandbox enforcement, document-conversion fidelity, or long-manuscript performance.

The study uses one primary persona throughout. It does not invent role-based access modes or secondary personas to compensate for unclear navigation.

The validation sequence is fixed:

1. the owner completes a full semantic and shell walkthrough;
2. all critical findings from that walkthrough are resolved or explicitly stop the study;
3. three to five professional editors complete moderated sessions; and
4. changed critical or major interactions are retested before the UI/UX package is accepted.

## 2. Primary persona and recruitment

### Primary persona

The recruitment baseline is one **responsible editor at a literary publishing house in mainland China** who:

- performs substantive manuscript editing or editorial review in Simplified Chinese;
- regularly handles long-form literary manuscripts and related editorial materials;
- uses Windows and a Chinese IME in daily work;
- makes or prepares decisions about corrections, author queries, review evidence, deliverables, or signoff; and
- is not recruited for expertise in language models, agent frameworks, developer tools, shells, repositories, or filesystem security.

### Stage A — owner walkthrough

The owner reviews every task and every authority-bearing state before external recruitment. The walkthrough is an expert semantic review, not a substitute for editor research. It must:

- compare all surviving shell variants and record a winner in `prototype/NOTES.md`;
- traverse every V1 region listed in the task matrix below;
- challenge Chinese labels, hidden assumptions, empty/error/recovery states, and the five critical semantic distinctions;
- exercise the reference viewport, scaling, keyboard, IME, and assistive-technology checks; and
- leave no unresolved Severity 0 finding before Stage B begins.

### Stage B — professional-editor sessions

Recruit **three to five** participants matching the primary persona. Prefer variation in publishing-house size, manuscript length, seniority, and current editing workflow while keeping the same persona and responsibility baseline. Do not recruit only AI enthusiasts or internal developers.

Each core task is completed by every participant. Secondary tasks may be rotated to control fatigue, but every secondary task must be observed with at least two participants and the complete V1 task set must be covered across the cohort.

## 3. Fixtures and data safety

All sessions use conspicuously synthetic material created for testing:

- one synthetic Book with a long Chinese manuscript, four synthetic Editorial Deliverables, sources, Workflow Instances, proposals, receipts, and learning records;
- generated Chinese corpora for long-document navigation exercises;
- synthetic DOCX files deliberately containing known preserved, degraded, and rejected features;
- deterministic provider playback with invented evidence and outcomes; and
- fake provider names and non-secret credential placeholders.

Real manuscripts, manuscript excerpts, private sample Books, manuscript-derived indexes or embeddings, real credentials, and live provider calls are prohibited. Session notes use participant codes such as `P01`; do not copy employer-confidential examples into the repository. Screen recordings, if separately consented to, remain local and are not committed.

## 4. Windows and accessibility matrix

| Configuration | Required coverage | Purpose |
| --- | --- | --- |
| Windows 11, 1366×768, 150% scaling | Owner walkthrough and at least one editor session | Minimum working viewport; manuscript remains usable with at most one expanded side panel |
| Windows 11, 1920×1080, 125% scaling | Owner walkthrough and at least one editor session | Typical desktop/laptop layout and comparison view |
| Keyboard-only pass with visible focus | Every essential task during owner walkthrough; focused pass in at least one editor session | Reachability, focus order, no traps, drawers and dialogs returning focus correctly |
| Microsoft Pinyin Chinese IME | Every text-editing task | Composition, candidate selection, punctuation, shortcuts, find, task entry, and proposal editing must not interfere |
| Windows high-contrast mode | Owner inspection over all semantic statuses | Meaning must not depend on color or low-contrast decoration |
| Windows Narrator plus keyboard | Owner inspection of navigation, task authorization, evidence, proposal, conflict, and recovery | Names, roles, state announcements, reading order, and exact target identity |

Assistive-technology inspection by the owner is a design conformance check, not a claim that the product has been validated by disabled professional editors. If that claim becomes necessary, recruit appropriate participants in a separate study.

## 5. Session protocol

### Owner walkthrough

- Duration: 120–150 minutes, with breaks.
- Method: cognitive walkthrough plus adversarial semantic review.
- Inputs: requirements, information architecture, interaction specification, visual system, and the current prototype.
- Output: chosen shell, issue log, stopped/deferred areas, and approval or rejection for editor recruitment.

### Professional-editor session

- Duration: 75–100 minutes.
- Introduction and consent: 5 minutes.
- Background and current-workflow questions: 10 minutes.
- Moderated tasks with think-aloud: 50–65 minutes.
- Critical-semantic comprehension check and debrief: 10–15 minutes.

Moderators may restate the scenario but must not teach interface labels or the intended distinction before measuring it. Record whether completion was unassisted, completed after a neutral prompt, completed only after instruction, or failed.

## 6. Task matrix

| ID | Spec scenario | Task and scenario | Required observable outcome | Coverage | Participants |
| --- | --- | --- | --- | --- | --- |
| UT-01 | J-12 | First run, data location, provider readiness, and synthetic Book creation | Understand portable/installer data behavior, react correctly to fallback or sync-root notice, configure a named synthetic provider connection, create a Book without path literacy | Onboarding, settings, data safety | Owner + all editors |
| UT-02 | J-01 | Import a deliberately complex synthetic DOCX | Review preserve/degrade/reject classifications, identify a deliberate degradation, refuse silent loss, and reach the resulting 源材料版本 and 稿件修订版 | Import fidelity and provenance | Owner + all editors |
| UT-03 | J-02, J-14 | Navigate and edit a long Chinese manuscript | Use outline, whole-manuscript find and indexed jump; edit through Chinese IME; distinguish durable 修订日志 acknowledgment from a 稿件修订检查点; recover position after window loading | Long-manuscript editing, windowing, keyboard/IME | Owner + all editors |
| UT-04 | J-03, J-09 | Start a bounded editorial task and continue editing while it runs | Bind exact selection/revision, inspect source scope and outbound category, authorize only the Run, continue editing or switch Books, then reopen the task from the global queue | Task capture, Plan Preview, parallel work | Owner + all editors |
| UT-05 | J-03, J-10 | Resolve a Clarification Request and a material Plan Revision | Distinguish clarification from authorization, identify why source/provider/budget drift suspended work, and choose pause, cancel, Resume, Retry, Redo, or Replay with the intended consequence | Continuation and failure states | Owner + at least two editors |
| UT-06 | J-04 | Verify a factual assertion and create a Correction Proposal | Read `引证完整性`, `陈述支持`, and `事实核验` independently; open exact evidence and return to the highlighted range; preserve conflicting/unresolved evidence; create rather than silently apply a correction | Primary fact-verification journey | Owner + all editors |
| UT-07 | J-05 | Review and apply the Correction Proposal | Compare inline and side-by-side forms, inspect proposal/current pins, choose a Proposal Decision, understand that “接受并应用” creates separate authority records, and recognize the Effect Receipt as completion proof | Proposal, authority, receipt, feedback | Owner + all editors |
| UT-08 | J-06, J-08 | Handle drift, same-block conflict, and recovery | Recognize stale target drift, resolve or defer a same-block conflict without partial apply, understand that an AI-composed resolution remains a proposal, and distinguish journal, checkpoint, recovered working state, and Recovery Snapshot | Conflict and recovery | Owner + all editors |
| UT-09 | J-07 | Manage one deliverable through a gate and prepare delivery | Distinguish the deliverable's Workflow Instance from the Book and other deliverables, inspect missing gate evidence, record/locate a Review Decision and signoff, prepare a Delivery Package, and distinguish signoff, export, and Public Release Permission | Workflow, artifacts, delivery | Owner + all editors |
| UT-10 | J-11 | Give feedback and inspect learning lineage | Give optional non-preselected feedback, set Book/Series/House eligibility scope, trace material forward and a result backward, preview exclusion effects, and interpret quality together with workload displacement | Feedback, learning, audit, quality | Owner + at least two editors |
| UT-11 | §12 | Configure editorial dimensions, workflow defaults, and model processing | Change prospective Editorial Profile settings without rewriting task history, distinguish Workflow Profile from Workflow Instance, inspect outbound processing categories, and confirm there is no Developer Capability Profile toggle | Settings and governance | Owner + at least two editors |
| UT-12 | J-09, J-13 | Use Book/Series navigation and the global work queue | Find a Book, distinguish its four deliverables and phases, select Series or Cross-project scope only for a task, and follow a queue item back to its authoritative record | Full IA and cross-Book work | Owner + at least two editors |

UT-06 and UT-07 are the primary end-to-end study journey. They must never be rotated out.

## 7. Metrics

### Per-task measures

- **Completion**: unassisted / neutral prompt / instructed / failed.
- **Critical semantic comprehension**: correct or incorrect for each applicable distinction.
- **First-action correctness**: whether the first committed action targets the intended Book, revision, scope, proposal, gate, or destination.
- **Navigation cost**: wrong destinations, backtracks, lost-context events, and moderator rescues.
- **Time on task**: diagnostic only; never interpreted as employee productivity or used for the product's prohibited per-task time tracking.
- **Error recovery**: whether the participant notices and safely recovers from degradation, drift, conflict, cancellation, or restored state.
- **Single Ease Question**: 1–7 after each core task, with reasons captured in the participant's words.
- **Confidence explanation**: participant explains what the system did, what remains uncertain, and what would happen next.

### Cross-session measures

- core-task unassisted completion rate;
- rate and type of critical semantic misunderstandings;
- evidence-jump success to the exact revision and range;
- proposal-decision versus application-proof accuracy;
- frequency with which background work interrupts or displaces editing;
- detection rate for deliberate import degradation;
- keyboard reachability, focus defects, IME corruption, and assistive-technology labeling defects; and
- repeated finding count by task, viewport, and severity.

## 8. Five critical semantic checks

After the applicable task, ask the participant to explain the distinction in their own words without displaying the desired answer:

1. current Run Source Scope versus every source AI7 could theoretically access;
2. `引证完整性` versus `陈述支持` versus `事实核验`;
3. accepting a Proposal versus receiving proof that application completed;
4. Workflow signoff or export versus Public Release Permission; and
5. pause versus cancellation, including the fact that cancellation does not roll back committed Effects.

Any incorrect answer that could cause unintended disclosure, mutation, factual misrepresentation, or loss of work is a Severity 0 semantic misunderstanding.

## 9. Finding severity

| Severity | Definition | Examples | Required disposition |
| --- | --- | --- | --- |
| **S0 — critical** | Could cause silent text loss, unauthorized scope/public release, wrong authoritative mutation, false factual certainty, or belief that an uncommitted action completed | Confusing signoff with release; treating green citation as factual truth; believing accepted proposal was already applied | Stop affected testing; redesign; owner retest; no open S0 at either gate |
| **S1 — major** | Blocks or materially misdirects a core task with no reasonable self-recovery | Cannot return from evidence to text; cannot find conflict resolution; IME makes proposal editing unusable | Fix before acceptance and retest with the owner plus affected users where possible |
| **S2 — moderate** | Causes delay, repeated backtracking, or avoidable uncertainty but has a workable recovery | Scope label is found only after searching; status wording needs rereading | Fix or record an owned V1 follow-up with rationale |
| **S3 — minor** | Cosmetic, polish, or low-frequency friction with no semantic risk | Alignment, spacing, noncritical truncation | May enter normal design backlog |

Every finding records task, participant code, environment, exact screen/state, observed behavior, expected requirement, severity, evidence, and proposed retest.

## 10. Acceptance gates

### Gate A — permission to recruit editors

- owner walkthrough covers UT-01 through UT-12;
- a shell direction is recorded rather than inferred;
- zero unresolved S0 findings;
- no known keyboard trap or Chinese IME corruption in the core journey; and
- any unimplemented prototype state is disclosed rather than simulated as complete.

### Gate B — UI/UX package acceptance

- three to five qualifying professional editors have participated;
- **zero critical semantic misunderstandings** across the five checks;
- every participant completes UT-03, UT-04, UT-06, UT-07, UT-08, and UT-09, with at least 80% of those attempts unassisted;
- every secondary task is observed with at least two participants;
- no repeated S1 finding remains unresolved;
- median Single Ease Question score for each core task is at least 5/7;
- deliberate import degradation is detected before commit in every observed UT-02 attempt;
- exact evidence navigation succeeds in every observed UT-06 attempt;
- keyboard-only, 125–150% scaling, high contrast, Narrator, and Chinese IME checks have no unresolved S0 or S1 defect; and
- all fixes affecting authority, evidence, mutation, recovery, or public release are retested.

Failure of a gate means revise and retest. It does not authorize reducing a domain safeguard, calling an unsupported state successful, or adding Word integration.

## 11. Reporting

The study report must state what was actually tested, prototype version, dates, participant count and qualification, environment assignment, task coverage, findings, design changes, and retest status. Separate observed evidence from researcher inference.

Until sessions occur, this document and `traceability.md` must continue to say **planned**, **not run**, or **not verified**. Empty participant slots, expected outcomes, and acceptance thresholds are not evidence that user validation has happened.
