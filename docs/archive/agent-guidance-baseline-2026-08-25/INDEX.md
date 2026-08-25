# Agent-guidance baseline archive

## Lifecycle node

The owner accepted the repository-agent guidance shape: a thin root router, node-driven recurring archive sweeps, stable-authority protection, tiered Change Briefs, and two-level replacement authorization. The successor root routers in this change consume the prior accumulated onboarding/checkpoint material. The compact migration router applies the branch-local supersession already recorded by ADR 0027 to the old plan's active-sounding verification clauses.

The source snapshot captured this guidance as an unintegrated candidate. Issue #14 recovered it onto the current aggregate and reconciled every later product/buildability constraint. The archive transition is atomic with the normal pull-request/Commander integration into `design-doc`; before that merge this index describes the candidate sweep, and after that merge the successor routers become current on that branch. Neither state changes canonical `main` or grants product-implementation authority.

The triggers are successor-confirmed handoff/checkpoint consumption and formal branch-local supersession, not the date. The date only disambiguates the archive path.

## Exact archive scope

- Source base: `design-doc@2932f61f5907558587122c7c4e0b92580951ab58`.
- Scope: exactly the eight original paths listed below; no other candidate, frozen, design, review, or handoff package was swept.
- Integration target for this sweep: `design-doc` through Issue #14 after target-qualified reconciliation; the final PR/merge identity belongs in the aggregate freeze record rather than this pre-merge archive payload. Any future promotion to `main` requires a separately authorized Issue/branch/pull-request/Commander flow against the then-current canonical target.

## Artifacts and replacements

| Original path | Archived path | Final status | Reason | Current replacement | Retrieval condition |
| --- | --- | --- | --- | --- | --- |
| `PROGRESS.md` | `PROGRESS-before-compaction.md` | consumed | Multiple historical checkpoints and stale Resume Prompts made current-state reconstruction expensive and ambiguous | Root [`PROGRESS.md`](../../../PROGRESS.md) | A current Issue must name an exact historical checkpoint not recoverable from Git metadata or current authority records |
| `HANDOFF.md` | `HANDOFF-before-compaction.md` | consumed | Mixed current routing with design chronology and open-item narrative | Root [`HANDOFF.md`](../../../HANDOFF.md), [`AGENTS.md`](../../../AGENTS.md), and [agent router](../../agents/README.md) | A current authority conflict requires the exact pre-baseline trap or routing statement |
| `kick-in/04-migration-workflow.md` | `migration-workflow-before-compaction.md` | superseded | Its phase sequence retained Test Catalog, replay/provider, proof, and separate-gate language superseded on this branch by ADR 0027; retained direction is promoted to the compact router | Current [migration router](../../../kick-in/04-migration-workflow.md), [incremental lifecycle](../../agents/incremental-development.md), and [CI boundary](../../agents/ci-test-boundaries.md) | A current migration decision needs the historical rejected/retained rationale, not an implementation requirement |
| `handoff20260817/KICKOFF-PROMPT.md` | `handoff20260817/KICKOFF-PROMPT.md` | consumed | Initial remote-session kickoff has completed | Root [`AGENTS.md`](../../../AGENTS.md) and [`HANDOFF.md`](../../../HANDOFF.md) | Investigating the exact 2026-08-17 session bootstrap only |
| `handoff20260817/PROJECT-OVERVIEW.md` | `handoff20260817/PROJECT-OVERVIEW.md` | historical evidence | Later accepted decisions and aggregate resolution supersede its current-state claims | [Project constraints](../../agents/project-constraints.md), [aggregate router](../../design-doc/README.md), and [`CONTEXT-MAP.md`](../../../CONTEXT-MAP.md) | Reconstructing the initial design overview at its historical pin |
| `handoff20260817/SESSION-HANDOFF.md` | `handoff20260817/SESSION-HANDOFF.md` | consumed | Successor sessions consumed it and recorded later authority owners | Root [`PROGRESS.md`](../../../PROGRESS.md), [`HANDOFF.md`](../../../HANDOFF.md), and [aggregate router](../../design-doc/README.md) | Investigating an exact owner correction from the original session |
| `handoff20260817/STATE-RECONSTRUCTION.md` | `handoff20260817/STATE-RECONSTRUCTION.md` | historical evidence | It reconstructs an interrupted session and explicitly carries dated/superseded state | [Decision map](../../../kick-in/05-decision-map.md), [design authority](../../agents/design-authority.md), and root [`AGENTS.md`](../../../AGENTS.md) | Auditing the reconstruction method or an exact 2026-08-17 evidence claim |
| `handoff20260817/raw-conversation.md` | `handoff20260817/raw-conversation.md` | historical evidence | It is the only first-party artifact here retaining exact owner acceptance wording and session ordering; its size and transcript form exclude it from ordinary context | [Decision map](../../../kick-in/05-decision-map.md), [`CONTEXT-MAP.md`](../../../CONTEXT-MAP.md), and [design-authority router](../../agents/design-authority.md) | Only an explicit owner/Commander request to verify exact acceptance wording or reconstruction evidence that no curated record can resolve |

## Archive rules

- Contents retain their historical wording and authority status; they do not become current by citation.
- Relative links inside captured files may reflect their original active paths. Use this index for current replacements.
- Do not scan the directory to discover work, unresolved questions, tests, or implementation requirements.
- Corrections to current meaning belong in current authority owners. Add only archive-provenance clarification to this index when necessary.
