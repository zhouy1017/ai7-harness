# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub Issues. Use authenticated GitHub tooling and resolve the target from the configured repository remote once it exists. Before a remote exists, do not publish planning work elsewhere implicitly.

## Conventions

- Create, read, list, comment on, label, and close work through GitHub Issues.
- Use `--body-file` for multiline issue bodies so commands remain shell-safe.
- Fetch labels and comments when a skill needs the full ticket state.
- A request to “publish to the issue tracker” means create a GitHub issue.
- A request to “fetch the relevant ticket” means read the GitHub issue and its comments and labels.
- Every work-ready Issue contains the applicable [Change Brief](change-brief.md). Keep it in the Issue rather than creating a duplicate planning file.
- Every work-ready body states `Brief revision`, main Worker role/class, and exact requested model/reasoning effort. Before launch, material contract changes increment the revision; an editorial-only change may keep it but requires a recomputed SHA-256 over the exact UTF-8 bytes of the GitHub API body string without a CLI-added newline.
- `ready-for-agent` means the outcome, exact target-qualified authority/base, fixed class binding, existing implementation or authorized first owner, structural budget, non-goals, consequences, applicable implementation journey/bug or explicit non-behavior `N/A`, stop conditions, validation, and external-action boundary are complete enough for a cold Worker.
- Use `needs-info` when factual inputs are missing and `ready-for-human` when product scope, domain meaning, authority, privacy/egress, foundation replacement, or another owner decision is required. Do not dispatch T0 ambiguity.
- One repository-development attempt is `Issue + role + attempt`. The Commander posts exactly one standardized Launch Receipt and, after accepting the report, one Return Receipt per attempt as Issue comments. Receipt comments record attempt evidence but never amend the body contract; once posted they are never edited or deleted. An erroneous receipt closes or supersedes the attempt and requires a new attempt.
- The `create_thread` request freezes the expected Issue revision/hash and role-specific start commit: exact base for a Worker or immutable `reviewed_head` for a Reviewer. Any later Issue-body byte change prevents or invalidates that attempt; after a Launch Receipt it requires an incremented revision and fresh Task Session even when editorial-only. Comments, labels, and assignments outside the body do not restart an attempt. Role/binding/base/target or `reviewed_head` change, runtime reroute/mismatch, cancellation, or supersession also requires a new attempt.
- When an Issue is merged, closed, or abandoned, its owner runs the scoped [documentation archive sweep](document-lifecycle.md) and leaves one current safe next action.

Use [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) for receipt schemas and two-stage launch, and the [Dispatch Register](dispatch-register.md) for the query-only project view. Workers and Reviewers never post receipts or otherwise mutate Issue state.

## Pull requests as a triage surface

PRs as a request surface: **no**.

There are no external contributors at this stage. Pull requests represent implementation and review, not incoming feature requests. GitHub shares numbering between issues and pull requests, so resolve an ambiguous `#N` before acting.
