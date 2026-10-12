# Development lines

These lines govern repository development, not AI7 product workflow state. [Orca dispatch](orca-dispatch.md) owns wave/slice construction and role permissions; [Git conventions](git-conventions.md) owns Git formatting and release boundaries.

| Line | Role |
| --- | --- |
| `dev` | Canonical development integration line and GitHub default branch; changes enter through the final integration PR. |
| `codex/integration-<wave>` | Temporary cumulative integration branch defined by Orca dispatch; a wave is candidate work until it reaches dev. |
| `codex/<issue>-<slug>` | Issue-bound slice branch targeting its assigned wave. |
| `main` | Protected release-promotion line, reached only under separate exact Owner authorization. |
| `design-doc@6895f02d2983865516d267809d8cdda77026f62c` | Frozen allowlist provenance, never an integration target. |

## Repository protection

The recorded protection of `dev` and `main` is PR-only, administrator-enforced, linear-history required, with zero mandatory GitHub approvals and force pushes/deletion disabled. Verify actual settings when a task depends on them; recording these facts does not authorize changing repository settings. The project review requirement is owned by Orca dispatch independently of GitHub's approval count.

## Promotion boundary

Development integration ends at `dev`. A green check, completed wave, review or release intention does not authorize promotion to `main`, tagging, packaging or publication. Those actions need their own exact Owner scope.
