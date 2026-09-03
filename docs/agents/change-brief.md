# Change Brief

The Change Brief is not a separate paperwork system. Put the applicable form directly in the GitHub Issue body; a Codex launch prompt points to that immutable revision instead of duplicating it.

Link to an accepted definition, ADR, Issue section, or existing code location instead of restating it. Write one grouped `N/A — <short reason>` for an inapplicable subsection or consecutive dimensions; do not repeat `N/A` field by field. Template-shaped narrative, duplicated context, and boilerplate inserted only to fill every heading are prohibited.

## Issue identity and revision

Every work-ready Issue body begins with:

```md
Brief revision: <positive integer>

## Main Worker binding

- Role: Worker
- Task class: T1 | T2 | T3
- Requested binding: `<model> @ <reasoning effort>`
```

The requested binding is the fixed class binding in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md). A Reviewer's binding belongs in that Reviewer's own Launch/Return Receipts, not in this main Worker block. The Commander computes `issue_body_sha256` over the exact UTF-8 bytes of the GitHub API `body` string, without a CLI-added newline.

Before launch, increment `Brief revision` when a body edit changes role, class, binding, outcome, authority, exact base/target, branch/worktree ownership, structural budget, non-goals, stop conditions, validation, or reporting/external-action boundaries. An editorial-only pre-launch edit may keep the revision if the contract is unchanged, but its hash must be recomputed. The `create_thread` request freezes the expected revision/hash; any later body-byte change prevents or invalidates that attempt. After a Launch Receipt, even an editorial-only body change requires an incremented revision, new attempt, and fresh Task Session. Comments, labels, and assignments outside the body do not restart an attempt.

## Short form — mechanical T1

```md
### Change Brief — T1

- Outcome:
- Authority/source:
- Exact base and intended target commit:
- Allowed paths:
- Non-goals:
- Stop if:
```

Use this only when correctness requires little judgment and no product behavior, domain meaning, public interface, schema, dependency, process, authority, privacy, Effect, migration, or supported journey changes.

## Full form — every non-mechanical change

```md
### Change Brief

#### Authority Resolution
- Exact base / branch or detached state:
- Intended integration target commit:
- Canonical authority (`<target-commit>:<path>` for each ADR / Policy Document / context):
- Owner authorization and scope:
- Commander dispatch/execution authority and scope:
- Issue / implementation journey or observed bug; otherwise `N/A — documentation/design-only`:
- Candidate or historical inputs (status preserved):
- Supersession required:
- Open matters deliberately out of scope:

#### Outcome
- User-visible result or exact non-product outcome:
- Current behavior or failure:
- Completion boundary:

#### Existing State and Reuse
- Current owner/module/interface:
- Direct callers/consumers inspected:
- Related replacement Issues/PRs, if any:
- Existing code/configuration/fixture/asset to reuse:
- Selected disposition: reuse | extend | local refactor | new owner | replacement request
- Why earlier rungs in the reuse ladder are insufficient:

#### Structural Budget
- Responsibilities/modules allowed to change:
- Interfaces/schemas/dependencies/processes/authority surfaces allowed to change:
- Expected paths (routing aid, not a file-count gate):
- Explicit non-goals:
- No-change guarantees:

#### Consequences
- Data and migration:
- Authority / privacy / egress / credential / Effect:
- Windows/macOS native variation:
- Applicable E2E journey or bug regression plus Gate projection disposition (`exact reuse — checked unchanged` or the named synchronized surfaces); documentation/design-only work uses `N/A — no automated proof`:
- Cleanup, cutover, rollback, and obsolete-path removal:

#### Stop Conditions
- Stop when:
- Decision owner if triggered:

#### Documentation Lifecycle
- Archive-triggering node, if this work completes one:
- Working documents to keep, archive, or delete:
```

“No current implementation” is valid only for an authorized first-owner bootstrap. It is not permission to create speculative layers.

## Task dispatch extraction

The Issue body is the extraction. The Commander's first `create_thread` prompt sends only:

- Issue URL and preallocated `dispatch_id`;
- expected Brief revision and exact body hash;
- role, task class, requested model/effort, and attempt;
- named branch, exact base and intended target, plus the immutable completed `reviewed_head` for a Reviewer; and
- a no-write bootstrap-preflight instruction that reports the generated actual cwd/worktree and branch-or-detached state.

The first prompt cannot name an app-managed worktree path or Task/client ID that does not exist yet. A Worker starts at the exact integration base; a Reviewer starts at the immutable completed authoring commit recorded as `reviewed_head` while retaining the Issue's exact base/target context. After the first turn stops and the Task Session ID exists, the Commander verifies the generated clean checkout at that role-specific start, attaches only a detached Worker checkout to the pre-created Issue branch when needed, posts the finalized Launch Receipt, and sends only its permalink. A Reviewer stays detached and read-only at `reviewed_head`. The Worker or Reviewer fetches and verifies the Issue plus receipt before controlled-file work. Do not send full transcripts, archive trees, unrelated design packages, the entire repository history, or a duplicated Change Brief. Follow the two-stage launch and attempt-identity rules in the dispatch owner.

Candidate journey IDs and candidate design packages retain their status. They may not be promoted merely to fill a Change Brief field.

## Pull-request closure

The PR body links the Issue and adds only:

```md
### Change closure

- Planned vs actual delta:
- Existing structure reused:
- New owner/dependency introduced and why:
- Journey/bug outcome and Gate projection disposition; documentation/design-only work uses `N/A — no implementation behavior change`:
- Migration/cleanup completed:
- Unresolved matters and safe next action:
- Archive sweep result, if triggered:
```

If actual work exceeds the Structural Budget, it is not ready for integration until the Issue is re-scoped by the applicable authority.
