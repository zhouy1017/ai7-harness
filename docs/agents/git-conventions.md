# Git conventions

Binding for every agent and every human working in this repository. These rules exist so that dispatched work is uniform regardless of which agent or provider produced it.

## Branches

`main` is the only canonical long-lived branch. **Nothing is pushed to `main` directly**, including by the Commander — every change arrives through a pull request and only the applicable functional gate below is required.

The owner-requested `design-doc` aggregate is a documented branch-policy exception, not a second canonical line. Candidate work targeting it still follows one issue, one branch, one writable Worker, and Commander-only integration.

Branch names are `<type>/<issue>-<slug>`:

```
feat/42-manuscript-block-store
fix/108-stale-retrieval-hit
docs/17-glossary-collision-guard
```

- `<type>` is one of the commit types below.
- `<issue>` is the GitHub issue number. GitHub Issues is the canonical tracker, so work without an issue is work nobody can find later.
- `<slug>` is two to five lowercase words, hyphen-separated, describing the outcome rather than the method.

One issue, one branch, one pull request. One writable worker per branch, per the Repository Development Dispatch rules.

## Commits

Conventional Commits: `type(scope): subject`.

| Type | Use for |
| --- | --- |
| `feat` | New user-visible capability |
| `fix` | Corrected behavior |
| `docs` | Documentation and design records |
| `refactor` | Behavior-preserving change |
| `test` | Tests only |
| `build` | Packaging, dependencies, pins |
| `ci` | Workflow changes |
| `chore` | Everything else |

Subject in the imperative, lowercase, no trailing period, under 72 characters. The body explains **why**, not what — the diff already shows what. State rejected alternatives when a choice was contested, and name any accepted decision the change implements or revises.

Agent-authored commits carry the co-authorship trailer for the model that wrote them.

## Pull requests

- Title matches the primary commit subject.
- Body links the issue and states the user-visible outcome.
- For an implementation change affecting a supported journey or observed-bug outcome, the one logical E2E Functional Gate must pass the same applicable journey IDs on Windows and macOS. A failure on either platform is not merged around.
- Documentation-only and design-only changes do not create automated proof work. Lint, type-check, format, build, package, signing, release, same-SHA, or formal-review checks are not additional required pull-request gates.
- Independent review is optional and advisory. When the Commander or owner requests it, use a read-only non-author Reviewer at least equal to the work's task class and disclose `same-provider review — independence reduced` when cross-provider review was unavailable.
- **Only the Commander merges.** Workers and Reviewers never do.

The E2E scenario admission, data, subject, and platform rules live in [`ci-test-boundaries.md`](ci-test-boundaries.md).

**Squash merge.** Each merge to `main` is one complete task, so history reads as a sequence of finished outcomes rather than agent scratch work. The pull-request body becomes the squashed commit body.

## Tags and releases

`vX.Y.Z` for releases, `vX.Y.Z-rc.N` for candidates. These match the `v*` trigger on the `release` workflow.

Tags are created only by the Commander and only on `main` after normal pull-request integration. Tagging or release automation creates no separate release, receipt, packaging, signing, reproducibility, provenance, or same-SHA proof gate.

## What never enters the repository

Manuscripts and their derivatives in any form, including retrieval indexes and embeddings. Credentials and secret values. Private sample Books. The `.gitignore` excludes document formats by pattern rather than by path, because a manuscript dropped anywhere in the tree must still be caught.
