# Current handoff

Begin by querying the [Dispatch Register](docs/agents/dispatch-register.md): read the current Issue bodies and Launch/Return Receipts, then correlate them with Claude desktop session state through `list_sessions` and `get_session`. Do not infer completion from `idle` or copy transient session status into this router.

Repository-development dispatch follows [ADR 0060](docs/adr/0060-dispatch-repository-work-through-issue-bound-claude-code-sessions.md) and [Repository Development Dispatch](kick-in/27-repository-development-dispatch.md): Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`; every Worker and Reviewer is a fresh top-level Claude Code Task Session in its own `.claude/worktrees/<name>` worktree with a verified schema-v2 Launch Receipt.

The next production step is Commander-only: revise each open Issue that still carries a Codex binding block or Codex trailer (#215, #198, #217, #227, #91) with an incremented Brief revision, its Claude Code class binding, and the then-current exact `dev` base; record `superseded` Return Receipts for their Codex-era attempts; then launch fresh Task Sessions, positioning the main checkout on the exact base before each session is created. Reshape #215 first, because its brief archives root routers that this cutover replaced. Keep product integration serial.

Provider calls, credentials, `sample1` recording, fixture admission, product Effect, export, publication, release, distribution, and `main` remain outside this route. Under ADR 0058, repository development does not query, estimate, report, or consider Actions usage.

## Safe Resume Prompt

```text
Commander: query the Dispatch Register and current Issue receipts first. Revise each open Issue that still names a Codex binding or trailer (#215, #198, #217, #227, #91) to its Claude Code class binding with an incremented Brief revision and the then-current exact dev base, record superseded Return Receipts for Codex-era attempts, and launch fresh Task Sessions through the two-stage receipt protocol. Keep product integration serial; under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
