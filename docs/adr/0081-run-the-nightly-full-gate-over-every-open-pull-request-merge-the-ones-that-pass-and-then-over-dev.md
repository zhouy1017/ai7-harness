# ADR 0081: Run the nightly full Gate over every open pull request, merge the ones that pass, and then over `dev`

Status: **accepted** — the Owner's decision of 2026-09-11, recorded verbatim and landed in the pull request that implements it; the Owner's word to merge that pull request is the acceptance.

Amends [ADR 0075](./0075-split-the-hosted-gate-into-a-fast-pull-request-lane-and-a-nightly-full-gate.md) §1, §2 and §4, and the integration rule of [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md). Leaves [ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md), [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md) and [ADR 0058](./0058-remove-actions-usage-observation-from-development-gating.md) as they are.

## Context

ADR 0075 split the hosted Gate into a three-minute Windows pull-request lane over `GATE_JOURNEYS` and a nightly full set on Windows and macOS. The nightly ran once a day against `dev` alone. Every pull request therefore reached `dev` on the pull-request lane plus the developer-run Local Verification Ladder, and the full paired-platform Gate saw the change only after it was integrated. On 2026-09-11 the Owner stated what the tiered Gate was for:

> nightly gate 只在每天对 dev 执行一次，我希望 nightly 进行时应该先把 open PR 也都过一遍，然后自动合并通过的部分，最后再进行 dev 的检查。这才是我们 tiered gate 的目的。

and, asked whether integration should stay behind a Commander-applied label:

> 目前项目只有我一个开发者，所以默认所有 PR 都是测完就可以合并的。

`dev` carries no required status check and no required review; integration has been a process rule (the Commander alone integrates), not a platform rule.

## Decision

1. **The nightly is a serial merge queue over open pull requests, then the daily `dev` record.** At 19:00 UTC the queue lists every open, non-draft pull request against `dev` that GitHub reports mergeable, in ascending number order. For each candidate in turn it builds the tree that would land — the candidate squashed onto the *current* `dev` tip — and runs the full admitted Journey set on that tree on Windows and macOS. If both platforms pass and `dev` has not moved since the candidate was prepared, the queue squash-merges the pull request; the next candidate is then prepared against the new tip. After the last candidate the queue runs the full set once more on the final `dev` tip. That last run is ADR 0075's daily record and runs whether or not any candidate merged or failed.
2. **A pull request that passes is merged without a further human step.** The Owner is the one developer; the Local Verification Ladder attestation in the Change closure (ADR 0062) and the Commander's review before Ready remain the conditions for a pull request being open and non-draft at all, so the queue executes an integration the process has already authorized. This amends "the Commander alone integrates": the Commander alone *decides* what is open and Ready; the queue performs the merge, serially, with the revalidation the dispatch runbook requires.
3. **A candidate that fails stays open and is attributed to itself.** The queue comments on the pull request with the run link and the failing platform and Journey, and continues with the next candidate; candidates are independent unless one's merge changes the base the next is prepared on, which the serial order already handles. A candidate that cannot be squashed onto the current tip is skipped with a comment naming the conflict. A red *`dev`* run is triaged by the Commander the morning it lands, exactly as ADR 0075 §4 says.
4. **Owner-reserved records are tested but not merged by the queue.** A pull request that adds or changes an ADR whose status line reads `proposed`, or that changes a canonical policy document under `docs/policies/`, runs through the same full set and is reported on, but is left open for the Owner's own word — the byte review of [ADR 0079](./0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §2.5 and the acceptance an ADR requires are decisions, not test outcomes. This is the one exclusion; it is stated in the workflow as a path list so the Owner can widen or empty it.
5. **What each occurrence is now evidence of.** The pull-request lane stays what ADR 0075 §2 made it: a three-minute Windows check that the subject builds, launches and completes five Journeys. A candidate run is the full paired-platform Gate over the exact tree that will land, and a merge is evidence that it passed. The final `dev` run is the full Gate over what did land. `run-all.mjs`'s `LOCAL_COMPLETION/…` markers, and the per-Journey disclosed-skip lines it prints, are what the queue reads; no new marker vocabulary is created.
6. **What does not change.** Every provider-free boundary, public-test-material rule, payload-safe diagnostic rule and scenario-admission rule stands. The queue creates no unit, lint, type-check, coverage, packaging or release gate (ADR 0027), is not a `main`-promotion authorization, and — under ADR 0058 — is neither sized nor scheduled by Actions usage. The nightly's own `workflow_dispatch` against an exact ref stays available to the Commander for the judgment ADR 0075 §3 describes.

## Consequences

- A change reaches `dev` the night after it is Ready, having been run on both platforms as the tree that landed, instead of on the developer host alone plus a Windows five-Journey check. Serial preparation against the moving tip replaces the manual rebase-and-revalidate the dispatch runbook asked of each remaining branch after every integration.
- The Commander's morning starts from the queue's record: which candidates merged, which failed at what, and whether `dev` is green. Integration during the day by the Commander remains possible and is not forbidden; the queue simply finds fewer candidates.
- Two workflow files carry the queue — the scheduled orchestrator and a reusable per-candidate workflow that the existing full-gate workflow is folded into as a callable job — and one Node script under `tools/` carries the candidate listing, preparation and merge logic so `pnpm run check`'s `node --check` covers it and its filter has unit cases. `e2e-nightly.yml` keeps `workflow_dispatch` and gains `workflow_call`; its own daily `schedule` moves to the orchestrator so `dev` is not run twice.
- The merge needs `contents: write` and `pull-requests: write` on the workflow token. `dev`'s protection permits a squash merge by that token today; if that ever changes, the queue stops at the merge step with a comment and the Owner decides on a token or a protection change — an external action the Commander never takes alone.

## Rejected alternatives

- **A Commander-applied label as the condition for merging.** Proposed by the Commander to keep "the Commander alone integrates" literal; declined by the Owner for a single-developer project where a Ready pull request is by definition one the process has approved. Recorded so it can be reinstated the day a second developer appears.
- **GitHub's native merge queue with the full set as a required check.** The same serial-revalidate-and-merge idea, platform-native and immediate rather than nightly, but it requires a ruleset on `dev`, a `merge_group` trigger and repository settings the Owner would have to make by hand; it stays the named successor if the nightly cadence proves too slow.
- **Testing candidates in parallel and merging the passers together.** Faster, but a merge of two individually green candidates is a tree nobody tested; the serial order is the point.
