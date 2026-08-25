# Change Brief

The Change Brief is not a separate paperwork system. Put the applicable form directly in the GitHub Issue and copy only the bounded Worker instructions into the dispatch brief.

Link to an accepted definition, ADR, Issue section, or existing code location instead of restating it. Write one grouped `N/A — <short reason>` for an inapplicable subsection or consecutive dimensions; do not repeat `N/A` field by field. Template-shaped narrative, duplicated context, and boilerplate inserted only to fill every heading are prohibited.

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
- Applicable E2E journey or bug regression; otherwise `N/A — no automated proof`:
- Cleanup, cutover, rollback, and obsolete-path removal:

#### Stop Conditions
- Stop when:
- Decision owner if triggered:

#### Documentation Lifecycle
- Archive-triggering node, if this work completes one:
- Working documents to keep, archive, or delete:
```

“No current implementation” is valid only for an authorized first-owner bootstrap. It is not permission to create speculative layers.

## Worker dispatch extraction

The Commander sends only:

- exact base, branch/worktree, role and task class;
- exact outcome and accepted basis;
- current owner/reuse anchor;
- structural budget and non-goals;
- stop conditions;
- applicable E2E journey/bug, or non-behavior `N/A`; and
- reporting/external-action boundary.

Do not send full transcripts, archive trees, unrelated design packages, or the entire repository history.

Candidate journey IDs and candidate design packages retain their status. They may not be promoted merely to fill a Change Brief field.

## Pull-request closure

The PR body links the Issue and adds only:

```md
### Change closure

- Planned vs actual delta:
- Existing structure reused:
- New owner/dependency introduced and why:
- Journey/bug outcome, or `N/A — no implementation behavior change`:
- Migration/cleanup completed:
- Unresolved matters and safe next action:
- Archive sweep result, if triggered:
```

If actual work exceeds the Structural Budget, it is not ready for integration until the Issue is re-scoped by the applicable authority.
