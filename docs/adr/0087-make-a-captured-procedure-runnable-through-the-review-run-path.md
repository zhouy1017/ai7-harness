---
status: accepted — the Owner decided on 2026-10-08 that a captured procedure must run in this version, and accepted this text on 2026-10-08 in the Commander session (「采纳，由你合并」), which this record names as its acceptance
date: 2026-10-08
deciders: Owner
amends: V2-UX-REUSE-003 and REUSE-005 — a captured Review Run is saved as an AI7-owned Captured Procedure, not a native DSH Skill draft (§1); REUSE-012 — its steps keep the configuration's order (§2); the interaction specification's Reusable procedure classification table; Reusable Procedure Classification Preview and Authority Ceiling in their contexts (§1, §4); journeys J-15 (Consequences)
---

# Make a captured procedure runnable through the Review Run path

On 2026-10-08, answering the questions S30 (#65) raised, the Owner decided two things. A procedure saved with `将以上工序保存为可复用工序` must be runnable in this version (「要能运行」), not only saved. A Developer Capability Proposal is kept locally and may be exported to a file; AI7 never sends it. This record decides the smallest carrier, validation and run path that make the first true without widening any authority. The Owner accepted this text on 2026-10-08.

## Context

- **REUSE-003 offers four result types**: Default Execution Rule draft, native DSH Skill draft, Workflow-definition draft, Developer Capability Proposal. None of them can run today.
- **[ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) makes the DSH Skill the canonical instruction unit**, and leaves the carriers, catalog sources, trust tiers, sidecar records and compatibility tests open (§ Deferred details). Only one native artifact is admitted, the 编辑工作区方案, and `src/service/editorial-workspace-profile.ts` CHECK-pins its identity. Nothing in AI7 loads or executes a Skill. A runnable Skill draft would need all of those choices first, and a second admitted artifact needs a table rebuild.
- **AI7 already runs configured procedures.** Each review category names its 工序, `ai7-review-procedure/<category>@1` in `src/service/review/category-configuration.ts`, with its guideline documents, output kind and executor. A Review Run snapshots the entries it selected and the configuration's digest (REV-012), and every category's Task goes through Plan and Run Authorization. 知识库 › 工序与规则 already lists these 工序 with their state and use (KB-010, S79).
- **[UI ADR 0012](../ui-ux-v2/adr/0012-extract-reusable-structure-without-instance-authority.md)** keeps instance content and authority out of a reusable asset. **[UI ADR 0013](../ui-ux-v2/adr/0013-use-latest-eligible-new-version-and-preserve-historical-pins.md)** resolves the newest enabled version for a new use and never moves a pin.

## Decision

### 1. A Captured Procedure is AI7 configuration over the Review Run executors

A **Captured Procedure** (`可复用工序`) is an AI7-owned, versioned, digest-pinned procedure document. In this version it is built only from a completed Review Run and runs only as a Review Run. It is not a DSH Skill, a second instruction format or a runtime: it selects and orders review categories AI7 already executes, and carries no prompt text of its own.

One version is one immutable document, schema `ai7.captured-procedure/1`, canonical JSON with its SHA-256:

- the editor's title — a label, never given to a model;
- `runAs: review-run`;
- its ordered steps, one per category kept from the source Run: the category id, the 工序 id and version it ran, its output kind, whether it calls a model, and whether it uses a search engine;
- one parameter slot, the review scope kind (全书 or 选定章节). The chapters are chosen at each run;
- its Authority Ceiling (§4).

The document holds nothing else. It names guideline documents by category, not by clause text or version; a run applies the house's current versions, as every Review Run does (S79a). It holds no Book, chapter, Series, manuscript text, finding, decision, authorization, receipt, plan digest, Provider, route or model. The source Book and Run stay in a separate local provenance field outside the digest (UI ADR 0012, REUSE-015).

For a completed Review Run the Classification Preview recommends this type. Native DSH Skill drafts remain the type for model-assisted work that no existing executor performs, and are deferred (§6). Anything needing new code is a Developer Capability Proposal (REUSE-007).

### 2. Capture and what makes it ineligible

`将以上工序保存为可复用工序` appears on a Review Run that was authorized and ended `已完成`, or `部分完成` with no category left to continue. The extraction preview shows `将提取什么` and `不会保存什么` (REUSE-013). The editor may remove steps, and keeps the order: a Review Run runs its categories in the configuration's order, so reordering would mean nothing. Saving creates version 1 in `待验证`, or a next version of an existing Captured Procedure, chained to the previous one by its digest.

A capture is refused, with the reason, when:

- the source is not a Review Run, or is prepared, running, waiting or still continuable;
- no category in it settled. Failed, interrupted or refused categories are left out (REUSE-019);
- a kept step's category is now `unavailable`, or the configuration's current 工序 version for it is not the one the source Run used.

### 3. Validation: `待验证` → `已启用` by an explicit editor action

`验证并启用…` opens a preview: each step with its 工序 and version, its output, whether it calls a model or a search engine, the guideline versions a run would apply today and where they differ from the source Run's, the scope slot, the Authority Ceiling, and what stays unavailable. Validation is deterministic and provider-free. It checks that:

- the document parses under its schema, has exactly its keys, and matches its digest;
- every step resolves in the current configuration at the same 工序 version, with an executor other than `unavailable`;
- the Authority Ceiling is no wider than the source Run's.

Confirming records `已启用` as an append-only state. A failed validation records its reasons and leaves the version `待验证` and inspectable (REUSE-025). Validation creates no Task, Plan, Run, Provider call or Session.

### 4. Running: the normal Plan → Run Authorization path, pinned, never automatic

`运行此工序…` in 工序与规则, or `按已保存的工序` on the 新建审阅 sheet, resolves the newest `已启用` version that still validates (UI ADR 0013, REUSE-043/044). It opens the ordinary 新建审阅 sheet with that version's steps for the current Book. The editor chooses the scope and sees each category's plan. `开始审阅` is the ordinary Review Run Authorization over every plan digest. The Review Run records the exact version and digest it ran. A later version, a 停用 or a guideline update never moves that pin, and a change before authorization is a new plan.

A step the current Book cannot take — 书系一致性 for a Book in no Series, leads without a baseline analysis — is shown with its reason and left out; the Run records which steps it left out.

**Authority Ceiling.** A version's ceiling is its steps, their executors, output kinds, model and search-engine use, and the current-Book Run Source Scope. A Run prepared from it can do nothing that choosing the same categories on 新建审阅 for that Book could not, and it inherits nothing from the source Run. Provider Processing Policy, route assignment (ADR 0080) and every Proposal Decision, Apply and Effect stay where they are. A Captured Procedure never starts by itself. No Default Execution Rule, schedule, recommendation or Background Analysis Enrollment may name one in this version.

### 5. Versions, 停用 and history

- Versions are immutable and numbered under one stable identity. A new version comes only from a new capture.
- `停用` applies to one version or to all of them, and is final for that version. A stopped version is never resolved again; to run the procedure again, the editor captures a new version. A version never enabled is discarded the same way.
- Nothing is deleted in this version. A stopped version is its own Historical Version Stub: its document stays, non-executable, and every Review Run that pinned it keeps naming it.
- A prepared Review Run whose version was stopped before authorization cannot be authorized; it is prepared again.
- 工序与规则 lists Captured Procedures apart from the built-in 工序, by title, with version, state (`已启用`, `待验证`, `已停用`, KB-010) and the Review Runs each version ran.

### 6. Developer Capability Proposal, and what stays deferred

A Developer Capability Proposal is saved locally with `保存开发建议` only (REUSE-063/064). `导出为文件…` writes it to a file the editor chooses through the platform Save dialog. It holds no Book material, so it is not an External Export Policy target. AI7 sends it nowhere and offers no submit action.

Deferred:

- native DSH Skill drafts and their carrier (ADR 0045);
- foreign Skill import and update (S33, #89);
- the Workflow-definition branch;
- catalog sources, trust tiers, sandboxing and recommendation;
- Default Execution Rules over a Captured Procedure;
- capture from any Run other than a Review Run, branches, reordering, editing a version in place, and permanent deletion (REUSE-039).

### 7. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| [V2-UX-REUSE-003](../ui-ux-v2/requirements.md) | "One capture creates exactly one result type: Default Execution Rule draft, native DSH Skill draft, Workflow-definition draft … or Developer Capability Proposal" | Adds Captured Procedure (§1); still exactly one type per capture |
| [V2-UX-REUSE-005](../ui-ux-v2/requirements.md) | AI7 recommends a native DSH Skill draft for reusable model-assisted work | Except work that existing executors perform: a completed Review Run is captured as a Captured Procedure (§1) |
| [V2-UX-REUSE-012](../ui-ux-v2/requirements.md) | "add, remove and reorder" | A Captured Procedure keeps the configuration's order (§2) |
| [Interaction specification](../ui-ux-v2/interaction-spec.md), Reusable procedure classification | Four recommended results | Adds Captured Procedure: runnable as a Review Run after `验证并启用` |
| [UI context](../ui-ux-v2/CONTEXT.md), Reusable Procedure Classification Preview | Recommends one of four results | One of five; adds the term Captured Procedure (`可复用工序`) |
| [Execution context](../domain/execution/CONTEXT.md), Authority Ceiling | For "one exact native DSH artifact revision" | Also for one Captured Procedure version (§4) |

ADR 0045 is not superseded. A Captured Procedure is not a Skill or an instruction carrier, so its rule against a second Task Skill hierarchy is untouched. Its deferred carrier choices stay deferred.

## Consequences

- **The Owner's decision holds with no new runtime.** Running a Captured Procedure prepares an ordinary Review Run. Capture, validation and the pin are new; execution, authorization and fixtures are not.
- **The data model gains additive, append-only relations** (ADR 0079 §1.1): Captured Procedures, their versions with provenance, their state events, the Review Run's procedure pin, and Developer Capability Proposals with their export events. That is one or more schema revisions and a protocol revision. `task_artifact_pins` stays the Profile's: the pin belongs to the Review Run, which already names its categories.
- **J-15 gains a capture branch.** It needs a completed Review Run, so it runs over the admitted SampleBook `sample1` under the deterministic review fixture, provider-free. The branch covers capture, validation, a run pinned in a second Book, `停用` keeping that pin, and the proposal export. Its predecessor constructor's drop list grows with the new tables. The slice's brief chooses whether to extend J-15 or the J-04 adapter it shares.
- **The clause edits of §7** land with the S30 implementation, or in this pull request if the Owner asks.
- **The price is breadth.** Only review work can be captured as runnable. A house that wants another kind of procedure waits for the Skill carrier, or records a Developer Capability Proposal.

## Rejected alternatives

- **A native DSH Skill draft as the runnable carrier.** It needs Skill loading, a carrier serialization, sidecar mapping, trust and compatibility rules, and a second admitted artifact — every choice ADR 0045 defers. It would also open a path for new instructions to reach the model.
- **Save the source Run's prompts or instructions as a recipe.** That is a second instruction format, which ADR 0045 rules out, and it could carry instance content, which UI ADR 0012 rules out.
- **Save it as a Default Execution Rule.** A rule is bound to a Book and reduces review for a pattern; it is not a procedure (REUSE-004). S75 rules cover two Task kinds only.
- **Follow the current categories without a pin.** Runs would change silently and a finished review could not name what it ran (UI ADR 0013, REV-012).
- **Pin guideline versions in the procedure.** That would conflict with S79a, under which a house's new guideline version applies to every later Review Run. The difference is disclosed instead (§3).
