# Current handoff

[Issue #43](https://github.com/zhouy1017/ai7-harness/issues/43), **[S08] J-02: Complete the 10M-character bounded editing module**, is the active sole-writer integration on `feat/43-bounded-editor` from exact `origin/dev@0fef4d8321b86db07742de5a9c927e0b8741b75b`.

Resolve this file from the exact tree being read. The original candidate tip `84885a46ab754be3f9c6d411053b00ba92d4d9cc` was rebased only as evidence; its conflicted import owners and raw SQLite v3-v7 states are not canonical authority.

## Current outcome and authority route

- Owner-approved scheme 1 preserves canonical SQLite v5 as the only direct predecessor and upgrades it once to final v6. Import review v4 and service protocol v4 are separate namespaces. Every #37/#41 identity, recovery, path-loss, attempt, reconciliation, completion-acknowledgement, uncertainty, and abandonment-cleanup rule remains authoritative.
- DOCX parsing uses one inert `import_ingest_blocks` relation in the existing `store/ai7.sqlite`, a dedicated connection, and synchronous batches of at most 256 rows. A short authority transaction validates and promotes the complete snapshot; startup sweeps inert rows before import recovery. There is no second database, store owner, process, recovery surface, or manuscript payload log.
- The initial import transaction now establishes r1 plus exact bounded working blocks, outline, FTS, private Fenwick offsets, and durable history root without materializing the whole manuscript. Renderer windows remain capped at 32 blocks.
- The canonical import UI remains the startup authority. Only after it returns `none` may prior work load. Newly committed completion must be painted and durably acknowledged before “打开稿件” becomes available.
- J-02 adds exact position and outline navigation, off-window read-only continuity, CJK search, Search Return Position, reviewed/frozen atomic replacement, cooperative cancellation, Milestone r2, persisted reopen, restart-safe undo/redo, and applicable J-14 keyboard/IME/focus/reflow/forced-colors behavior.
- The one provider-free E2E Functional Gate keeps the full current J-01 lifecycle and adds J-02 on the same Windows/macOS jobs. No new standing gate is created.

Stable Issue #86 authority, Provider setup/install non-authorization, active Background Analysis Enrollment for background Provider work, inert imported updates until adoption or an Artifact Update Rule, and the exact single-use AI7 Apply boundary remain unchanged. No Provider call, dependency/plugin installation, manuscript/derivative addition, adjacent Issue decomposition, release, `main` action, or PR integration is authorized by this handoff.

## Safe next action

Finish source/E2E consistency checks and update `PROGRESS.md`. Exact local Node 24.18.1, pnpm 11.24.0, and installed dependencies are absent; do not substitute or install them. After bounded static checks, commit and push only `feat/43-bounded-editor`, open its single PR to `dev`, and use only the existing Route plus Windows/macOS J-01+J-02 checks. Advisory review is not an exact-head, zero-finding, iterative re-review, PR, or CI gate.

Stop if the Issue #43 Change Brief or structural budget must expand, target-qualified authority drifts, or remaining usage falls below 15%.

## Resume prompt

```text
Continue only Issue #43 on feat/43-bounded-editor above exact origin/dev@0fef4d8321b86db07742de5a9c927e0b8741b75b. Preserve direct SQLite v5→v6, import review v4, service protocol v4, all #37/#41 continuity and cleanup semantics, inert 256-row same-database ingest, one SQLite/service owner, 32-block windows, the accepted exact-navigation/read-only-continuity fixes, and the single existing E2E Functional Gate. Finish J-01/J-02 and documentation normalization, run non-substituting checks, then create and integrate only the Issue #43 PR through existing checks. Do not enter docs/archive, install dependencies/plugins, call Providers, add manuscripts or derivatives, decompose adjacent Issues, add gates, release, or touch main.
```
