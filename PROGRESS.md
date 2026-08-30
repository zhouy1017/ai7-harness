# Current checkpoint

## What's done

- The Owner made Issue #138 the highest-priority repository-development outcome and authorized implementation of the local-first, low-usage real-E2E testing framework from `dev@938af405cb4767276213c554185ae422d7a0d220`.
- Issue #138 contains the full Change Brief and is active on `ci/138-local-first-e2e-framework`.
- Draft pull request #139 targets `dev`; it remains Draft and has produced no Hosted Gate run or evidence.
- Issue #46 was removed from `ready-for-agent` and explicitly paused until Issue #138 integrates; no other product work is authorized to proceed in parallel.
- Workflow `342459594` was rechecked as `disabled_manually` with zero queued or in-progress runs. It remains disabled during this work.
- The local command surface now includes fixed-order `e2e:all` orchestration and capture-only `e2e:diagnose`; diagnostics emit only allowlisted non-payload metadata. Root `build` enters through a fixed dynamic-import controller; TypeScript failures reduce to bounded file/config/code/count tuples, and all other implementation import or execution failures reduce to `BUILD/unclassified`.
- The Hosted Gate draft keeps the same four Journeys on both platforms, adds only an integrity-reverified Electron download cache, and enables matrix failure early-stop.
- ADR 0053 and its agent/runbook projections now define Local diagnostic, Local completion, Hosted Gate evidence, and the bounded CI-degraded path; ADR 0050 is marked superseded.
- The Owner clarified that Issue #138 is a Journey `N/A` testing-framework outcome: it must validate orchestration, isolation, redaction, deterministic failure propagation, low-usage workflow behavior, and future-Agent routing, but must not implement unfinished product design or repair product defects to manufacture four green Journeys.
- A J-02 driver race at the boundary between outline navigation and the next position action was isolated without product changes; the Journey now waits for its existing two-frame renderer stabilization. A current exact-toolchain real J-02 execution passes through the capture-only diagnostic path and remains explicitly `not-completion`.
- Fresh T3 Standards and Spec reviews found two framework defects in the first Draft head: direct OS-signal termination could bypass runner `finally` cleanup, and the build top-level catch could reflect an arbitrary exception message. A public-boundary TDD probe reproduced the J-01 temp-root leak before the fix. Focused follow-up review additionally required direct macOS foreground-group signal handling, controller-disconnect parent leasing, truthful child-crash classification, and a closed dynamic-import build entry. The worktree now sends a fixed IPC cancellation request, handles direct runner signals and parent-channel loss, interrupts active browser ownership, prevents later resource acquisition, lets the runner unwind through its single cleanup owner, reports only a recorded controller interruption as `interrupted`, and encloses build implementation parsing/import/execution behind `BUILD/unclassified`.
- Exact Node 24.18.1/pnpm 11.24.0 `doctor`, integrity-bound `bootstrap`, and clean `build` pass. The matching TDD signal probe, `e2e:all` interruption contract, direct-runner-signal probe, and real IPC parent-disconnect probe leave zero new J-01 roots and zero Node/Electron processes; closed first-failure, listener cleanup, child-output redaction, controlled exception-message redaction, and controlled implementation-parse redaction probes pass. Existing earlier temporary roots were not treated as this Issue's data and remain untouched.
- Workflow `342459594` remains disabled; no Hosted Gate evidence, product Local completion, or four-Journey green claim is made.

## What's next

Commit and push the review fixes to Draft pull request #139, obtain fresh read-only closure reviews at that exact head, re-resolve the newest `dev`, and perform the required disabled-workflow/no-run checks immediately before Ready and merge. Integrate the Journey `N/A` framework without enabling or dispatching Hosted CI, then complete the separate post-merge checkpoint archive node. Only after the framework and lifecycle node are live on `dev` may the next product route be re-resolved under ADR 0053.

## Key decisions

- Preserve one logical provider-free E2E Functional Gate. Local diagnostic and local completion are distinct states and never become hosted or paired-platform evidence.
- Normal Hosted CI remains one integration-ready occurrence with all admitted Journeys on Windows and macOS; usage reduction comes from Draft suppression, cancellation, one build per platform, exact download caching, and failure early-stop rather than reduced coverage.
- CI-degraded development must remain locally complete, one-at-a-time, explicit about missing hosted evidence, and unable to bypass a real product/build/journey failure.
- Hosted caching is limited to `.cache/bootstrap/electron`; dependency stores, materialized runtime/build state, Agent Data Roots, payloads, logs, and test artifacts remain excluded.
- Issue #138 is not a product Local-completion claim. Framework acceptance requires truthful control and reporting behavior, not current product completion or a synthetic green result.

## Unresolved matters or blockers

- Fresh closure review of the current signal/build fixes and the pre-Ready/pre-merge workflow-state checks remain. Workflow restoration is deliberately out of scope and remains prohibited until its separately governed availability condition is authoritatively met.

## Safe Resume Prompt

```text
Commander: finish fresh closure review and integrate Draft PR #139 for Issue #138 while keeping workflow 342459594 disabled; do not repair product behavior or claim product Local completion, four-Journey green, or Hosted Gate evidence. Then archive only this consumed checkpoint in the separate lifecycle node and re-resolve the next product route under live ADR 0053.
```
