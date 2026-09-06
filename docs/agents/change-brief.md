# Change Brief

The GitHub Issue body is the Change Brief. It is one page. It links to the plan slice, ADRs, contexts, and predecessor Issues instead of restating them, and it never carries a target-commit-qualified authority list; the read-by-task table in [`README.md`](./README.md) owns that. Template narrative and filler are prohibited.

## Header

Every work-ready Issue body begins with:

```md
Brief revision: <n>
Class: T1 | T2 | T3
Binding (codex): `<model> @ <effort>` · Binding (claude-code): `<model> @ <effort>`
Base: `dev@<sha>` · Branch: `<type>/<issue>-<slug>` · Target: `dev`
Plan slice: <Sxx> · Journey: <J-xx | N/A>
```

The bindings are the fixed class bindings in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md). The Commander selects the attempt's harness and launch mode at launch; the body does not.

## Body

```md
## Outcome
One paragraph: the user-visible result or exact non-product outcome, and the current behavior it replaces.

## Acceptance criteria
- [ ] Each criterion observable in the product, at a test layer, or in the Journey.

## Allowed to change
Owners, modules, schemas, runners, and documents this slice may touch, including every hidden cross-Journey pin named as a synchronized delta. Everything else is a non-goal.

## Non-goals and no-change guarantees

## Journey and Gate disposition
`exact reuse — checked unchanged` | `synchronized delta: <runner and stages>` | `N/A — documentation only`

## Stop when
Conditions that end the attempt with `needs-commander`, and the decision owner.

## Authority
Links only: plan slice, ADRs and context sections the slice depends on, predecessor Issues and pull requests.
```

## Revision and hash

A T3 body is hashed: SHA-256 over the exact UTF-8 bytes of the GitHub API `body` string, without a CLI-added newline. T1 and T2 bodies record only the Brief revision. A material change to outcome, class, binding, base, allowed change, non-goals, Journey disposition, or stop conditions increments the revision; after a Launch Receipt a material change requires a new attempt. A base-only drift after integration does not: the same Task Session continues after one Commander message naming the new base.

## First prompt to a Task Session

Send only: the Issue URL, the preallocated `dispatch_id`, the Brief revision (and hash for T3), Commander harness, attempt harness, launch mode, role, class, binding, branch, the exact base for a Worker or `reviewed_head` for a Reviewer, and the no-write preflight instruction (report actual cwd, worktree, and branch or detached state; in the `subagent` mode leave the retention marker). Never send transcripts, archives, or a duplicated brief.

## Pull-request closure

```md
### Change closure
- Outcome delivered; Journey and Gate disposition
- Planned vs actual change: owners touched, new owner and why, synchronized deltas
- Local Verification Ladder: exact head, host, outcome per available layer (product work); `N/A` for documentation only
- Migration and cleanup; unresolved matters; safe next action
- `PROGRESS.md` updated in this pull request: yes | no
```

Work that exceeds the allowed change is not ready for integration until the Issue is re-scoped.
