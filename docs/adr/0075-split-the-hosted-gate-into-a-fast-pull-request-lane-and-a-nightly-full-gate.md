---
status: accepted
---

> Amended by [ADR 0081](./0081-run-the-nightly-full-gate-over-every-open-pull-request-merge-the-ones-that-pass-and-then-over-dev.md): the nightly `schedule` now falls on a serial merge queue that runs this full Gate over every open pull request against `dev`, merges the ones that pass, and then runs it once more over the final `dev` tip. §2's pull-request lane and what each occurrence is evidence of are unchanged; this ADR's nightly trigger and its statement that the Commander alone integrates are not.

# Split the hosted E2E gate into a fast pull-request lane and a nightly full Gate

On 2026-09-09 the Owner directed that the pull-request gate be cut to under three minutes and that the full Journey set run once a day instead of once per pull request.

The gate as built ran all seven admitted Journeys on Windows and macOS on every product-affecting pull request. Measured on the last five product occurrences (runs `34247132935`, `34249493887`, `34258140057`, `34265858933`, `34272972143`), the Windows job took 8–10 minutes and the macOS job 8–12.5 minutes, and because they run as a matrix the pull request waited for the slower one. Wall clock from run creation to conclusion was 10–22 minutes; the 22-minute occurrence spent 13.5 of those minutes waiting for a macOS runner to be allocated.

The cost is concentrated in two Journeys. Per-step timings from those runs:

| Journey | Observed range |
| --- | --- |
| J-01 | 208–283 s |
| J-02 | 61–332 s |
| J-08 | 26–39 s |
| J-12 | 19–25 s |
| J-15 | 7–25 s |
| J-03 | 8–13 s |
| J-04 | 12–23 s |

J-01 and J-02 are 82 % of the Windows journey time. Fixed per-occurrence overhead — checkout, toolchain selection, `doctor`, cache restore, `bootstrap`, `build` — is 38–48 seconds. The remaining five Journeys total 72–108 seconds, so an occurrence running only those completes in about 2 minutes to 2 minutes 36 seconds. Run locally on the developer host at this change's head, that sequence took 45.9 seconds.

Three minutes therefore cannot include J-01, which exceeds the whole budget by itself, and cannot include J-02, whose Windows range reaches 332 seconds. No ordering, caching, or parallel-shard arrangement changes that: the constraint is a single Journey's own duration. Splitting J-01 internally was considered and rejected below.

The two expensive Journeys are also the two unreliable ones. [`PROGRESS.md`](../../PROGRESS.md) records #345's J-02 intermittency — 2 failures in 5 sequenced local runs on a diff that touched neither runner nor product — and three J-01 intermittencies, two on the developer host without a stage name and one hosted at `review` on macOS during PR #399, a change that does not touch J-01 and had passed all seven Journeys locally at the same head. Every one of those false reds cost a Draft transition, a re-run, and Commander attention. Moving J-01 and J-02 to a scheduled occurrence keeps their coverage while taking them off the path that blocks an individual change.

[ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md), as amended by [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md), [ADR 0057](./0057-restore-hosted-gate-under-observed-actions-usage.md), and [ADR 0058](./0058-remove-actions-usage-observation-from-development-gating.md), states the exclusions this change crosses: no schedule or nightly activation path, and no secondary fast lane or weaker single-platform substitute. Those exclusions exist to stop engineering-proof machinery accumulating beside the one functional gate. This ADR is the Owner's explicit reversal of exactly two of them, for exactly this topology, and nothing else in ADR 0027 moves.

## Decision

### 1 · Two occurrences, one admitted set

The hosted surface becomes two workflows over one unchanged admitted Journey set:

- **`E2E Functional Gate`** (`.github/workflows/e2e.yml`) stays bound to the pull request on the same `opened`, `reopened`, `ready_for_review`, and `synchronize` triggers behind the same complete-pull-request-diff router. It now runs **Windows Server 2025 only**, and only the **bounded pull-request Journey set** J-08 → J-12 → J-15 → J-03 → J-04, through `pnpm run e2e:gate`. Its budget is three minutes.
- **`E2E Nightly Full Gate`** (`.github/workflows/e2e-nightly.yml`) runs on a daily `schedule` at 19:00 UTC and on `workflow_dispatch`, on **Windows and macOS**, over **every admitted Journey** through `pnpm run e2e:all`.

`ADMITTED_JOURNEYS` does not change. `GATE_JOURNEYS` in `e2e/controller.mjs` is a subset of it, never a second admission list: a Journey enters the pull-request set only after it is admitted, and admission still requires an explicit Owner routing decision.

### 2 · What each occurrence is evidence of

The pull-request occurrence answers a narrower question than before, and its name must not outrun it. It is evidence that the production-shaped subject still builds, launches, and completes five supported Journeys on Windows. Because every member launches the same subject through the same renderer, Electron main, service, composed Harness runtime, and private IPC, a broken build, launch, data root, IPC, service, or authority boundary still fails the pull request. It is **not** evidence about manuscript import or reimport, about anything only J-01 or J-02 reaches, or about macOS.

The nightly occurrence is the full Gate: every then-current executable admitted Journey on both platforms. It is the successor to what the paired pull-request Gate proved, moved from once per change to once per day.

A pull-request pass is never reported as a full or paired-platform Gate. `run-gate.mjs` emits `GATE_COMPLETION/…` markers, distinct from `run-all.mjs`'s `LOCAL_COMPLETION/…`, so the two cannot be confused in a log or a Change closure.

### 3 · Where the coverage J-01 and J-02 carried now sits

Three surfaces carry it, and the first is unchanged and mandatory:

- The **Local Verification Ladder** of [ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md) is untouched. `pnpm run e2e:all` on an actual Windows host at the exact head, all seven Journeys, still precedes Ready. This ADR moves a hosted occurrence; it grants no relief from local completion, and the Change closure still records every available layer. A Worker who has not run J-01 locally has not finished.
- The **nightly** runs all seven on both platforms daily.
- The **Commander** may dispatch the nightly workflow against an exact ref before integrating a change that touches manuscript import, reimport, the J-01 or J-02 runners, or the renderer, service, or domain paths they alone reach. `workflow_dispatch` exists for that judgment and for re-running a red nightly; it is not a per-pull-request step and does not become one.

### 4 · A red nightly

A red nightly is triaged by the Commander the morning it lands, against `dev` rather than against one pull request. The failing Journey is reproduced locally on the developer host through `pnpm run e2e -- --journey <id>`, and the defect is fixed under its own authorized Issue. Integration of unrelated work does not stop while that runs, because the nightly is not a per-change gate; a nightly failure that a specific pull request plainly caused does return that pull request to Draft. The one clearly-external-transient re-run allowance of [CI and test boundaries](../agents/ci-test-boundaries.md) applies to the nightly as it does to the pull-request occurrence, and #345's and #399's recorded intermittencies are the pattern to check before opening anything new.

`fail-fast` is false on the nightly matrix: a Windows failure must not hide the macOS result when the whole point of the occurrence is the daily paired picture. The pull-request lane carries no matrix at all — one Windows job, which stops at its first failing Journey the way `e2e:all` does.

### 5 · What does not change

Every provider-free boundary, public-test-material rule, product-subject and platform contract, payload-safe diagnostic rule, scenario-admission rule, and Commander-only integration rule stands exactly as written. No unit, lint, type-check, coverage, performance, security, packaging, or release gate is created; ADR 0027's other exclusions are unreversed. The nightly is not a release gate, a `main`-promotion authorization, or an Actions-usage instrument, and [ADR 0058](./0058-remove-actions-usage-observation-from-development-gating.md) continues to forbid querying, estimating, or considering Actions usage in any development decision.

## Consequences

- A product pull request now waits about 2–3 minutes for its hosted result instead of 10–22, and stops being blocked by macOS runner allocation.
- The two Journeys responsible for every recorded intermittency no longer fail individual pull requests. #345 and the three J-01 occurrences become nightly triage rather than per-change re-runs.
- Manuscript import and reimport regressions, and every macOS-specific regression, can now reach `dev` and be caught up to a day later by the nightly rather than at the pull request. This is the cost the Owner accepted for the latency. The Local Verification Ladder is the control that keeps the window small, which is why this ADR strengthens rather than relaxes it.
- `dev` is the default branch, so the schedule fires from it without a `main` promotion.
- The pull-request gate's name no longer describes the full admitted set, and neither do its Change closures. Any statement that all seven Journeys passed on both platforms must now name the nightly run or a local completion, not the pull-request check.

## Rejected alternatives

- **Split J-01 internally into a smoke slice and a full slice.** J-01 is a single 3,924-line sequential script driving roughly fifty scenarios through one browser session. Carving a stable subset out of it is a large, risky edit to the most intermittent runner in the repository, it would need its own Issue and its own verification, and it would not have delivered the Owner's change today. Worth revisiting as product work if J-01 keeps growing; not the way to buy latency now.
- **Parallel jobs, one Journey each.** Wall clock would fall to the fixed overhead plus the slowest single Journey — about 48 s + 283 s, still over five minutes, still missing the target — while multiplying occurrences and contradicting ADR 0049's one-occurrence topology for no gain.
- **Keep both platforms on the pull-request lane with the reduced set.** The five-Journey set costs about the same on either platform, so pairing would roughly hold the three-minute budget in the ordinary case, but macOS allocation added 13.5 minutes to one of the five measured occurrences and would put the budget at the mercy of the runner pool. macOS moves to the occurrence that is not waiting on a person.
- **Run the full set per pull request but only on Windows.** Still 8–10 minutes, still both intermittent Journeys on the blocking path. It fails the instruction.
- **Trigger the full set by path — run J-01 only when import code changes.** Rejected as the same class of mistake the existing router avoids: the failures actually observed on J-01 came from changes that did not touch it. A path filter would have skipped precisely the runs that failed.
