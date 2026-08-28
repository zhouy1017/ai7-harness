---
status: accepted
---

# Bound hosted Actions consumption inside the E2E Gate

This ADR records the Owner-approved GitHub Actions consumption boundary from Issue #111. It amends only the invocation cadence, local feedback loop, and current routing default of [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md). It does not revive the superseded tiered-verification programme or create a second gate. It is repository-current only from an exact integrated `dev` commit containing this revision; its workflow implementation requires a separate exact Issue, branch, pull request, and Commander integration.

## One integration-ready hosted occurrence

A pull request starts and remains Draft while its change is being written, debugged, reviewed, rebased, or locally validated. Draft activity consumes no hosted Actions. After the change is locally complete and the Commander has re-resolved target authority, the Commander—not a Worker—changes the pull request to Ready for review. That transition starts the one logical E2E Functional Gate.

A newer push while the pull request remains Ready starts the newest occurrence and cancels any superseded in-progress occurrence for that same pull request. This cancellation controls duplicate consumption; it is not exact-head proof and does not create a same-SHA admission rule. The workflow keeps the complete pull-request-diff Markdown router even though a Markdown-only Ready pull request consumes a small routing job, because GitHub trigger-level path filtering can omit files from large diffs. There is no label-, author-, component-catalog-, manual-dispatch-, direct-push-event, schedule-, nightly-, release-, package-, or exact-head activation path.

Every product-affecting Ready occurrence initially runs all currently admitted J-01, J-02, and J-08 journeys, with the identical journey set on Windows and macOS. Either platform failure fails the one logical gate. Admission of a fourth supported journey must explicitly reevaluate whether all changes still run all admitted journeys or whether a fail-closed routing authority is then justified. Until such a decision is integrated, shared, infrastructure, toolchain, bootstrap, build, launch, Gate, and unclassified changes run every admitted journey.

The resource objective is qualitative: normally one completed paired-platform Gate occurrence per integration-ready product change. No speculative billed-minute ceiling, second fast lane, or weaker single-platform substitute is created.

## Local development is the debugging loop

Hosted CI is integration evidence, not an iterative debugger. On the actual supported development host, a Worker restores only existing declared pins and runs `doctor`, `bootstrap`, `build`, and the Issue-applicable journey while implementing. Existing declared caches may accelerate iteration but are never authoritative inputs. Before reporting local completion, the Worker clears the change's build outputs, reruns `build` and the applicable journey, and reports the host, commands, and outcomes without committing logs, receipts, proof artifacts, private inputs, Provider payloads, or credentials.

A Worker may restore already accepted pinned dependencies. A new dependency still requires exact Issue authority. Provider calls, private manuscripts, private sample Books, untracked application inputs, personal dependency stores, and ambient generated outputs remain prohibited.

If the hosted Gate exposes a product, build, bootstrap, or journey failure, the Commander returns the pull request to Draft and the change is reproduced and fixed locally before another Ready transition. Only a clearly external GitHub runner, network, or infrastructure transient may be rerun once without a code change, and only by the Commander. A second occurrence or an ambiguous failure returns to Draft. Neither local validation nor advisory review substitutes for the formal paired-platform occurrence when that occurrence is required.

## Suspension, cutover, and queued work

The Owner suspended every GitHub-hosted Actions test on 2026-08-28 after confirming that the account's Actions minutes were exhausted. The exact `E2E Functional Gate` workflow is technically disabled for that suspension. Neither a quota reset, an elapsed billing period, a merged workflow change, nor available minutes restores authority; only a later exact Owner statement does.

While the workflow is disabled, development may continue on local task branches and Commanders may push branches and maintain Draft pull requests. Product implementation that requires the E2E Gate does not merge. Independent modules may proceed in parallel only from stable owners and interfaces on current `dev`; a necessary stacked dependency must be explicit, authorized, and ordered rather than silently consuming unintegrated candidate code.

Pure documentation, design, and CI-governance changes may integrate while the workflow remains disabled when their exact Change Brief permits it, after local validation. The Commander may request an optional advisory read-only review; its verdict informs the Commander's decision but never becomes a prerequisite, zero-finding, iterative re-review, or merge gate. This exception does not claim a green Gate and creates no required branch-protection status check.

The workflow cutover is a separate CI-governance outcome: start from then-current `dev`, implement only this ADR in the existing workflow, validate its static structure locally, optionally request advisory read-only review, and integrate it while the workflow remains disabled. Re-enablement waits for the exact Owner restoration statement. After restoration, queued product branches are processed one at a time in dependency order: re-resolve target authority, rebase onto current `dev`, locally revalidate, make Ready, run one paired-platform Gate occurrence, merge, then advance to the next branch. No synthetic run is dispatched merely to test CI.

## Consequences

The Gate's admitted scenarios, provider-free execution interval, public-test-material rules, fresh subject construction, platform parity, failure semantics, and exclusions remain owned by ADR 0027 and the CI boundary. Normal Commander-only external action and integration authority is unchanged. Superseded ADR and Question 24 history remains intact as history; none of its old lanes, receipts, budgets, catalogs, or release gates becomes current again.
