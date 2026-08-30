# Current checkpoint

## What's done

- Issue #138 / PR #139 integrated the local-first, low-usage real-E2E testing framework to `dev` as `28e541922cb14a8b0c92468b6092e30c2663c109`.
- Developers and later Agents now use capture-only `pnpm --silent run e2e:diagnose -- --journey <admitted-id>` for iteration. `pnpm run e2e:all` is the fixed all-admitted-Journey runner inside ADR 0053's stricter CI-degraded Local-completion sequence; it does not replace the required `doctor`, `bootstrap`, or clean `build`. A diagnostic pass is never completion evidence; a real product, build, or Journey failure remains red and returns to its own authorized Issue.
- ADR 0053 and the live agent runbooks distinguish Local diagnostic, Local completion, and Hosted Gate evidence. The bounded CI-degraded path permits one-at-a-time integration only after truthful local completion and explicit missing-hosted-evidence recording; it never manufactures paired-platform evidence.
- Normal Hosted CI remains one provider-free E2E Functional Gate covering every admitted Journey on Windows and macOS. Draft suppression, concurrency cancellation, one build per platform, failure early-stop, and the narrow integrity-reverified Electron cache bound GitHub usage without reducing admitted coverage.
- Workflow `342459594` remained `disabled_manually` throughout Ready and merge. Exact pre-Ready and pre-merge checks found zero queued or in-progress runs and no run for the framework head, so PR #139 produced no Hosted Gate evidence.
- Issue #138 was a Journey `N/A` framework outcome. It changed no product source and made no product Local-completion or four-Journey-green claim; unfinished product behavior remains deliberately outside that Issue.
- The mandatory Issue #140 lifecycle sweep archives exactly the consumed Issue #138 `PROGRESS.md` snapshot under `docs/archive/issue-138-local-first-e2e-framework-2026-08-30/`. The outgoing handoff remains in Git history only, and the stable root routers now point forward.
- Issue #46 is the next product route after this lifecycle node is live. Its Change Brief and existing paused worktree must be refreshed against the then-current exact `dev` and ADR 0053 before dispatch; this checkpoint does not implement any part of Issue #46.

## What's next

After Issue #140 integrates, re-resolve Issue #46 against the newest exact `dev`, update its superseded ADR 0050 references and CI-degraded integration clauses to ADR 0053, preserve and deliberately reconcile its existing paused uncommitted candidate work, and restore `ready-for-agent`. Then one Worker may continue only Issue #46 under the new local diagnostic/completion contract; unrelated product failures remain separate work.

## Key decisions

- Local iteration is cheap and informative. Normal Local completion uses the documented clean build plus applicable real Journey; CI-degraded Local completion uses exact `doctor` → `bootstrap` → `build` → `e2e:all`. Hosted Gate evidence is a third, non-substitutable state.
- Low GitHub usage comes from fewer integration-ready occurrences and bounded execution, not from selective Journey/platform coverage or extra standing gates.
- Testing-framework work proves truthful orchestration and cleanup. It does not authorize product implementation or require unfinished product Journeys to pass.
- Future Agents must follow ADR 0053 and `docs/agents/ci-test-boundaries.md`; a red outcome may not be repaired outside the active Change Brief.

## Unresolved matters or blockers

- Workflow `342459594` remains deliberately disabled, so no Hosted Gate or paired-platform evidence exists. Its restoration requires the separately governed availability condition and is not implied by local success.
- Issue #46 remains product work. Its existing `feat/46-model-service-credentials` worktree contains paused uncommitted candidate changes that must not be reset, discarded, or hidden by a parallel branch; a future Worker must inspect and reconcile them under the refreshed Change Brief.

## Safe Resume Prompt

```text
Commander: confirm Issue #140 is live on the newest dev, then refresh Issue #46's exact authority target, ADR 0053 testing clauses, and existing paused-work routing before restoring ready-for-agent. Preserve its uncommitted candidate work and dispatch one Worker only in the existing Issue #46 worktree. Require capture-only local diagnostics during iteration and ADR 0053's exact doctor → bootstrap → build → e2e:all sequence for CI-degraded Local completion; record missing Hosted Gate evidence while workflow 342459594 remains disabled, and do not repair unrelated product failures.
```
