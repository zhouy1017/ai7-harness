# Progress

## What's done

- Bound the sole writable Worker to Owner-authorized Issue #41 on `feat/41-import-continuity` from exact `dev@6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`. The full current Issue body and T3 Change Brief were read through the GitHub REST API, the exact current authority owners were resolved from that target, and `docs/archive/` was not entered.
- Completed the bounded J-01 Import Continuity and Commit Reconciliation module in the existing owners: additive forward-only schema v3, durable complete-snapshot and original-path recovery metadata, startup-first recovery, explicit continue/abandon, exact reselection, full revalidation, idempotent atomic-commit reconciliation, and a payload-free fail-closed uncertain-outcome state.
- Corrected all four independent post-review blockers from `2fb4376`:
  - v2 → v3 backfill leaves migrated committed results unacknowledged, so startup recovers them until a current renderer proves presentation;
  - unshared abandonment must remove the object file while recovery authority still exists, otherwise it reports failure with the draft intact; only a subsequent zero-reference transaction removes draft and object metadata, while shared Source Version/other-draft bytes remain untouched;
  - startup reconstructs and persists an unchanged migrated reviewed draft's exact current target from its bound v3 evidence or narrowly valid legacy-v2 new-Book digest; ambiguous legacy evidence remains fail-closed and real parser/target/title/fidelity/consequence drift invalidates only on explicit full continuation;
  - completion acknowledgement waits for a visible, product-ready paint opportunity and rechecks that the exact same commit surface remains current, leaving pre-paint crashes recoverable.
- Extended only the existing private J-01 launch-control and journey surfaces for proportional regressions. They form a legacy-v2 reviewed draft through Store behavior, induce the production unshared-object removal failure, prove recovery authority survives without false success and a later cleanup retry succeeds, hold the first completion frame to prove a pre-paint shutdown remains recoverable, and require the visible painted completion marker before durable acknowledgement after restart. No public fault API, controller SQLite mutation, Provider call, payload log, new gate, or adjacent import relationship was added.
- Reverified immediately before commit that the branch remained `feat/41-import-continuity`, the repair parent remained exact `2fb4376b640e75a4e846cd12f329bb172bd1c6ac`, and both local and live `origin/dev` remained exact `6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`; all changed paths remain inside Issue #41.
- Passed `git diff --check`, source syntax checks for every changed TypeScript/JavaScript file with the available Node type-strip parser, fresh schema-v3 creation plus foreign-key inspection, and an execution of the actual populated v2 → v3 migration SQL proving the migrated committed attempt has `completion_acknowledged_at = NULL`.
- Re-ran `pnpm run doctor`, `pnpm run build`, and `pnpm run e2e`. Each was rejected by the repository engine check before project execution because the available Node/pnpm are `24.19.0`/`11.19.0`, not exact required `24.18.1`/`11.24.0`; `node_modules` and `dist` are absent. No installation, pin bypass, Provider call, or external integration action was performed.

## What's next

- With the already-authorized exact Node `24.18.1`, pnpm `11.24.0`, and frozen dependencies restored outside this dispatch, run `pnpm run doctor`, `pnpm run build`, and the existing provider-free J-01 journey on each applicable supported platform.
- After Issue #37 is separately integrated into the intended target, the Commander must normalize its review-digest-v4/import-identity outcome with this completed continuity outcome before Issue #41 integration. This Worker must not merge or rebase #37.
- The Commander may then perform optional advisory review and separately authorized push/pull-request work. This Worker must not push, touch GitHub or `main`, merge, release, or publish.

## Key decisions

- `import_commits` plus the authoritative Book/Source/Manuscript graph remain completion proof. `import_commit_attempts` is only the durable idempotency and reconciliation envelope, never a second authority ledger.
- Continuation always uses and re-verifies the complete content-addressed snapshot. The original selected path is recovery metadata only; an unavailable or changed original is disclosed but never substituted for the verified snapshot.
- A prepared attempt proceeds only after proving absence of both commit and import-record evidence while its bound reviewed draft remains uncommitted. Any contradictory, incomplete, or unreadable combination persists and presents the uncertain state while blocking retry, abandon, and cleanup.
- Migration cannot invent presentation proof. DOM insertion also is not presentation proof: acknowledgement requires a visible product-ready frame, a later frame, and the exact same commit surface still current.
- Legacy-v2 review compatibility is deliberately narrow: only the digest-bound no-match `new-book` choice is reconstructable. Exact-match ambiguity or any digest/evidence change remains fail-closed.
- Unshared object deletion is a prerequisite to deleting recovery authority. Filesystem failure cannot become successful abandonment; a later database failure also reports failure and leaves a retryable draft record. Shared content objects are never deleted by abandoning one draft.
- Startup may identify and verify recoverability but never auto-resumes, selects, commits, or rewrites a decision. Full parser/target/title/fidelity/consequence revalidation begins only after explicit `继续导入` and repeats at commit.

## Unresolved matters or blockers

- The official TypeScript build and provider-free J-01 execution remain blocked only by the absent exact pinned validation carriers. Installing them is explicitly outside this dispatch; this is not a product-scope or Change Brief blocker.
- Issue #37 is a later Commander normalization blocker, not input to this repair. Its completed branch overlaps `src/service/store.ts`, `src/shared/protocol.ts`, and `e2e/run-j01.mjs` with review-digest-v4/import-identity changes; normalizing both completed outcomes after #37 reaches the intended target is mandatory.
- Stop if follow-up requires a second ledger, destructive/downgrade migration, new dependency/process/public fault API, direct E2E controller/database mutation, payload logging, another Journey/gate, Provider or protected input, adjacent import relationships, `main`, publication, release, or external integration action.

## Resume Prompt

On `feat/41-import-continuity`, preserve the completed Issue #41 implementation and its single post-review repair commit. Restore only the already-authorized exact pinned validation carriers outside this Worker dispatch, then run the existing doctor/build/provider-free J-01 checks. Normalize with Issue #37 only after #37 is separately integrated into the intended target and only under Commander authority. Do not install from this checkpoint, expand scope, push, touch GitHub/main, merge, publish, or release.
