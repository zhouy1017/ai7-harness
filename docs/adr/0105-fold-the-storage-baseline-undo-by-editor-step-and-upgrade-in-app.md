---
status: accepted
date: 2026-11-18
deciders: Owner
amends: ADR 0006 (version restore as an editor step); ADR 0077 §3 and ADR 0079 §1.1, §1.3 (Data Version 2, the in-app upgrade and its rollback); the import refusal of older Data Version packages; ADR 0096 §1 (the drift rule for split and join); UI ADR 0003 (Ctrl+Z dispatches the governed reversal); V2-UX-ED-044; the R5 row of the #1458 plan (which `RAISE(ABORT)` triggers are removed)
decides: the R5 details left open by the Owner's D3 and D7 of #1458
---

# 0105 · Fold the storage baseline, undo by editor step, and upgrade in the app

## Context

The Owner's decision D3 ([#1458](https://github.com/zhouy1017/ai7-harness/issues/1458#issuecomment-6818574586), 2026-11-12) allows the store to be folded when a database upgrade tool is provided: 「延续约定不是强制，可以在提供数据库升级工具的前提下升级」. D7 ([#1458](https://github.com/zhouy1017/ai7-harness/issues/1458), 2026-11-14) decides that per-step undo of edits made before the upgrade is not carried: 「不保留」. Round [#1540](https://github.com/zhouy1017/ai7-harness/issues/1540) (R5 → 0.8.0 Alpha) asks for:

- trustworthy undo;
- a real version list with restore;
- faster structural edits on large manuscripts;
- an upgrade that loses nothing.

The storage design for R5 was cut in [#1555](https://github.com/zhouy1017/ai7-harness/issues/1555). It was reviewed blind twice and revised three times. Its final record (revision 1d) is posted on #1540 as comments [6949429331](https://github.com/zhouy1017/ai7-harness/issues/1540#issuecomment-6949429331) and [6949430961](https://github.com/zhouy1017/ai7-harness/issues/1540#issuecomment-6949430961). That record holds the evidence and the per-slice code guides at `dev@790acbcb`. This ADR carries its decisions.

The record listed 13 decisions for the Owner, each with a recommendation. On 2026-11-18 the Owner answered 「R5按照推荐」, recorded on #1540 as comment [6975379870](https://github.com/zhouy1017/ai7-harness/issues/1540#issuecomment-6975379870). Every item below therefore stands as recommended.

What the store does today (schema 116, Data Version 1, at `dev@790acbcb`):

- **Undo skips every Apply.** An accepted suggestion, replace-all and an AI edit are therefore outside Ctrl+Z.
- **Replace-all and AI edits are many steps.** They write one Apply per occurrence.
- **The review page's batch undo lives in page memory.**
- **Split and join break a card's undo.** They mark every moved 修改建议 as drifted, which disables its 撤销本次修改.
- **Restore is crash recovery only.**
- **Opening runs a long chain.** It makes 91 schema-initializer calls (94 initializers in 69 files).
- **Each split or join rewrites every later row** of the working blocks, the outline and the offset index.

## Decision

### 1 · Undo is an editor step

Every editor action writes one **editor step** in its existing transaction: typing, style, split, merge, replace, accept, a batch accept, replace-all, an AI edit, a card's 撤销本次修改, an in-place revision decision, and a version restore.

**What a step records.**
- The command groups it wrote, or the proposal items it applied.
- The Apply Effects it **owns**, by generation.
- For a restore, the mark anchors before and after.

**What Ctrl+Z does.**
- Ctrl+Z takes back the newest step as **one** transaction, whatever its kind. Redo replays the oldest undone step.
- Text steps replay their command groups. Apply steps write the governed reversal through the existing Effect path (UI ADR 0003 kept: receipts are never rewritten). The reversal is recorded with its own interaction value, `undo-step` or `redo-step`, never `confirm-reverse-apply`, because no confirmation is shown.
- A step reverses or re-applies only Effects of its own current generation. Undoing a card's 撤销本次修改 re-applies the item; that re-apply becomes a new generation of the **accepting** step. So accept → 撤销本次修改 → Ctrl+Z → Ctrl+Z returns to the original text, and no step consumes an Apply it does not own.
- Redo of an accept-with-edit re-applies the edited text.
- Only a **new** editor step supersedes undone steps. A dispatch made by undo or redo supersedes nothing.

**When a step can no longer be undone.** If its words changed afterwards:
- nothing is written;
- the answer names the place;
- the step is set aside (`kept`);
- the next Ctrl+Z moves on to the step before. The undo stack never wedges.

**What the editor sees (Owner items 7, 8).**
- Ctrl+Z undoes an accepted suggestion directly, without a confirmation, and says where: 「已撤销：接受修改建议（第 312 段）」.
- Replace-all and an AI edit undo as one step; each card stays individually undoable.
- Undo history survives a restart. The review page's 「撤销本批应用」 is a step, so it also works after leaving the page or restarting.
- Creating, editing or removing a 批注 / 备注 / highlight is not a step. Imports and reimports are not undone; a reimport supersedes all steps.
- Undoing the largest step (a 2,000-place replace-all on a 46,000-paragraph manuscript) holds the write lock for at most 2 s, measured on a test guest; the screen shows a busy status meanwhile.

### 2 · Split and join keep a mark's undo

- **Moved whole:** a mark that moves whole with its words, and whose words did not change, keeps its anchor state across 分段 and 合段.
- **Cut through:** a mark the caret cuts through becomes drifted, and so does a point mark exactly at the caret.
- **Moved targets:** reversing an Apply accepts a target that moved, when the original block reaches it through block lineage, whatever the status of the command groups.
- **Touching pair from different paragraphs:** two touching reversal targets that came from different original paragraphs are refused, not reordered.

### 3 · Restore a version

The version list in 工作概览 holds milestones, saved revisions and publication versions, each with 查看 and 导出为 DOCX.

**恢复到此版本 runs in one transaction (Owner items 9, 13):**
1. Save the current text as 「恢复前自动保存」.
2. Store the mark anchors.
3. Replace the working state from the chosen revision, with the code crash recovery uses.
4. Re-resolve marks:
   - a mark in an unchanged paragraph keeps its anchor;
   - a mark whose words are gone from a surviving paragraph becomes drifted;
   - only a mark whose paragraph is gone is detached.
5. Record a `restore` step. Changes made before the restore can no longer be undone step by step, only by restoring a version again.

**Ctrl+Z after a restore** puts back the auto-saved text and the mark positions, but only after checking that the whole post-restore state still stands. If a later change still stands, it is refused like any blocked step. It restores anchors only, never a mark's status, so a decision made after the restore stays.

### 4 · One baseline: revision 117, Data Version 2

**The baseline.**
- One creation path, `createBaselineSchema`, builds the store from the final-shape definitions at **revision 117**. Every predecessor shape and initializer is deleted.
- Revision 117 is classed `breaking`, so the store becomes **Data Version 2** (Owner item 10, under ADR 0079 §1.1). An older AI7 refuses to open it.
- 0.7.4 adds no schema revision; 117 is R5's only new revision. Later additive revisions are small steps from 117, not a new chain.

**Creation and conversion differ.**
- An empty data root gets the baseline and its first `store_versions` row.
- A converted store gets the baseline and the old store's rows. Its Data Version 2 row is appended only at the switch.

**Opening.**
- Every Data Version 1 store goes through the upgrade tool (§5).
- The fold never lands on the integration branch without a working converter: R5-2 through R5-6 travel as one train (§7).

**Triggers.** All 408 `RAISE(ABORT)` triggers of a schema-115/116 store stay. They are counted on the admitted SampleBook fixture; schema 116 adds none.

| Kind | Triggers | Reason to keep |
| --- | --- | --- |
| Append-only ledgers | 382 | Now emitted by one helper. No R5 write path updates or deletes a ledger row. |
| Insert-time invariant guards | 12 | They reject only illegal transitions. |
| Import abandonment-cleanup fence (12 blockers + 2 validators) | 14 | They fence writers that the cleanup code cannot fence. |

This narrows the R5 row of the #1458 plan, 「移除阻碍正常更新的过程级 RAISE(ABORT) 触发器」: the cleanup fence does not block a normal update, and its only cost, the drop and re-create in every table rebuild, disappears with the fold.

### 5 · The in-app upgrade tool

**Principle: copy everything, convert only what changed shape, verify by counts and by text.**

**What is carried (Owner item 6).**
- Every table is copied, including what D7 did not list: 审阅规范, 工序, 资料库, 范例, 书系知识, task process records, each Book's selected 工序, and unfinished imports with their cleanup intents.
- Five UI-session tables are not kept: `manuscript_search_sessions`, `manuscript_search_results`, `manuscript_replacement_previews`, `manuscript_replacement_matches` (open searches and an open 全部替换 preview) and `task_launch_snapshots` (instance-local launch commands).
- Search indexes are rebuilt.

**What is converted.**
- The three position-keyed tables (§6).
- Each branch's history is sealed: Ctrl+Z cannot reach a pre-upgrade step (D7).
- Each manuscript gets a 「升级时的稿件」 version, so restore has a point exactly at the upgrade.

**Card reversal survives (Owner item 11).** The Effect ledger is copied, so a suggestion accepted before the upgrade keeps its card 「撤销本次修改」. Only the Ctrl+Z history is sealed.

**Steps.** Each phase is written to a phase file in the data root before it starts. The file is read before anything can create an empty `store/`, and every phase resumes after a crash.

1. **Detect** a Data Version 1 store and show what the upgrade will do: back up, reorganize into the new format, keep the old data, and the old AI7 will not open the upgraded data. The editor clicks 「升级」 once; it is never automatic (Owner items 1, 2).
2. **Preflight disk space** (old + new + backup). If space is short, say how much is missing and do not start (Owner item 12).
3. **Back up** into today's pre-upgrade backup package and location.
4. **Write the new store** in `store.upgrading/` in one transaction:
   - deferred foreign keys, rows in rowid order, cleanup intents after the tables they fence;
   - the 7 cross-table invariant guards created after the copy, once their final-state invariants are verified. Their one time-dependent clause is checked by row equality with the source;
   - `foreign_key_check` before commit.
5. **Verify** before any switch:
   - the [#1556](https://github.com/zhouy1017/ai7-harness/issues/1556) inventory of every business entity, equal between old and new;
   - `integrity_check`;
   - the exact-schema check;
   - per manuscript, the ordered paragraph text;
   - every object file present, except those deliberately removed by an unfinished import cleanup (both the original and its working representation).

   On any mismatch nothing is switched, the old data stays usable, and the editor is told which items did not match (Owner item 12).
6. **Switch.**
   1. Write the Data Version 2 marker into `store.upgrading/`.
   2. Rename `store/` → `store-before-0.8.0-<time>/`.
   3. Rename `store.upgrading/` → `store/`.
   4. Open, and append the Data Version 2 version record.
   5. Show the before / after comparison in plain words.

   Every set-aside directory carries a timestamp, so a second upgrade-then-rollback never collides.
7. **Keep the old store** until the editor deletes it (Owner item 3).

**「回到升级前的数据」 (Owner item 4)** is a dedicated cross-version restore. It does not use the replacement path, which would reopen the data under 0.8.0.
- It first verifies every file the old store needs.
- If any is missing, it extracts, verifies and marks the backup package in staging, then publishes it through the same resumable renames.
- It ends with **Data Version 1 installed, with its marker, for the previous AI7**. It neither opens nor converts it.
- The editor is told that changes made after the upgrade are not in the old data.

**Old packages (Owner item 5).**
- A `.ai7db` exported by 0.7.2 or later imports directly into 0.8.0 through the same conversion, after every payload class is installed and verified.
- Older packages, and older data (Owner item 1), go through 0.7.4 first.

### 6 · Positions without write amplification

**Order keys.** Working blocks get gapped order keys (`ordinal × 2^20`), plus a page summary of about 90–180 rows at 46,000 paragraphs.
- A split inserts one row with the midpoint key; a join deletes one.
- The outline is keyed by the same order key.
- The Fenwick offset nodes and two redundant indexes are dropped.
- The 1-based paragraph number on the protocol is unchanged; it is computed from the pages.
- Revisions keep their dense positions.

**Re-spacing.**
- An exhausted gap is re-spaced at the smallest level with room: the page (≤ 512 rows), then the page and its neighbours (≤ 1,536), then the whole manuscript (one pass).
- The new block's slot is reserved first, so it always lands between its neighbours.
- Updates are ordered so no unique key is ever held twice.

**Targets,** measured against the [#1557](https://github.com/zhouy1017/ai7-harness/issues/1557) baseline on `SampleBooks/` at about 2,000, 15,000 and 46,000 paragraphs:
- a split or join at 46,000 paragraphs writes under 1 % of today's write-ahead bytes, and grows less than 2× from the smallest size to the largest;
- typing, window, outline, offset and whole-book mark-list reads stay within 10 % of the baseline.

### 7 · Delivery

R5 builds on `codex/integration-0.8.0` after 0.7.3 is delivered (#1540).

| Slice | Scope | Order and dependencies |
| --- | --- | --- |
| R5-1 | Marks keep their undo across split and join (§2) | After [#1536](https://github.com/zhouy1017/ai7-harness/issues/1536) merges; beside 0.7.4 |
| R5-2 | Baseline fold, revision 117 / Data Version 2, one trigger helper (§4) | First on the train |
| R5-3 + R5-4 | Positions (§6) and editor steps (§1), one train because they rewrite the same functions | After R5-2 and R5-1 |
| R5-5 | Version list, view, export, restore (§3) | After R5-3 + R5-4 |
| R5-6 | The upgrade tool (§5); its merge lands the train on `codex/integration-0.8.0` | After R5-5 and #1556 |
| R5-7 | Acceptance on real 0.7.x stores built from `SampleBooks/`, every phase interrupted and resumed, rollback drills, DOCX round trip, 15 Journeys, full guest ladder and hosted Full Gate; 0.8.0 | After the train and 0.7.4 |

R5 needs four things from #1536's storage-facing interface:
1. One module owning the working-block, outline and offset reads and writes.
2. The history replay and the Apply commit callable inside a caller-owned transaction, with supersession left to the caller.
3. The mark-follow functions in one marks module.
4. Each schema module's final-shape SQL importable apart from its migration body.

## Records amended

- **[ADR 0006](0006-preserve-manuscript-native-history-and-recovery.md):** restoring a version is now an editor step that replaces the working state from a revision and seals earlier steps. It is no longer only crash recovery. Its revision graph, journal and recovery snapshots are unchanged.
- **[ADR 0077](0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md) §3 and [ADR 0079](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §1:**
  - §1.1: revision 117 is the breaking change that raises the Data Version to 2.
  - §1.3: rollback restores the kept old store (or the backup package) for the previous AI7, through a dedicated cross-version restore.
  - Import: a Data Version 1 package from 0.7.2 or later is converted instead of refused as an older Data Version.
  - The pre-upgrade backup, its location and its retention until the editor deletes it are unchanged.
- **[ADR 0096](0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md) §1 and V2-UX-ED-044:** a structural edit drifts a ranged 修改建议 only when it cuts through it or sits at the caret; a mark moved whole keeps its state.
- **[UI ADR 0003](../ui-ux-v2/adr/0003-reverse-committed-apply-with-a-new-effect.md):** Ctrl+Z dispatches the governed Reverse Apply Effect directly, without a separate preparation and confirmation step. The original receipt still stays, and the reversal is still refused when the words changed.
- **[#1458](https://github.com/zhouy1017/ai7-harness/issues/1458) D3 and D7** stand. This ADR decides what they left to R5: card reversal survives the upgrade, the oldest data that may upgrade in the app is 0.7.2, and the old store is kept until the editor deletes it. The R5 row's trigger removal is narrowed as stated in §4.

## Consequences

- The editor's Ctrl+Z covers every text change it makes, says where, and never wedges.
- Accepted suggestions survive split and join with their undo.
- Versions can be viewed, exported and restored.
- Structural edits on large manuscripts stop writing tens of megabytes.
- Upgrading to 0.8.0 is one click, with a plain before/after comparison and the old data kept.
- About 73 test files that hand-build old schemas are replaced by a few conversion tests on real 0.7.x stores built from `SampleBooks/`, under the replaced-tests rule of [#1075](https://github.com/zhouy1017/ai7-harness/issues/1075).
- Ordinary CI stays provider-free. This ADR authorizes no live call, no release and no promotion to `main`.
