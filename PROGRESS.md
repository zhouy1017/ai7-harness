# Current checkpoint

## What's done

- The Owner made Issue #138 the highest-priority repository-development outcome and authorized implementation of the local-first, low-usage real-E2E testing framework from `dev@938af405cb4767276213c554185ae422d7a0d220`.
- Issue #138 contains the full Change Brief and is active on `ci/138-local-first-e2e-framework`.
- Issue #46 was removed from `ready-for-agent` and explicitly paused until Issue #138 integrates; no other product work is authorized to proceed in parallel.
- Workflow `342459594` was rechecked as `disabled_manually` with zero queued or in-progress runs. It remains disabled during this work.
- The local command surface now includes fixed-order `e2e:all` orchestration and capture-only `e2e:diagnose`; diagnostics emit only allowlisted non-payload metadata, and TypeScript failure output is reduced to bounded file/line/column/code tuples.
- The Hosted Gate draft keeps the same four Journeys on both platforms, adds only an integrity-reverified Electron download cache, and enables matrix failure early-stop.
- ADR 0053 and its agent/runbook projections now define Local diagnostic, Local completion, Hosted Gate evidence, and the bounded CI-degraded path; ADR 0050 is marked superseded.
- The Owner clarified that Issue #138 is a Journey `N/A` testing-framework outcome: it must validate orchestration, isolation, redaction, deterministic failure propagation, low-usage workflow behavior, and future-Agent routing, but must not implement unfinished product design or repair product defects to manufacture four green Journeys.
- A J-02 driver race at the boundary between outline navigation and the next position action was isolated without product changes; the Journey now waits for its existing two-frame renderer stabilization and passed two consecutive payload-safe diagnostic executions.
- Exact Node 24.18.1/pnpm 11.24.0 `doctor`, integrity-bound `bootstrap`, and clean `build` pass. Closed-CLI, first-failure stop, signal forwarding/cleanup, 64 KiB output bounding, arbitrary-output redaction, TypeScript diagnostic reduction, workflow YAML/SHA/trigger/cache rules, changed-document links, and no-product-source-diff checks pass.
- Independent implementation, workflow, and governance reviews report no blocker. Workflow `342459594` remains `disabled_manually` with no queued or in-progress run; no Hosted Gate evidence is claimed.

## What's next

Re-resolve the newest `dev`, commit the bounded diff, open the Draft pull request, prepare the one consumed checkpoint archive, and integrate the Journey `N/A` framework without enabling or dispatching Hosted CI. After it is live on `dev`, restore the next product route under ADR 0053.

## Key decisions

- Preserve one logical provider-free E2E Functional Gate. Local diagnostic and local completion are distinct states and never become hosted or paired-platform evidence.
- Normal Hosted CI remains one integration-ready occurrence with all admitted Journeys on Windows and macOS; usage reduction comes from Draft suppression, cancellation, one build per platform, exact download caching, and failure early-stop rather than reduced coverage.
- CI-degraded development must remain locally complete, one-at-a-time, explicit about missing hosted evidence, and unable to bypass a real product/build/journey failure.
- Hosted caching is limited to `.cache/bootstrap/electron`; dependency stores, materialized runtime/build state, Agent Data Roots, payloads, logs, and test artifacts remain excluded.
- Issue #138 is not a product Local-completion claim. Framework acceptance requires truthful control and reporting behavior, not current product completion or a synthetic green result.

## Unresolved matters or blockers

- No implementation blocker remains. Workflow restoration is deliberately out of scope and remains prohibited until its separately governed availability condition is authoritatively met.

## Safe Resume Prompt

```text
Commander: re-resolve dev, commit and open the Draft PR for Issue #138, archive only this consumed node checkpoint, keep workflow 342459594 disabled, integrate the Journey N/A framework without claiming product Local completion or Hosted Gate evidence, then restore the next product route under ADR 0053.
```
