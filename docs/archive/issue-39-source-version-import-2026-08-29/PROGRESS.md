# Current checkpoint

## What's done

- Issue #39's refreshed Change Brief was verified against clean `feat/39-source-version-import@5b26ac3685b3a1e8d29176cb5524365a0972ac6e`, whose intended integration target at dispatch is exact `dev@5b26ac3685b3a1e8d29176cb5524365a0972ac6e`.
- The target-qualified S04/J-01 authority, exact existing SQLite/import seams, direct bridge/renderer/J-01 consumers, and the admitted `SampleBooks/sample1.docx` identity were mapped without entering `docs/archive/`.
- The existing SQLite authority now has a fail-closed v8-to-v9 migration and a durable Source Import Record, explicit source-only draft/review/reuse state, operation-kind-separated commit attempts, reciprocal result guards, and source-specific reconciliation/startup validation.
- The shared protocol, thin service/main/preload bridge, and current renderer import workspace now carry a discriminated source-only prepare/commit/result path. New source-bound Books, existing empty Books, existing populated Books, and explicit same-Book exact Source Version reuse remain within the existing import owner.
- Exact local Node 24.18.1 and pnpm 11.24.0 `doctor` and `bootstrap` pass. The compiling vertical slice passes `node node_modules/typescript/bin/tsc --noEmit` with no diagnostics.
- The production build passes and expanded provider-free J-01 passes. Source-only coverage now proves the zero-Manuscript new Book, explicit same-Book reuse with a new acquisition/provenance/record, existing-empty and existing-populated cross-Book results, preservation of populated Book Manuscript/Revision/Workflow identities, reviewed restart, after-commit recovered completion, and ambiguous no-retry/cancel/commit containment.
- The directly stale source-checkout routing document now describes exact schema v9 and the bounded J-01 source-only cases.
- Required exact `doctor → bootstrap → build → J-01` passes. After resolving `dist` as a real non-reparse exact child, only that output was removed; the clean build and J-01 rerun pass. The migration now also validates exact v9 schema, row semantics, and foreign-key truth inside the migration transaction before commit.
- Optional risk-reduction runs exposed deterministic `J-02/title` and `J-08/book-a-title` controller failures: both existing journeys still assumed that choosing a new Book implicitly selected the first-Manuscript relationship. The Change Brief now permits only the minimum controller traversal adaptation; J-02 and J-08 explicitly click the required relationship and both complete successfully with their product meaning and remaining assertions unchanged.
- Fresh read-only T3 advisory review completed against candidate `7ee5081b05995d5fb24c47be425b472f3105cf33`: the Standards axis found no documented-rule violation and four judgement-only duplication/naming smells; the Spec axis found no missing, extra, or incorrect behavior. No abstraction refactor was admitted because the explicit schema/migration validation and discriminated commit paths are safer inside this Issue's extension-first structural budget.
- Both Reviewers were fresh-context, read-only, non-author Codex `gpt-5.6-sol` at `xhigh`, meeting the T3 floor. Same-provider review was used because the Claude CLI remained unavailable; no fallback downgrade occurred and the verdict remains advisory/non-gating.
- Exact `sample1` remains 29,550 bytes with SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`; no other manuscript or SampleBook is admitted.

## What's next

- Commander re-resolves current `dev` and ADR 0050 conditions, then pushes and opens the Issue #39 pull request as Draft.
- Immediately before Ready and again before merge, record the exact disabled/no-run/no-reset waiver facts and ADR 0050 disclosure without dispatching or enabling Actions.

## Key decisions

- Add the missing durable Source Import Record inside the existing SQLite authority through one fail-closed schema-v8 successor migration; do not create a second store, ledger, or pipeline.
- Preserve target and relationship as separate initially-unselected choices. Same-Book Source Version reuse requires explicit selection; cross-Book continuation creates a new target-Book-owned Source Version and provenance.
- Every source-only import creates a new acquisition-specific provenance and Source Import Record. Reuse preserves only the explicitly selected same-Book Source Version; immutable commit proof excludes the live growing Book overview and attaches a fresh overview when read.
- Source-only completion is `来源材料已导入` and creates no Manuscript, Manuscript Revision, Workflow Instance, Run Source Scope, factual/learning/publication/delivery/release authority.

## Unresolved matters or blockers

- None in the completed local implementation or advisory review. Hosted paired-platform evidence remains temporarily unavailable under ADR 0050 and is not claimed.

## Safe Resume Prompt

```text
Commander: resume Issue #39 in C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-39-source-version-import on feat/39-source-version-import from exact dev@5b26ac3685b3a1e8d29176cb5524365a0972ac6e. The required exact root sequence, verified clean-output build/J-01 rerun, all three local journeys, diff/structural/protected-path/sample/no-payload/debug-residue audits and advisory Standards/Spec review are complete. Re-resolve origin/dev and ADR 0050, then push, open Draft, record the waiver immediately before Ready and merge, and integrate one at a time. Do not change dependencies/pins/workflow, widen J-02/J-08 beyond their explicit relationship clicks, or operate Actions.
```
