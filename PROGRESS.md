# Progress

## What's done

- Completed all 11 authorized Issue #43 follow-up repairs on `feat/43-bounded-editor` as one bounded change atop `a9be0b9043fd1f38396b754aed802a110b83ad04`; no #37/#41 rebase or merge occurred.
- `src/service/docx.ts` now bounds decoded feed chunks, raw XML text tokens and paragraph assembly at the block layer, rejecting oversized text/tabs/breaks before accumulation while retaining the exact runtime-only 10,000,000-character J-02 input.
- `src/service/bounded-manuscript.ts` now reconstructs immutable base-revision offsets from `manuscript_block_versions` and rebuilds mutable working offsets/search/outline separately.
- `src/renderer/editor.ts`, `src/renderer/index.ts`, `src/service/index.ts` and `src/shared/protocol.ts` now return fresh post-journal windows; drain sustained multi-block ordinary edits through bounded serialized commands with visible retry backpressure; preserve exact anchor/head direction, focus and visual scroll anchors across overlapping maximum-32-block windows; restore exact Search Return state; and virtualize outline pages at 64 entries with signed previous/next cursors.
- Search now fixes one deterministic non-overlapping exact-grapheme set from left to right, retaining the earliest overlapping candidate. Replacement preparation, freeze, revalidation and commit all assert that invariant. Frozen preview contexts come only from included matches and disclose exact matching/inclusion rules, revision, included count and excluded count.
- Milestone creation now atomically writes a separate internal `milestone_signoff_records` row in the same SQLite authority with exact milestone/revision/workflow binding, evidence digest, actor/time, label and stated next use.
- The existing cooperative owner retains at most 32 jobs, returns a terminal projection once before reclaiming it, and keeps at most four active jobs. Unreferenced terminal SQLite search sessions retain only the newest 32; replacement-referenced sessions remain durable intent evidence.
- `e2e/run-j02.mjs` now covers reverse-selection and visual-anchor continuity both ways, exact Search Return, sustained 300-grapheme plus second-block automatic journal draining during cooperative work, fresh post-save cursors, non-overlap search, two-way bounded outline paging, included-only frozen contexts and disclosed replacement truth. Existing J-14 keyboard, real composition-event, focus, 200% zoom and forced-colors coverage remains in the same provider-free J-02 gate.
- Ran and deleted disposable no-install Store/parser diagnostics. They passed pre-accumulation oversized text/tab rejection, immutable-versus-working migration offsets, deterministic non-overlap and corrupt-overlap rejection, included preview truth, atomic replacement, exact milestone/Signoff binding, fresh acknowledgement windows, 32-session retention and terminal-job poll/reclamation. No payload was logged or retained.
- All changed TypeScript sources and `e2e/run-j02.mjs` pass the available Node 24.19.0 syntax checks; `git diff --check` passes; no untracked file, manuscript payload, dependency, plugin, Provider call, second store/process/scheduler, standing gate or new public fault code was added.
- Reverified branch/base authority immediately before commit: local and live `origin/dev` are exact `6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`, and the pre-repair HEAD is exact `a9be0b9043fd1f38396b754aed802a110b83ad04`.

## What's next

- Commander review and integration are next; the Worker has no further in-brief implementation work after the single local follow-up commit.

## Key decisions

- Every parser/editor/job/search collection stays explicitly bounded; renderer-local state contains only the mounted maximum-32-block window, never the whole manuscript.
- Journal acknowledgement owns cursor freshness by returning the exact same-start authoritative window bound to the new working digest. Authoritative writes remain serialized through the existing service/SQLite owner while composition ends naturally.
- Search fixes the non-overlapping match set before replacement review; exclusions only narrow it, and all later phases fail closed using existing fault codes.
- Milestone Version and internal Signoff Record are distinct rows created in one transaction. No adjacent Book Workspace, policy, ADR or schema-integration authority was assumed.

## Unresolved matters or blockers

- No Issue #43 Change Brief or structural-budget expansion was required, and no named implementation stop condition was reached.
- Exact product validation is environment-blocked: repository doctor/build require Node 24.18.1, J-02 refuses Node 24.19.0, pnpm 11.24.0 is unavailable, and the frozen dependency tree is absent. The Worker did not install or bootstrap anything.
- Commander integration must still resolve #37 identity/review-v4 and, after #41, the unified forward schema. These remain explicit external integration blockers, not Issue #43 Worker scope.

## Resume Prompt

Review the single Issue #43 follow-up commit at current `feat/43-bounded-editor` HEAD against live `origin/dev` `6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`. Preserve the provider-free/no-payload boundary and maximum-32-block/one-SQLite/one-cooperative-owner design; do not integrate until #37 identity/review-v4 and the post-#41 unified forward schema are reconciled by the Commander.
