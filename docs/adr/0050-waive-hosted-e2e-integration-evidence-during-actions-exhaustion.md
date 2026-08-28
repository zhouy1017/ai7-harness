---
status: accepted
---

# Waive hosted E2E integration evidence during Actions exhaustion

The Owner accepts a temporary loss of per-pull-request hosted Windows/macOS integration evidence while GitHub Actions usage is exhausted, rather than blocking every otherwise-ready product integration. This decision temporarily amends only [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md)'s hosted-occurrence-before-merge and suspension clauses. It becomes repository-current only from an exact integrated `dev` commit containing this ADR and its runbook projections.

## Activation boundary

The waiver is active only while all of these conditions hold:

- exact workflow `E2E Functional Gate` (ID `342459594`) is `disabled_manually`;
- no run of that workflow is queued or in progress; and
- no fresh usable GitHub Actions allocation after reset has been authoritatively confirmed.

A fresh usable allocation is authoritatively confirmed only by a Commander-recorded observation from GitHub billing or usage state, or by an exact Owner confirmation based on that state. A calendar date, elapsed billing period, visible workflow control, attempted enablement, or attempted run is not confirmation.

Immediately before changing an otherwise integration-ready product pull request from Draft to Ready, and again immediately before merging it, the Commander records the exact workflow state and the absence of queued or active runs. Each pull request integrated under the waiver states:

> Hosted E2E Functional Gate: temporarily waived under ADR 0050 because Actions usage remained exhausted; workflow 342459594 was disabled_manually with no queued or active run; no hosted run, green Gate, or substitute Gate is claimed.

The workflow remains disabled, and no run starts during the waiver. No workflow may be enabled, dispatched, run, or rerun to probe for reset or to manufacture evidence. A local check, advisory review, fake green result, different workflow, single-platform run, or other substitute never becomes the Gate or satisfies its normal paired-platform occurrence.

## Unchanged completion and integration rules

Only hosted integration evidence is waived. Every Worker still completes the unchanged repository-root `doctor` → `bootstrap` → `build` → applicable journey sequence on the actual supported development host, solves every locally reproducible failure, clears the change's build outputs, and reruns `build` plus the applicable journey before reporting. Existing dependency authority, provider-free/public-material boundaries, privacy and credential rules, Effect and release boundaries, one-Issue/branch/pull-request/Worker discipline, target-authority re-resolution, explicit dependency order, and Commander-only Ready/merge/external-action authority all remain in force.

Waived product pull requests integrate one at a time in authorized dependency order. ADR 0027's one logical Gate identity, J-01/J-02/J-08 journey admission, complete-diff routing, Windows/macOS parity whenever the Gate runs, failure meaning, and excluded proof surfaces are unchanged. This waiver creates no platform waiver, substitute proof surface, branch-protection check, release authority, or `main`-promotion authority.

## Immediate expiry and controlled restoration

Authoritative confirmation of a fresh usable Actions allocation after reset expires this waiver immediately. A Ready but unmerged pull request then returns to ADR 0049's normal Gate lifecycle and may not merge until the paired-platform occurrence succeeds.

The Owner prospectively authorizes the Commander, only after that authoritative reset confirmation, to re-enable exact workflow `342459594` as a separate explicit action and resume ADR 0049. This authority does not permit a probe, retrospective run, manual dispatch, different workflow, automatic enablement, release, or promotion to `main`.

Product pull requests already merged under the active waiver receive no synthetic or retrospective run. The next normal product Gate exercises then-current integrated `dev`; it is not a backfilled proof receipt for earlier merges.

## Consequences

The project temporarily accepts that a platform-specific regression may integrate without fresh hosted detection. Local completion remains development evidence from the Worker's actual supported host but is not represented as paired-platform or hosted evidence. Reverting this authority before any waived product merge removes the exception; after a waived merge, normal forward validation and Gate operation resume without inventing historical evidence.
