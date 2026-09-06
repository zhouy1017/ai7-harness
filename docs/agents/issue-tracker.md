# Issue tracker: GitHub

Issues and the epic PRD pointer live as GitHub Issues; the PRD text lives at [`docs/prd/ai7-v2-prd.md`](../prd/ai7-v2-prd.md) and the delivery order at [`docs/development/development-plan.md`](../development/development-plan.md).

## Conventions

- Create, read, list, comment on, label, and close work through GitHub Issues with authenticated tooling. Use `--body-file` for multiline bodies.
- Every plan slice has one Issue titled `[Sxx] J-xx: <outcome>`. Its body carries a **Plan slot** block (phase, order, class, journey, dependencies, design links) and, once the slice is reached, the one-page [Change Brief](./change-brief.md) written on the then-current `dev` head. Earlier planning text stays below a `Historical planning input` heading and is not dispatchable.
- `ready-for-agent` means the one-page Brief is complete: outcome, acceptance criteria, allowed change, non-goals, Journey disposition, stop conditions, and links. `needs-info` means factual inputs are missing; `ready-for-human` means an Owner decision is required. T0 ambiguity is never dispatched.
- One attempt is `Issue + harness + role + attempt`. The Commander posts one schema-v5 Launch Receipt and one Return Receipt per attempt as Issue comments; receipts never amend the body, and once posted they are never edited or deleted. A wrong receipt is superseded by a Return Receipt and a new attempt.
- A T3 body is frozen by its SHA-256 over the exact UTF-8 bytes of the GitHub API `body` string; T1 and T2 bodies by Brief revision only. A material change after a Launch Receipt requires a new attempt; a base-only drift does not.
- Workers and Reviewers never post receipts or mutate Issue state.
- When an Issue is merged, closed, or abandoned, the Commander updates `PROGRESS.md` and runs the scoped [archive sweep](./document-lifecycle.md).

## Pull requests as a triage surface

Pull requests represent implementation, not incoming requests. GitHub shares numbering between Issues and pull requests, so resolve an ambiguous `#N` before acting.
