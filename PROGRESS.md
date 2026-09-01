# Current checkpoint

## What's done

- The Owner confirmed on 2026-09-01 that GitHub Actions capacity is again available at 3,000 included minutes per month and authorized restoring exact workflow `E2E Functional Gate` (ID `342459594`) under actual-usage observation, infrequent integration-ready execution, and the existing prohibition on using Hosted CI as a debugger.
- Issue #166 contains the full CI-governance Change Brief. Branch `ci/166-restore-hosted-gate` and this worktree start from exact `origin/dev@12f66e229037b33d04c039ff9e3e679e00772b95`; the stale main `dev` checkout and its untracked `.agents/` and `skills-lock.json` remain untouched.
- Read-only GitHub inspection confirmed one workflow, state `disabled_manually`, no open pull request, no queued or in-progress run, and no September run. No workflow was enabled, dispatched, rerun, or probed.
- ADR 0057 now records the exact safe restoration sequence, normal paired-platform evidence lifecycle, outside-Actions usage observation, and future degraded fallback. The current AGENTS/CI/Git/incremental/dispatch runbooks route to it while preserving ADR 0054's milestone definition and degraded-interval Windows-only fallback.
- `.github/workflows/e2e.yml` now invokes exactly J-01 → J-02 → J-08 → J-12 → J-15. Dormant J-03 is absent until Issue #47 supplies its real runner/dispatcher and atomically updates local and hosted orchestration. Triggers, Draft suppression, permissions, complete-diff router, concurrency, paired matrix, action pins, cache, bootstrap, build, and the five real Journey commands are unchanged.
- Local static validation passed: the workflow command list equals `ADMITTED_JOURNEYS`; the workflow differs from the exact base only by the J-03 job-label/step removal; all nine `e2e/*.mjs` files pass `node --check`; changed Markdown links, final newlines and whitespace pass; and `git diff --check` passes. Two independent read-only review axes returned CLEAN. No product Journey or Actions occurrence was run.

## What's next

- Re-resolve exact `dev`, commit the validated unit, and integrate Issue #166 through a Draft pull request while workflow `342459594` remains disabled.
- After integration, perform the scoped lifecycle sweep and fresh live-state checks. Only then may the Commander enable the exact workflow without dispatch or backfill.

## Key decisions

- Restoration reuses the existing Ready-only, Draft-suppressed, same-PR-cancelling paired Gate. It adds no workflow, trigger, fast lane, schedule, manual dispatch, or numeric engineering budget.
- Usage observation remains outside Actions: GitHub's account/repository billing meter and run/job Usage are the source. The current CLI token lacks the account Plan-read scope, so it must not be silently expanded; the Owner's 3,000-minute confirmation and the repository's zero September runs are the truthful starting facts.
- Hosted CI remains integration evidence. Product/build/Journey failures return the pull request to Draft for local repair; only one clearly external transient may be rerun by the Commander.

## Unresolved matters or blockers

- No implementation blocker. Account-wide minute details require the Owner-visible GitHub billing surface or a separately granted read scope; Issue #166 creates no permission expansion. The CLI read failed for missing Plan-read and no signed-in external browser was available, so the Owner's current 3,000-minute confirmation remains the truthful account baseline and the repository's zero September runs remain the repository baseline.
- Issue #47 remains independently blocked by Issue #165 and stays outside this change.

## Safe Resume Prompt

```text
Continue Issue #166 from exact origin/dev@12f66e2 in ci/166-restore-hosted-gate. Re-resolve dev, commit the validated CLEAN diff, and integrate through a Draft PR while workflow 342459594 stays disabled and unrun. After the scoped lifecycle sweep and fresh state checks, enable only that workflow without dispatch or backfill. Do not probe, rerun, expand billing permissions, or touch Issue #47 product scope.
```
