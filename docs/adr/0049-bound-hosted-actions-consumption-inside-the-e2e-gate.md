---
status: accepted
---

# Bound hosted Actions consumption inside the E2E Gate

This ADR records the Owner-approved GitHub Actions consumption boundary from Issue #111. It amends only the invocation cadence, local feedback loop, and current routing default of [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md). It does not revive the superseded tiered-verification programme or create a second gate. It is repository-current only from an exact integrated `dev` commit containing this revision; its workflow implementation requires a separate exact Issue, branch, pull request, and Commander integration. [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md) later amends this ADR's local-completion, hosted-consumption, and unavailable-hosted-integration clauses.

## One integration-ready hosted occurrence

A pull request starts and remains Draft while its change is being written, debugged, reviewed, rebased, or locally validated. Draft activity consumes no hosted Actions. After the change is locally complete and the Commander has re-resolved target authority, the Commander—not a Worker—changes the pull request to Ready for review. That transition starts the one logical E2E Functional Gate.

A newer push while the pull request remains Ready starts the newest occurrence and cancels any superseded in-progress occurrence for that same pull request. This cancellation controls duplicate consumption; it is not exact-head proof and does not create a same-SHA admission rule. The workflow keeps the complete pull-request-diff Markdown router even though a Markdown-only Ready pull request consumes a small routing job, because GitHub trigger-level path filtering can omit files from large diffs. There is no label-, author-, component-catalog-, manual-dispatch-, direct-push-event, schedule-, nightly-, release-, package-, or exact-head activation path.

[ADR 0051](./0051-admit-j-12-as-the-fourth-supported-e2e-journey.md) records the historical fourth-Journey decision. [ADR 0055](./0055-stage-the-bounded-provider-free-j-03-authorization-journey.md) now admits Issue #47's bounded J-03 slice as the next supported Journey decision and stages its executable cutover without deciding a fixed later count. Until another separately authorized Journey implementation lands, the executable set remains J-01, J-02, J-08 and J-12. Issue #88's required but unresolved J-15 routing decision may change that set before Issue #47. Issue #47 must then add the real J-03 runner/dispatcher and atomically add J-03 to the then-current local orchestration. Every later product-affecting Ready occurrence runs every then-current executable admitted Journey on both Windows and macOS; shared and unclassified changes fail closed to that same set, and either platform failure fails the one logical gate. Any further admission still requires an explicit Owner decision and separate CI-governance integration.

The resource objective is qualitative: normally one completed paired-platform Gate occurrence per integration-ready product change. No speculative billed-minute ceiling, second fast lane, or weaker single-platform substitute is created.

Within each applicable platform occurrence, checkout, exact tool selection, bootstrap, and build happen once before every then-current executable admitted Journey runs sequentially. ADR 0053 permits the narrow integrity-reverified Electron download cache and failure early-stop; a successful occurrence still completes the whole then-current set on both platforms. The disabled workflow may project J-03 after J-12 before Issue #47 supplies its runner, but that dormant projection may not execute or become evidence.

## Local development is the debugging loop

Hosted CI is integration evidence, not an iterative debugger. On the actual supported development host, a Worker restores only existing declared pins and runs `doctor`, `bootstrap`, `build`, and the Issue-applicable journey while implementing. Existing declared caches may accelerate iteration but are never authoritative inputs. Before reporting local completion, the Worker clears the change's build outputs, reruns `build` and the applicable journey, and reports the host, commands, and outcomes without committing logs, receipts, proof artifacts, private inputs, Provider payloads, or credentials.

A Worker may restore already accepted pinned dependencies. A new dependency still requires exact Issue authority. Provider calls, private manuscripts, private sample Books, untracked application inputs, personal dependency stores, and ambient generated outputs remain prohibited.

If the hosted Gate exposes a product, build, bootstrap, or journey failure, the Commander returns the pull request to Draft and the change is reproduced and fixed locally before another Ready transition. Only a clearly external GitHub runner, network, or infrastructure transient may be rerun once without a code change, and only by the Commander. A second occurrence or an ambiguous failure returns to Draft. Neither local validation nor advisory review substitutes for the formal paired-platform occurrence when that occurrence is required.

## Unavailable hosted execution

The Owner suspended every GitHub-hosted Actions test on 2026-08-28 after confirming that the account's Actions minutes were exhausted. Exact workflow `342459594` remains disabled until a separately authorized restoration action.

ADR 0053 now owns the only CI-degraded activation, Local completion, affected-platform stop, one-at-a-time integration, disclosure, and exit rules. Its path waives only the missing hosted occurrence and never claims a green, paired-platform, single-platform, or substitute Gate. A product/bootstrap/build/Journey failure cannot enter that path.

Pure documentation, design, and CI-governance changes may integrate while the workflow is disabled only when their exact Change Brief permits it and after applicable local validation. Optional independent review remains advisory and non-gating. No workflow is enabled, dispatched, rerun, or replaced to probe availability, and no retrospective result is manufactured.

## Consequences

The Gate's admitted scenarios, provider-free execution interval, public-test-material rules, fresh subject construction, platform parity, failure semantics, and exclusions remain owned by ADR 0027 and the CI boundary. Normal Commander-only external action and integration authority is unchanged. Superseded ADR and Question 24 history remains intact as history; none of its old lanes, receipts, budgets, catalogs, or release gates becomes current again.
