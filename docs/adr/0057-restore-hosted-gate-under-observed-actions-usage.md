---
status: accepted
---

# Restore the hosted Gate under observed Actions usage

On 2026-09-01 the Owner confirmed that GitHub Actions capacity is again available at 3,000 included minutes per month and authorized the Commander to restore exact workflow `E2E Functional Gate` (ID `342459594`). Restoration is conditional on truthful actual-usage observation, infrequent integration-ready invocation, and the existing rule that Hosted CI is integration evidence rather than a development debugger.

This decision ends the Actions-exhaustion condition recorded by [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md) and narrowly supersedes the prospective pre-boundary `disabled_manually`/unrun and macOS-deferral clauses in [ADR 0054](./0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md), plus the workflow-disablement and dormant-projection clauses in [ADR 0055](./0055-stage-the-bounded-provider-free-j-03-authorization-journey.md) and [ADR 0056](./0056-stage-the-bounded-provider-free-j-15-artifact-lifecycle-journey.md). It restores [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md)'s normal low-usage paired-platform lifecycle after this decision and its truthful workflow configuration integrate. It does not retrospectively relabel an earlier pull request, cross the Initial v1.0.0 Development Milestone Boundary, or remove ADR 0053's bounded fallback for a future independently recorded external CI condition.

## Safe restoration sequence

The workflow must remain disabled throughout Issue #166's authoring, local validation, Draft pull request, and integration. Before enablement, the Commander rechecks that exact workflow identity and state, that no run is queued or in progress, that no open Ready pull request can trigger immediately, and that integrated `dev` invokes only real executable admitted Journeys. The Commander then enables the workflow as one explicit external action. Enablement starts no run and grants no dispatch, rerun, probe, retrospective backfill, synthetic run, release, or `main` authority.

At this cutover, J-15 is real and J-03 remains dormant. The workflow therefore executes J-01 → J-02 → J-08 → J-12 → J-15 and contains no J-03 command, placeholder, conditional skip, or completion claim. Issue #47 remains responsible for supplying the real J-03 runner and dispatcher and atomically adding J-03 to local `e2e:all` and the hosted workflow. A dormant Journey may never be kept in an active job merely as a projection.

## Normal low-usage operation

All implementation and debugging completes locally while the pull request is Draft. Only the Commander moves one locally complete, authority-re-resolved pull request to Ready. That transition arms the one normal occurrence; product-affecting changes run the complete then-current executable set on both Windows and macOS. A later repair or changing push must return the pull request to Draft before the push and may become Ready only after local completion is restored. Same-pull-request concurrency cancellation remains a last-resort consumption bound, not permission to push repeatedly while Ready.

A product, bootstrap, build, or Journey failure returns the pull request to Draft for local reproduction and repair. Only the Commander may rerun one occurrence when the failure is clearly an external GitHub runner, network, or infrastructure transient and no source change is required. A second occurrence or ambiguous failure returns to Draft. No `workflow_dispatch`, direct `push`, schedule, nightly run, fast lane, selective platform/Journey route, or second workflow is added.

The qualitative objective remains normally one completed paired-platform occurrence per integration-ready product change. This 3,000-minute availability fact is not a speculative per-pull-request ceiling, engineering proof budget, or permission to consume the full account allowance.

## Observe actual consumption outside Actions

Monitoring must not itself consume Actions. Before each Ready transition, the Commander or account Owner reads GitHub's authoritative account-wide month-to-date Actions usage and the repository attribution available from the Billing and licensing usage surface or its supported read API. After the occurrence completes, the same surface and the run/job Usage view are checked for the actual delta and any unexpected duplicate or platform duration. GitHub's billing and run records remain the source; the repository gains no usage ledger, scheduled query, monitoring job, receipt artifact, or additional gate.

If current account usage cannot be read, the remaining allowance is unavailable or exhausted, or an unexpected duplicate/unexplained increase appears, the next product pull request remains or returns Draft. No run is launched to discover the balance. The Commander may disable exact workflow `342459594` as containment, records the external condition, and uses ADR 0053 only when all of its exact activation conditions are satisfied. Reading usage does not authorize widening OAuth scopes, changing the GitHub plan, or creating billing/spend policy; any unavailable account-level read is escalated to the Owner rather than bypassed.

At restoration, the Owner's 3,000-minute confirmation is the authoritative account-availability fact, and read-only repository inspection found zero September runs, queued runs, or in-progress runs. The current Commander credential cannot read account billing because it lacks the required account Plan-read scope; this decision grants no silent permission expansion.

## Evidence timing and preserved boundaries

Until the Initial v1.0.0 Development Milestone Boundary, fresh exact-head Windows `doctor` → `bootstrap` → `build` → `e2e:all` remains the Local-completion prerequisite before a product pull request becomes Ready. While the restored workflow is active and able to run, the applicable Ready pull request then requires one successful paired Windows/macOS Hosted Gate before merge; either platform failure fails the logical Gate. ADR 0054's earlier Windows-only disclosures remain truthful for work already integrated, but its prospective macOS deferral is suspended during restored normal operation.

If a future external condition makes the Gate unavailable and the exact ADR 0053 degraded mode is activated, ADR 0054 continues to govern the pre-boundary Windows Local-completion fallback and truthful macOS deferral for that degraded interval. Its milestone definition, expiry, consolidated re-entry requirement, release exclusions, and prohibition on retrospective evidence remain unchanged.

This decision changes no Gate identity, provider-free interval, Journey meaning, Windows/macOS product parity, public-test-material rule, cache boundary, payload/log/artifact restriction, dependency authority, Provider authority, product behavior, release authority, or excluded proof surface. Rollback containment is manual disablement without a run; any durable reversal follows its own Issue and pull request.
