# Progress

## What's done

- Reverified the requested clean entry exactly: `feat/43-bounded-editor@8923ea3295e9971ffcf6982337b1085dff80c4e7`, parent `9b3f6ac89f096d84af22ebe9a9a73fd0bc43c6a1`, and live `origin/dev@6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`. Re-read `AGENTS.md`, the full live Issue #43 Change Brief, and only its target-qualified routed authorities; no archive, target, authority, or structural-budget drift was found.
- Completed the renderer/job repair inside existing owners. `src/renderer/index.ts` drains dirty/saving/retry journal state before synchronously acquiring the editor operation lock, publishes logical authoritative-mutation state only after that lock succeeds, rolls acquisition back on failure, and keeps acquisition/UI/close-risk/stale-search recovery coherent through normal, failed and retry refresh. `src/service/cooperative-jobs.ts` retains at most 32 FIFO terminal poll receipts: search preserves its exact consumed terminal truth, while replacement retains its private subject solely so a pre-commit cancel can still cancel the preview.
- `src/main/preload.ts` adds a J-02-only isolated-world, 128-event bounded IPC observation record containing operation/job/state metadata but no payload text and no renderer/public API. `e2e/run-j02.mjs` now observes actual start-call count, exact cancel target/terminal projection, dirty/saving flush-before-undo, durable redo, dirty flush-before-Milestone, unlock recovery, and UI/service Milestone bounds `80/120/500`; it remains the existing single provider-free J-02/J-14 gate.
- `src/service/bounded-manuscript.ts` reconstructs the first migrated v2 command group's `before_working_digest` with the exact target-v2 stable algorithm: streaming SHA-256 over canonical ordered `{blockId, position, digest}` base-revision rows. Direct v2 uses it during migration; candidate branch-v3/v4/v5 repairs earlier `revision_digest` pollution in the same transaction; current branch-v6 reopen validates recognizable legacy roots and fails closed.
- The same migration transaction deterministically rekeys every reachable v2/candidate staged or reviewed draft block to `draftId + position + digest`, after a collision-safe temporary phase. Current reopen validates that identity in addition to offsets/length/count. Identical-content legacy drafts may share old staged IDs, but receive distinct current IDs while draft state, review evidence, text and content digests remain unchanged.
- `e2e/run-j01.mjs` admits the already-existing private preload method `dismissReplacementPreview` in its exact `window.ai7` allowlist. No #41 behavior was integrated. No dependency, process, store, scheduler, owner, public API or gate was added.

## Validation

- PASS disposable Node `24.19.0` / built-in SQLite actual-runtime probe: exact v2-to-branch-v6 migration, close/reopen, stable history root distinct from `revision_digest`, staged offset/length/character-count rebuild, and FK check.
- PASS actual candidate branch-v3, v4 and v5-to-v6 probes after deliberately restoring the old wrong history root and shared legacy staged IDs; each repaired both truths transactionally and reopened.
- PASS two identical-content legacy reviewed drafts with shared old staged IDs: exact review evidence survived migration, both traversed real `EditorialStore.commitNewBookImport`, both reopened, and six total manuscript blocks (two pre-existing history blocks plus four imported blocks) had six distinct global IDs with no FK violation.
- PASS current-schema staged-ID and legacy-history tamper rejection; PASS invalid-v2 migration rollback retaining `user_version=2`, removing every attempted added column, and restoring `foreign_keys=ON`.
- PASS actual `CooperativeJobOwner` race/retention probe: terminal search poll then cancel returned the same `completed` result; terminal replacement poll then pre-commit cancel returned `cancelled`; FIFO retained exactly the newest 32 and evicted the oldest without changing single-consumption poll semantics.
- PASS TypeScript `6.0.3` filtered semantic diagnostics on all four changed TypeScript owners (`0` diagnostics); PASS Node strip-types syntax on those owners; PASS `node --check` on J-01/J-02; PASS renderer/J-02/allowlist/Milestone source assertions; PASS final `git diff --check` before commit.
- The exact disposable `ai7-issue43-probe-4c1968474ce541feb804872295c7429b` system-temp tree, including every helper and SQLite database, was path-validated outside the worktree and deleted. No tracked or remaining manuscript, derivative, fixture, payload log, database, screenshot, trace, video or performance artifact was created.

## What's next

- No Issue #43 Worker implementation remains. Commander may read-only review the clean local follow-up tip and later integrate under the recorded ordering constraints. Do not push, open/comment/close an Issue or PR, merge, rebase, release, or touch `main`.

## Key decisions

- The v2 stable working digest exactly preserves `dev@6b4ef18d` behavior and is computed incrementally so migration never materializes the full block list. Only deterministically recognizable legacy roots (`journal_entry_id == command_group_id`) are repaired/validated; current command history meaning is not rewritten.
- Rekey reconstructs derived staged identity, not manuscript truth: final IDs use the already-current Store algorithm, while text/digest/review state stay untouched. Existing IDs must first be valid legacy `blk_…` values; malformed data rolls back rather than being normalized speculatively.
- Mutation acquisition uses a non-authoritative starting guard so duplicate commands cannot enter during journal drain; terminal receipts remain inside the one cooperative owner. J-02 reads real IPC observations from Electron's isolated preload execution world, while the renderer receives no diagnostic capability.

## Unresolved matters or blockers

- No Issue #43 stop condition or residual in-brief implementation blocker remains.
- Official doctor/build/J-02 was not run because exact pinned Node `24.18.1`, pnpm `11.24.0`, and the frozen dependency tree are unavailable. The no-install probe carrier was Node `24.19.0`; this is not an official gate result, and nothing was installed or bypassed.
- Commander integration order remains `#37 -> #41 -> #43`. Later replay must preserve #37 identity/review-v4 behavior: legacy reviewed drafts remain drafts but require v4 re-review. It must also preserve #41 per-draft `commitBindings`/attempt/ack records rather than collapsing them into one binding, and must replay #43 as a later forward schema instead of mechanically reusing branch-local v6.

## Resume Prompt

Read-only verify the clean committed tip of `feat/43-bounded-editor` as the completed Issue #43 closed repair. Preserve every prior J-02/J-14 repair, historical unsigned Milestones, separate Signoff truth, single-use exact AI7 Apply, one SQLite/service owner, max-32-block renderer, runtime-only synthetic input, and provider/artifact inertness. Do not enter `docs/archive/`, install, push, create/edit/close an Issue or PR, merge/rebase #37 or #41, call Providers, add manuscript artifacts, release, or touch `main`; Commander must integrate in order `#37 -> #41 -> #43`, retaining #37 re-review-v4 and #41 per-draft commit binding/attempt/ack truth.
