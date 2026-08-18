# Git conventions

Binding for every agent and every human working in this repository. These rules exist so that dispatched work is uniform regardless of which agent or provider produced it.

## Branches

`main` is the only long-lived branch. **Nothing is pushed to `main` directly**, including by the Commander — every change arrives through a pull request, so the `pr` gate always runs.

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
- The `pr` gate must be green. A red gate is never merged around.
- An independent Reviewer report is attached before merge, at a task class at least equal to the work reviewed. Where cross-provider review was impossible, the report says `same-provider review — independence reduced`.
- **Only the Commander merges.** Workers and Reviewers never do.

**Squash merge.** Each merge to `main` is one complete task, so history reads as a sequence of finished outcomes rather than agent scratch work. The pull-request body becomes the squashed commit body.

## Tags and releases

`vX.Y.Z` for releases, `vX.Y.Z-rc.N` for candidates. These match the `v*` trigger on the `release` workflow.

Tags are created only by the Commander, only on `main`, and only on a commit whose `pr` gate is green for that exact SHA.

## What never enters the repository

Manuscripts and their derivatives in any form, including retrieval indexes and embeddings. Credentials and secret values. Private sample Books. The `.gitignore` excludes document formats by pattern rather than by path, because a manuscript dropped anywhere in the tree must still be caught.
