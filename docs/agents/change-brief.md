# Change Brief

The GitHub Issue body is the bounded brief. Link the plan slice, accepted ADRs, contexts and predecessor work instead of repeating their rules. [Orca dispatch](orca-dispatch.md) owns assignment, actual model pairing, startup, handoff and merge records.

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

## Allowed to change
Named owners, paths, schemas and synchronized projections.

## Non-goals
Boundaries this slice does not expand.

## Journey and Gate disposition
`exact reuse — checked unchanged` | `synchronized delta: <runner/stages>` | `N/A — documentation only`

## Stop when
An insufficient scope, authority conflict or missing dependency requires Commander re-slicing.

## Authority
Links to the plan, ADRs, context sections and predecessor work.
```

Increment the brief revision when outcome, class, scope, dependencies or acceptance changes. The Commander resolves material changes through Orca dispatch; routine base movement follows its candidate revalidation rule. Historical body hashes and receipts are evidence, not new launch prerequisites.

## Assignment prompt

Give the Issue URL, brief revision and the exact assigned workspace/base or incoming PR head. Include the role assignment link from Orca dispatch. The agent verifies those records before editing; an author's full transcript is not the review brief.

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

Product validation and guest requirements are owned by [CI and test boundaries](ci-test-boundaries.md); release responsibility and exact-candidate acceptance by Orca dispatch. Work that exceeds its brief returns for re-scoping before acceptance.
