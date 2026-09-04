# Current handoff

Begin by identifying your harness, Codex or Claude Code, then query the [Dispatch Register](docs/agents/dispatch-register.md) with that harness's tools: read the current Issue bodies and Launch/Return Receipts, then correlate them with your harness's live session state. Do not infer completion from `idle` or copy transient session status into this router.

Repository-development dispatch follows [ADR 0061](docs/adr/0061-route-repository-dispatch-by-commander-harness.md) and [Repository Development Dispatch](kick-in/27-repository-development-dispatch.md): the Commander's harness selects the route, bindings are fixed per harness and class, every Worker and Reviewer is a fresh top-level Task Session on that harness in its own worktree, and each work-ready Issue body carries one requested binding per harness so either Commander can launch it without a body change.

The next production step is Commander-only: reshape Issue #215 first, because its brief archives pre-cutover root routers that have since been replaced. Then launch fresh attempts for the open Issues (#215, #198, #217, #227, #91) from the then-current exact `dev` base. Their bodies carry only a Codex binding line: a Codex Commander launches them unchanged; a Claude Code Commander first adds the `claude-code` line with an incremented Brief revision, and positions the main checkout on the exact base before creating each session. Keep product integration serial.

Provider calls, credentials, `sample1` recording, fixture admission, product Effect, export, publication, release, distribution, and `main` remain outside this route. Under ADR 0058, repository development does not query, estimate, report, or consider Actions usage.

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then query the Dispatch Register and current Issue receipts with that harness's tools. Reshape Issue #215 first. For each open Issue (#215, #198, #217, #227, #91) launch a fresh attempt from the then-current exact dev base through the two-stage receipt protocol on your harness; a Claude Code Commander first adds the claude-code binding line with an incremented Brief revision. Keep product integration serial; under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
