# Change Brief

The GitHub Issue body is the bounded brief. Link the plan slice, accepted ADRs, contexts and predecessor work instead of repeating their rules. [Orca dispatch](orca-dispatch.md) owns assignment, model recommendations, startup, handoff and merge records.

## Work-ready Issue

```md
Brief revision: <n>
Class: T1 | T2 | T3
Plan slice: <existing slice or named follow-up> · Journey: <J-xx | N/A>
Dependencies: <Issue/PR links>
Wave / slice / exact base: <recorded assignment or assignment link>

## Outcome
One user-visible result or exact non-product outcome; describe current and resulting behavior.

## Acceptance criteria
- [ ] Observable result and its appropriate check.

## Hint Paths
Starting owners, paths, schemas and synchronized projections; necessary related files and E2E runners may be edited to complete the outcome.

## Non-goals
Boundaries this slice does not expand.

## Journey and Gate disposition
`exact reuse — checked unchanged` | `synchronized delta: <runner/stages>` | `N/A — documentation/CI governance; explain why no product Journey changes`

## Stop when
A genuinely unresolved outcome, missing external dependency or action outside current authorization needs a decision; related-file edits, historical ADR/UI wording and F-25 growth do not require a stop.

## Authority
Links to the plan, ADRs, context sections and predecessor work.
```

Increment the brief revision when outcome, class, scope, dependencies or acceptance changes. Owner session instructions or delegated Commander dispatch take precedence without an exemption; record material outcome changes in the existing brief/PR, and routine base movement follows its candidate revalidation rule. Historical body hashes and receipts are evidence, not new launch prerequisites.

## Assignment prompt

Give the Issue URL, brief revision and the exact assigned workspace/base. Under [Orca dispatch](orca-dispatch.md), the Owner may manually dispatch one Issue at a time to a single coding agent without a cross-provider Reviewer handoff; repair is required only when E2E or CI tests fail.

## Pull-request closure

```md
### Change closure
- Outcome and linked Issue
- Planned versus actual change; owners touched; new owner and reason
- Incoming reviewed head, final corrected/tested head and target base, as applicable
- Applicable checks, guest/host, results and disclosed skips; documentation checks for documentation-only work
- Migration, cleanup, unresolved matters and next action
- Version: unchanged | raised to x.y.z with its ledger row (wave integration, ADR 0098)
- Integration status: slice in wave | final wave in dev
```

Product validation and guest requirements are owned by [CI and test boundaries](ci-test-boundaries.md); release responsibility and exact-candidate acceptance by Orca dispatch. Complete necessary related edits and repairs under the current outcome; escalate only a genuinely new outcome or unresolved authorization.
