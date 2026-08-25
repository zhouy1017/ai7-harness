# Progress

## What's done

- The 36-question architecture and migration design interview is complete. The Owner has authorized sequential exact `design-doc` allowlist normalization, policy baselines, implementation planning, and the bounded J-01 new-Book tracer.
- Owner-authorized development-line governance is now documented in `docs/agents/development-lines.md`, with aligned routes in `AGENTS.md`, `docs/agents/git-conventions.md`, `kick-in/27-repository-development-dispatch.md`, and `HANDOFF.md`.
- `dev` is the long-lived development integration/default task-branch/PR target; `main` is protected for stable/release promotion only; `design-doc@6895f02d2983865516d267809d8cdda77026f62c` remains a frozen allowlist source.
- Current Commander-performed repository facts: `origin/dev` starts at `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`; GitHub defaults to `dev`; `main` and `dev` are PR-only protected with administrator enforcement, zero mandatory approvals, linear history, and force-push/deletion disabled.
- Archive sweep: none. Git history is sufficient for superseded progress chronology.

## What's next

- Execute the authorized exact `design-doc` allowlist baseline normalization sequentially on `dev`, never `main`.
- Continue with the authorized policy baselines and implementation planning toward the bounded J-01 new-Book tracer, staying within their accepted scope.
- A `dev` to `main` promotion still requires its own separate exact Owner authorization.

## Key decisions made

- Repository branch strategy is development workflow only, never AI7 product-domain or runtime behavior.
- Task branches and ordinary PRs target `dev`; a green gate, review, or task completion does not authorize a promotion to `main`.
- `design-doc` is a frozen allowlist source, never a development branch to merge mechanically.
- The authorized next action is exact allowlist baseline normalization, followed by the sequentially scoped policy and implementation work.

## Resume Prompt

Resume on `dev` by executing the authorized exact `design-doc` allowlist baseline normalization, then proceed sequentially through policy baselines and implementation planning toward bounded J-01; never target `main` without separate exact Owner authorization.
