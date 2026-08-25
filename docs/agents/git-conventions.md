# Git conventions

Binding for every agent and every human working in this repository. These rules exist so that dispatched work is uniform regardless of which agent or provider produced it.

## Branches

See [Development lines](./development-lines.md) for the authorized line roles and current protection facts.

`dev` is the long-lived development integration line. Start every task branch from current `dev` and target its pull request to `dev`. **Nothing is pushed directly to `dev` or `main`**, including by the Commander; both protected lines receive changes through pull requests.

`main` is the protected stable and release-promotion line. No task branch or pull request targets it unless the Owner has separately authorized that exact promotion.

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
- Documentation-only changes require no automated proof. An implementation change proves its applicable one logical E2E journey gate; a red applicable gate is never merged around.
- Independent review is optional and advisory, never a formal merge gate. When used, its reviewer must not author the work and must meet or exceed its task class; where cross-provider review was impossible, the report says `same-provider review — independence reduced`.
- **Only the Commander merges.** Workers and Reviewers never do.

**Squash merge.** Each task merge to `dev` is one complete task, so history reads as a sequence of finished outcomes rather than agent scratch work. The pull-request body becomes the squashed commit body. A `dev` to `main` promotion remains subject to its separate Owner authorization.

## Tags and releases

`vX.Y.Z` for releases, `vX.Y.Z-rc.N` for candidates. These match the `v*` trigger on the `release` workflow.

Tags are created only by the Commander, only on `main`, and only on a commit whose `pr` gate is green for that exact SHA.

## What never enters the repository

Manuscripts and their derivatives in any form, including retrieval indexes and embeddings. Credentials and secret values. Private sample Books. The `.gitignore` excludes document formats by pattern rather than by path, because a manuscript dropped anywhere in the tree must still be caught.
