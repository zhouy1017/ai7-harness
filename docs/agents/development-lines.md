# Development Lines

Status: **Owner-authorized repository-development governance**

## Scope

These lines govern repository development only. They are not AI7 product-domain vocabulary, product workflow state, or shipped runtime behavior. The Git rules in [Git conventions](./git-conventions.md) and the role rules in [Repository development dispatch](../../kick-in/27-repository-development-dispatch.md) apply to them.

## Authorized lines

| Line | Role | Rule |
| --- | --- | --- |
| `dev` | Long-lived development integration line | Start task branches from current `dev`; target their pull requests to `dev`. It is the GitHub default branch for development work. |
| `main` | Protected stable and release-promotion line | No task branch or pull request targets `main` without a separate, exact Owner authorization for that promotion. |
| `design-doc@6895f02d2983865516d267809d8cdda77026f62c` | Frozen allowlist source | It is evidence for the allowlist only, never a mechanically mergeable development line. |

## Current repository facts

- `origin/dev` was created at `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`.
- GitHub's default branch is `dev`.
- Both `main` and `dev` are PR-only protected lines: administrator enforcement is on, mandatory approvals are zero, linear history is required, and force pushes and deletion are disabled.

These facts record the Owner-authorized state as performed by the Commander. They do not authorize a Worker to change repository settings, create pull requests, merge, push, or take other external actions.

## Promotion boundary

Ordinary task integration ends at `dev`. A future `dev` to `main` promotion is a separate Owner decision with its own exact authorization; it is not implied by task completion, a green gate, review, or a release intention.
