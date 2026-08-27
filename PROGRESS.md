# Progress

## What's done

- Completed the eight-finding Issue #43 final repair atop `1bc683d6943150d3274548fa6954695fb7534322` on `feat/43-bounded-editor`, without rebasing or merging #37/#41. Reverified the full live Issue #43 Change Brief and live `origin/dev@6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`; no target or authority drift occurred.
- `src/service/bounded-manuscript.ts` and `src/service/store.ts` now use Issue-local schema v5. Fresh/v2, candidate v3 and v4 reach v5 atomically; candidate v3 gains the Signoff table without backfill, and candidate v3/v4 immutable-revision offsets are deterministically rebuilt only from immutable version text while working offsets remain derived from working text. Current v5 reopens validate rather than silently rewrite corrupt derived state.
- Schema admission now proves the complete current source/target database shape: exact table SQL, types, nullability, primary/unique/check constraints, STRICT/rowid properties, every foreign-key column/target/action, all explicit indexes, the FTS5 virtual table and shadow tables, and the absence of unknown tables/indexes/views/triggers. Malformed candidate shapes fail before version advancement; migration data/DDL/version changes roll back together and foreign-key enforcement remains enabled/restored.
- Existing Signoff rows are admitted only when their milestone/revision/branch/workflow binding, evidence-digest form, actor, exact ISO time, label and stated next use agree. Historical candidate-v3 Milestones remain intact and unsigned; no workflow evidence is invented. New Milestone plus separate Signoff creation remains one SQLite transaction.
- `src/service/docx.ts` imposes an explicit 128-element XML nesting ceiling for document and core-properties parsing while retaining the existing token, paragraph, expanded-entry and block bounds.
- Replacement preparation now applies exclusions before review, exposes exact included/excluded counts and the exact exclusion-list/complement rule, shows representative contexts only from included matches, and freezes only the reviewed set. Copying and exact/non-overlap validation advance in 128-row turns through the existing cooperative owner, remain cancellable, and yield to serialized journal writes.
- Replacement/search retention is deterministic and transactional: at most eight replacement previews, at most four newest terminal previews, and at most 32 unpinned terminal search sessions. Reviewing/frozen authority is preserved; cancelled/failed/committed records, copied matches and newly unpinned search results cascade-reclaim safely; orphaned running searches become failed on startup. Committed undo/redo authority remains in durable command groups rather than retained preview copies.
- `src/renderer/editor.ts`, `src/renderer/index.ts` and `e2e/run-j02.mjs` now drain exact pending journal state before replacement commit, Milestone/Signoff, undo or redo; lock typing and mutation controls through authoritative refresh; verify refreshed revision/journal/digest truth; preserve exact continuity; and expose a bounded retry control if refresh cannot yet recover. The J-02 assertion checks read-only lock, blocked typing and unlock after refresh.
- Outline display text is grapheme-safe and capped at 2 KiB per entry, with truncation disclosure while exact block/character/proportion navigation remains unchanged. The renderer continues replacing the 64-entry outline page rather than accumulating DOM, and every manuscript editor window remains capped at 32 blocks.
- Updated only existing private protocol/service/renderer/J-02 owners: `src/shared/protocol.ts`, `src/service/{docx,store,bounded-manuscript,cooperative-jobs,index}.ts`, `src/renderer/{editor,index,styles.css}` and `e2e/run-j02.mjs`. No dependency, process, store, public API, gate or manuscript payload was added.
- Disposable no-install probes passed and were deleted: actual SQLite fresh/v2/v3/v4-to-v5 migration, populated offset repair and v5 reopen; full malformed-schema rejection and atomic rollback; valid/tampered Signoff truth; dense 1,000-match preparation in 128-row turns, exact exclusion/freeze mismatch/non-overlap behavior; mixed active/terminal preview retention, match cascade and transient/orphan search reclamation; actual 64 maximum supplementary-CJK outline entries at 145,835 serialized bytes; XML depth 128 acceptance/depth 129 rejection with parser stack bounded at 129; cooperative yield/cancel/terminal-poll reclamation; and mutation drain/lock/exact-refresh/retry source assertions.
- Final available checks pass: `git diff --check`; dependency-free TypeScript parse/filtered semantic probe with zero actionable diagnostics; `node --check` equivalents for `e2e/run-j02.mjs` and `tools/doctor.mjs`; and all disposable runtime probes above. The host used only for disposable checks is VS Code's Node 24.18.0, not an official carrier.

## What's next

- Commander review and target re-resolution are next. Run the official doctor/build/provider-free J-02 only when the repository's exact pinned Node 24.18.1, pnpm 11.24.0 and frozen dependency tree are available; do not install or bypass them in this worktree.

## Key decisions

- Issue-local v5 is the smallest truthful forward repair for this branch: it repairs candidate-v3/v4 derived offsets, creates Signoff only when absent, validates the complete admitted schema/data truth, and never changes immutable manuscript text or fabricates historical Signoff evidence.
- Exact inclusion is represented boundedly as the ordered completed search result set minus the persisted exact exclusion-ID list. Preparation copies/validates that set incrementally; freeze cannot alter it.
- Authoritative mutations use the existing serialized service and bounded editor. Local edits drain first, editor typing stays read-only through mutation and exact refresh, and a failed refresh remains visible with an explicit retry route rather than exposing an editable stale buffer.
- Terminal replacement copies are not undo/redo authority. Durable command groups preserve committed history, allowing deterministic preview/search reclamation without harming commit recovery or restart-safe history.

## Unresolved matters or blockers

- No Change Brief or structural-budget expansion was required, and no named Issue #43 stop condition was reached.
- Official doctor/build/J-02 execution remains unavailable: no `node` is on PATH, `node_modules` is absent, available pnpm is 11.19.0 rather than 11.24.0, and the disposable VS Code host is Node 24.18.0 rather than 24.18.1. Nothing was installed or bypassed.
- Commander integration must preserve #37 identity/review-v4 behavior and replay #43 as a new forward schema after #41's accepted-but-unintegrated schema v5. It must not mechanically reuse this branch-local v5 number or merge/rebase either candidate into this Worker branch.

## Resume Prompt

Review the current `feat/43-bounded-editor` HEAD as the complete Issue #43 eight-finding repair. Reverify `origin/dev`, inspect the v2/v3/v4-to-branch-v5 exact admission/offset/Signoff path, cooperative exact replacement and retention, XML depth, outline frame, and mutation lock/recovery. Keep #37 identity/review-v4 and post-#41 forward-schema replay as Commander-only integration blockers; run the single official provider-free J-02 gate only with the exact pinned carriers.
