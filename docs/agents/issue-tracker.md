# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub Issues. Use authenticated GitHub tooling and resolve the target from the configured repository remote once it exists. Before a remote exists, do not publish planning work elsewhere implicitly.

## Conventions

- Create, read, list, comment on, label, and close work through GitHub Issues.
- Use `--body-file` for multiline issue bodies so commands remain shell-safe.
- Fetch labels and comments when a skill needs the full ticket state.
- A request to “publish to the issue tracker” means create a GitHub issue.
- A request to “fetch the relevant ticket” means read the GitHub issue and its comments and labels.
- Every work-ready Issue contains the applicable [Change Brief](change-brief.md). Keep it in the Issue rather than creating a duplicate planning file.
- `ready-for-agent` means the outcome, exact target-qualified authority/base, existing implementation or authorized first owner, structural budget, non-goals, consequences, applicable implementation journey/bug or explicit non-behavior `N/A`, and stop conditions are complete enough for a cold Worker.
- Use `needs-info` when factual inputs are missing and `ready-for-human` when product scope, domain meaning, authority, privacy/egress, foundation replacement, or another owner decision is required. Do not dispatch T0 ambiguity.
- When an Issue is merged, closed, or abandoned, its owner runs the scoped [documentation archive sweep](document-lifecycle.md) and leaves one current safe next action.

## Pull requests as a triage surface

PRs as a request surface: **no**.

There are no external contributors at this stage. Pull requests represent implementation and review, not incoming feature requests. GitHub shares numbering between issues and pull requests, so resolve an ambiguous `#N` before acting.
