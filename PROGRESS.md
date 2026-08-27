# Progress

## What's done

- Completed the Commander-requested final Issue #43 durability repair atop `8422f7fb6006118cd03382fc94b6f23be6fec89f` without rebasing or merging #37/#41.
- `src/service/bounded-manuscript.ts` now declares an explicit Issue-local schema v4. Fresh/v2 authorities upgrade directly to v4 in the existing bounded migration transaction; existing v3 authorities run a dedicated additive v3-to-v4 transaction that creates the missing `milestone_signoff_records` table before advancing `user_version`.
- The shared Signoff table definition is checked for exact columns, SQLite STRICT mode and all five intended foreign keys. A v4 reopen validates that truth before the bounded owner becomes usable.
- The v3-to-v4 path keeps foreign-key enforcement enabled, runs `foreign_key_check`, and advances `user_version` inside the same `BEGIN IMMEDIATE` transaction. The v2-to-v4 path also checks foreign-key disablement/restoration and preserves its existing rollback boundary.
- `src/service/store.ts` explicitly accepts base v2, pre-Signoff v3 and current v4 so an existing v3 database reaches the bounded migrator and a migrated v4 database reopens normally.
- Ran and deleted disposable no-install SQLite probes. They passed fresh 0-to-2-to-4 plus v4 reopen; populated v2-to-v4 data preservation plus Signoff creation; populated a9be-shaped v3-to-v4 preservation plus subsequent exact Signoff creation; and incompatible-v3 rollback with version, data and foreign-key enforcement unchanged.
- Existing pre-migration Milestone rows are preserved without fabricating retroactive Signoff evidence. Every Milestone saved after migration atomically gains the required separate Signoff Record.
- The probe emitted only `SCHEMA_FORWARD_PROBES=PASS`; no manuscript payload, database, diagnostic or temporary file remains.
- Both changed TypeScript owners pass the available Node 24.19.0 syntax checks and `git diff --check` passes. Repository doctor/build/J-02 correctly stop at the unavailable exact Node 24.18.1 boundary; installed pnpm is 11.19.0 rather than required 11.24.0, and no dependency tree or build output exists.

## What's next

- Commander review and integration are next after the single local follow-up commit; the Worker has no further in-brief implementation work.

## Key decisions

- Schema v4 is only Issue #43's truthful forward migration step. It does not claim or resolve #41's separate schema work; the Commander must still produce the unified forward sequence during integration.
- V2 upgrades directly to v4 atomically because its migration already creates all J-02 owners. V3 receives only the missing additive table and validation, so populated data is not rebuilt or rewritten.
- Historical Milestones are not backfilled with invented actor/time/workflow evidence. The migration preserves them, while all new Milestones use the atomic Milestone-plus-Signoff write already implemented.

## Unresolved matters or blockers

- No Change Brief or structural-budget expansion was required, and no named Issue #43 stop condition was reached.
- Exact product build/J-02 execution remains environment-blocked by the unavailable pinned Node 24.18.1, pnpm 11.24.0 and frozen dependency tree; no installation or bootstrap is authorized.
- Commander integration must still reconcile #37 identity/review-v4 and the unified forward schema after #41. This follow-up intentionally does neither.

## Resume Prompt

Review the Issue #43 schema follow-up at current `feat/43-bounded-editor` HEAD. Verify that store initialization admits v2/v3/v4, v3-to-v4 adds and validates only `milestone_signoff_records` atomically, v2 reaches v4 without data loss, and v4 reopens; retain #37 and post-#41 unified-schema reconciliation as Commander-only blockers.
