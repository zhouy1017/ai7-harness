---
status: accepted — the Owner decided on 2026-10-13 (DECISIONS-1.0.0 rows 6 and 21, quoted in Context), and the Owner's standing authorization of 2026-10-14 admits recording those decisions as accepted ADR text, which this record names as its acceptance
date: 2026-10-17
deciders: Owner
amends: ADR 0087 §1 ("carries no prompt text of its own", for the new Custom Analysis Dimension document type only), §4 (the recommendation exclusion; the `current-book` pin of the Authority Ceiling) and §6 (the deferrals of foreign Skill import and update, and of recommendation); ADR 0045 (Issue #88 narrowing, Foreign Skill import, Update and rollback, Staged admission — admitted for a locally imported Skill; its single-instruction-unit principle for one bounded document type); requirements REUSE-021 to 028, 032 to 035 and TASK-010 to 016 (admitted, text unchanged); UI ADR 0016 (its foreign-Skill staging becomes buildable)
---

# 0090 · Admit 工序推荐, foreign Skill import and update, and the Custom Analysis Dimension

On 2026-10-13 the Owner answered the open questions of the 1.0.0 scope with two decisions that [ADR 0087](./0087-make-a-captured-procedure-runnable-through-the-review-run-path.md) and [ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) had kept out. This record writes them down as accepted design truth, so the wave-10 slices build against ADR text and not against a decisions file outside the repository. It decides no code, schema, protocol or policy byte and changes no requirement text.

## Context

The Owner's decisions, quoted verbatim:

- **Row 6** — 「ADR 0087 §6 延期的工序能力 | 纳入：Skill 获取/导入/验证（REUSE-021~028）、工序推荐（TASK-010~016）；工作流定义分支（REUSE-055~062）与目录/信任层级/沙箱继续延期 | 与 #89 同一波；延期项写入范围记录」
- **Row 21** — 「分析类型扩展（story 145） | 用户自定义类型经工序实现：在 工序与规则 定义按单元覆盖的自定义问题模板，结果进分析页「自定义」标签；插件类型 1.0.0 外 | 新 Issue：「[1.0-Analysis] 自定义分析维度（工序驱动）」，T3」

What stood in the way:

- **ADR 0087 §4** ends with "No Default Execution Rule, schedule, recommendation or Background Analysis Enrollment may name one in this version", and its §6 defers "foreign Skill import and update (S33, #89)" and "catalog sources, trust tiers, sandboxing and recommendation". TASK-010 to 016 specify the recommendation; REUSE-021 to 028 specify import and validation.
- **ADR 0045's Issue #88 paragraph** admits exactly one bundled-local-directory carrier and expressly grants "no generic catalog-source interface, file-picker import, network fetch, Plugin discovery, dependency installation, update checking, reconciliation, Artifact Update Rule or `latest` movement". Its § Foreign Skill import and § Update and rollback describe the model, but that paragraph kept it unreachable.
- **ADR 0087 §1** makes a Captured Procedure carry "no prompt text of its own", and ADR 0045 keeps one instruction unit, the DSH Skill. Product story 145 asks for "user-defined analysis kinds" beside the baseline analysis contract, which an editor can only define by writing a question.
- **ADR 0087 §4** pins a Captured Procedure's Authority Ceiling to the current-Book Run Source Scope. [ADR 0002](./0002-book-series-cross-project-and-house-learning-scopes.md) and [ADR 0037](./0037-enforce-versioned-series-retrieval-exclusions-immediately.md) already define when Series knowledge may be read and how exclusions bind it.

## Decision

### 1. 工序推荐 is admitted

*Amends ADR 0087 §4 ("No … recommendation … may name one in this version") and the "recommendation" deferral of §6; admits TASK-010 to 016.*

AI7 may recommend an enabled procedure for a Task Intent Draft: one when fit is clear, or two to three unselected candidates when the fit is materially ambiguous, chosen by scope kind and Task kind (TASK-011). A candidate is a Captured Procedure that is `已启用` and still validates, or, when one exists, an imported Skill revision that is enabled and runnable (§2). Each candidate shows its professional purpose, kind and exact revision, why it matched, required inputs and the Proposal and Effect classes it could produce. When none fits, AI7 states `暂无适合的可用工序` and offers intent revision or browsing; it never falls back to unbounded generic chat (TASK-015).

A recommendation or selection is not acquisition, validation, scoped enablement, per-Run activation, Capability Grant, Provider Binding, Run Authorization, Background Analysis Enrollment or Effect Approval (TASK-013). A selected procedure runs only through the ordinary Plan → Run Authorization path with its exact version pinned (ADR 0087 §4, UI ADR 0013). A material goal change marks the recommendation as needing update and never swaps the selected revision silently (TASK-014).

*Kept:* a Captured Procedure still never starts by itself, and no Default Execution Rule, schedule or Background Analysis Enrollment names one on this ADR's authority. What §4's sentence loses is only the word "recommendation".

### 2. Foreign DSH Skill import from a local file is admitted

*Amends ADR 0045's Issue #88 narrowing (the exclusion of file-picker import) and ADR 0087 §6 ("foreign Skill import and update (S33, #89)"); admits REUSE-021 to 028 and ADR 0045 § Foreign Skill import.*

The editor may bring a Claude-, Codex- or other Agent-Skill file or folder from the local disk into 知识库 › 工序与规则, through the platform file dialog.

- **Acquisition discloses before it keeps**: exact native identity, kind, version or source revision, provenance, license and notices, content digest and source (REUSE-021). Acquisition executes nothing and implies no compatibility, trust, install or enablement.
- **Import preserves the ADR 0045 records**: an immutable Source Skill Snapshot of the original files, a minimally derived, versioned DSH-native Imported Skill Working Revision with its own identity and digest, and the separate AI7 compatibility/authority sidecar. A reviewable conversion report distinguishes preserved, deterministically mapped, review-required and unsupported elements; unsupported or uncertain behavior stays blocked (REUSE-022, ADR 0045 § Foreign Skill import). Editing, conversion or repair makes a successor revision and rewrites neither the snapshot nor a prior revision. Import alone neither installs nor enables the revision and executes no artifact code.
- **Validation and conversion are distinct provider-free stages** before scoped enablement and dispatch nothing as a Task or Provider call (REUSE-023). A rejected or failed revision stays inspectable with its reasons (REUSE-025).
- **No self-authority**: the importer, converter, validator, source artifact or authoring Run never installs, enables, approves or activates itself, and its status is not independent authority evidence (REUSE-024).
- **Install may finish disabled.** Before scoped enablement AI7 shows the exact revision and the authority ceiling — requested Capabilities, eligible scope kinds, Model Roles and Provider needs, possible Effect classes, and what stays unavailable (REUSE-026, 027). Enablement permits only future exact Tasks to request authority within that ceiling and creates no per-Run activation, Run Source Scope, Provider permission, Enrollment, Run Authorization, Grant, Effect Approval, decision or Apply (REUSE-028). Lifecycle hooks, dependency scripts or native code stay `受限` (REUSE-026).

*Kept — the version's boundary:* no network fetch, no catalog, no executor. An imported Skill revision is inert: `待验证 → 已安装（未启用）→ 已启用`, listed in 工序与规则, and runnable and recommendable only once a Skill executor exists. This ADR chooses no Skill carrier or executor, so an enabled revision cannot yet run (TODO: Skill carrier and executor, catalog sources, trust tiers, sandboxing). The Issue #88 allowlist for `@ai7/editorial-workspace-profile@1.0.0` is unchanged: its exact bytes, digest and one-revision rule stay, and this ADR makes that carrier neither an update path nor a trust tier. Plugins, core DSH packages and code-bearing artifacts are not admitted.

### 3. Foreign Skill update reconciliation and the Artifact Update Rule are admitted

*Same narrowing; admits ADR 0045 § Update and rollback and REUSE-032 to 035.*

- Each upstream change of an imported Skill is a new immutable Source Skill Snapshot. Reconciliation compares the prior snapshot, the current working revision and the new snapshot, keeps local derivations, surfaces every conflict, validator failure and authority change, and produces an inert, attributed update candidate that changes nothing by itself (REUSE-032, 033).
- The working revision changes only by explicit reviewed adoption, or through one distinct, revocable **Artifact Update Rule** limited exactly as ADR 0045 states: one selected trusted source; conflict-free, validator-clean, semantically and operationally non-expansive imported-Skill changes only. It never applies to Plugins, core DSH dependencies, Policy Documents, authority expansion or unresolved conflicts, and new scripts, dependencies, tools, network use, Provider or data scope, permissions, host behavior, analysis contracts, schemas, reducers, budgets or schedules always return to review (REUSE-034).
- Automatic checking reads configured-source metadata only and sends no Book content. With no network in this version (§2), a configured source is a local one; which local sources exist is a choice for the implementing brief within that limit.
- Adoption appends working-revision and sidecar history. Existing Runs, rules and Workflow Instances keep their exact pins. Rollback restores exact revisions only, creates a new current selection without rewriting history, and never restores a revoked grant, Default Execution Rule, Artifact Update Rule, Enrollment or Run authority or bypasses current validation or policy (REUSE-035).

### 4. A Custom Analysis Dimension is admitted

*Amends ADR 0087 §1 ("carries no prompt text of its own") for this new document type only, and ADR 0045's single-instruction-unit principle for it; admits row 21 and serves product story 145. Under [ADR 0095 §1](./0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#1-every-task-is-one-run-of-a-procedure) the dimension is one instruction form of a 分块审读 stage of a procedure, and its bounded-template rule becomes the rule for the editor's 编辑任务说明.*

A **Custom Analysis Dimension** (`自定义分析维度`) is an AI7-owned, versioned, digest-pinned document, schema `ai7.custom-analysis-dimension/1`, defined by the editor in 知识库 › 工序与规则. One version is one immutable document of:

- the editor's title;
- one bounded, editor-authored per-unit question template — the bounds are set by the policy successor;
- an AI7-fixed result schema: per-unit answer rows, each with its anchor;
- an Authority Ceiling: the current-Book Run Source Scope, no mutation and no tools.

It runs as the analysis kind family `custom-analysis/<dimension-id>` through the ordinary ②A Plan → Run Authorization path, covers the Book's units, and its results appear under a `自定义` tab of the analysis page. Versions follow ADR 0087 §5's rules (immutable, `停用`, no deletion).

*Why this is not a second instruction format:* the template is a bounded data parameter of an AI7-fixed analysis contract, like a review guideline document. It has no tools, scripts, permissions, carrier or runtime, and cannot widen its ceiling. It is not a DSH Skill, not a review category and not a Plugin kind. A Captured Procedure still carries no prompt text.

*Kept:* Provider transmission of the template text requires a policy rule admitting the outbound category `editor-authored-question-template`, which the wave-10 policy successor (v22/v23/set v15) adds; until that rule is active nothing is sent. Plugin analysis kinds stay outside 1.0.0 (TODO: Plugin kinds).

### 5. A Captured Procedure version may carry a Series run-source scope

*Amends ADR 0087 §4 (Authority Ceiling and the `current-book` pin).*

The document successor `ai7.captured-procedure/2` adds `authorityCeiling.runSourceScope: 'current-book' | 'series'`. A `series` scope is honoured only for a step whose policy rule admits Series knowledge, and only over the pinned Series scope that the Run freezes ([ADR 0002](./0002-book-series-cross-project-and-house-learning-scopes.md)). A Series Retrieval Exclusion that has taken effect still refuses the read immediately ([ADR 0037](./0037-enforce-versioned-series-retrieval-exclusions-immediately.md)). Existing `/1` versions keep `current-book` and are not rewritten.

*Kept:* a version with a `series` scope is a new version from a new capture; no version widens its ceiling in place, and a Run can do nothing that choosing the same categories on 新建审阅 could not.

### 6. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| [ADR 0087](./0087-make-a-captured-procedure-runnable-through-the-review-run-path.md) §1 | A Captured Procedure carries no prompt text of its own | Unchanged for it; the Custom Analysis Dimension is a separate document type with a bounded template (§4) |
| ADR 0087 §4 | "No … recommendation … may name one in this version"; ceiling pinned to `current-book` | Recommendation admitted (§1); `/2` adds the `series` scope kind (§5) |
| ADR 0087 §6 | Foreign Skill import and update, and recommendation, deferred | Import, update and recommendation admitted (§1–§3); catalog sources, trust tiers, sandboxing, the Workflow-definition branch (REUSE-055 to 062), Default Execution Rules over a Captured Procedure and permanent deletion stay deferred |
| [ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) Issue #88 narrowing | No file-picker import, update checking, reconciliation or Artifact Update Rule | Admitted for a locally imported Skill only (§2, §3); the #88 carrier allowlist is untouched |
| ADR 0045 § Foreign Skill import; § Update and rollback; § Staged admission | Model described, not reachable | Reachable for a local file, inert until an executor exists |
| ADR 0045 single instruction unit | The DSH Skill is the only semantic instruction unit | Plus one bounded AI7 document, the Custom Analysis Dimension template (§4) |
| REUSE-021 to 028, 032 to 035; TASK-010 to 016 | Specified, not buildable | Admitted; text unchanged |
| [UI ADR 0016](../ui-ux-v2/adr/0016-stage-dsh-artifact-acquisition-enablement-run-and-apply.md) | Stages acquisition, validation, enablement, Run and Apply | Applies to a local import; no executable admission |

ADR 0045 and ADR 0087 are not superseded; each gains an "Amended by" pointer to this record.

## Consequences

These are obligations for the implementing slices, not claims of delivered runtime behavior. This documentation-only slice changes no runtime, schema, protocol or policy bytes.

- **Wave-10 slices 7a, 7b, 7c, 7d and 7f build against this text.** Their briefs own the exact surfaces, schema, protocol and Journey changes, and the policy successor v22/v23/set v15 owns the `editor-authored-question-template` category and the template bounds. The Custom Analysis Dimension is the Owner's new Issue 「[1.0-Analysis] 自定义分析维度（工序驱动）」, class T3.
- **The data model gains additive, append-only relations** (ADR 0079 §1.1) for Source Skill Snapshots, Imported Skill Working Revisions, conversion reports, update candidates and rules, and Custom Analysis Dimension versions. `ai7.captured-procedure/2` is a new document schema beside `/1`.
- **An imported Skill can be installed and enabled but not run**, and the Task Drawer cannot recommend it, until a Skill executor exists. The product states this plainly instead of offering a button that does nothing.
- **The Owner's deferrals are recorded as scope, not forgotten** (row 6): the Skill carrier and executor, catalog sources, trust tiers, sandboxing, the Workflow-definition branch, Plugin analysis kinds, Default Execution Rules over a Captured Procedure and permanent deletion (REUSE-039).
- **The price is that import is ahead of execution.** An editor can keep and review a foreign Skill in 1.0.0 with its provenance, and gains nothing runnable from it until the executor decision.

## Rejected alternatives

- **Leave the decisions in the Owner's decisions file.** It is outside the repository; slices would rely on a record no agent can read at the intended target (design authority § Authority ladder).
- **Run an imported Skill through the Review Run executors.** That would make an imported instruction reach a model without a carrier, trust or sandbox decision; ADR 0045 and ADR 0087 §6 reject exactly that.
- **Implement the Custom Analysis Dimension as a DSH Skill or review category.** A Skill needs the deferred carrier and executor; a review category belongs to the fixed Review Run configuration and would give editor text a path into review guidelines.
- **Let a Captured Procedure widen its ceiling in place to `series`.** That would move a pin ADR 0087 §5 makes immutable; a new document version is the only path.
- **Admit network fetch or a catalog with import.** The Owner continued their deferral (row 6); the version imports from a local file only.
