# Progress

## What's done

- Issue #82 review repair removes the trigger-level Markdown filter and keeps the `dev` pull-request trigger unconditional. The new bounded `route` job checks the complete exact pull-request diff (`BASE_SHA...HEAD_SHA`) as NUL-delimited path names, ignores only lowercase `*.md`, and fails closed on Git or routing errors.
- Any non-Markdown added, deleted, or rename-side path sets `run_j01=true`; only an all-Markdown diff leaves it `false`. The existing Windows/macOS J-01 job receives only the route dependency and exact boolean condition; its matrix, platforms, environment, steps, pins, and commands remain unchanged.
- Disposable Git-repository checks passed for all-Markdown changes beyond 300 paths, more than 300 Markdown paths followed by a non-Markdown path, non-Markdown deletion, and both Markdown/non-Markdown rename directions. The checks executed the exact route shell block extracted from the workflow and removed their temporary state.
- `PROGRESS.md` and `HANDOFF.md` now route the current review-repair checkpoint. No product, scenario, dependency, permission, provider, export, recording, release, or `main` surface changed.

## What's next

- Commander may review and integrate the local follow-up repair into the then-current `dev`; do not infer any broader CI, branch-protection, product, or release authority.

## Key decisions made

- Reused the existing E2E workflow, exact checkout pin, and job matrix; complete-diff routing replaces `paths-ignore` because GitHub trigger filtering can inspect only a bounded changed-file set.
- The repository contains no branch-protection or required-status-check record contradicting the Change Brief.

## Unresolved matters or blockers

- No blocker within the authorized structural budget. This workflow change itself contains YAML, so its eventual pull request will route to the unchanged E2E gate; that automatic execution is not new proof work.

## Resume Prompt

As Commander, review the local Issue #82 complete-diff routing repair against the current `dev`, then perform only the authorized integration workflow; preserve the all-Markdown skip rule and all unchanged J-01 job semantics.
