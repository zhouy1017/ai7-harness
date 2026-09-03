# Current handoff

Begin by querying the [Dispatch Register](docs/agents/dispatch-register.md): read the current Issue bodies and Launch/Return Receipts, then correlate them with built-in Codex Task state. Do not infer completion from `idle` or copy transient Task status into this router.

The next production dispatch is a fresh Issue #209 T2 Worker attempt at `gpt-5.6-terra @ high`, bound to the then-current exact `dev`. Integrate it through its authorized route. Only afterward, revise Issue #198 for the resulting exact base/target and launch a fresh T2 Worker attempt; preserve #201's renderer navigation repair and three consumer waits with #198's payload-safe diagnostic delta.

Product integration remains serial. Under ADR 0058, repository development does not query, estimate, report, or consider Actions usage. Provider calls, credentials, `sample1` recording, fixture admission, product Effect, export, publication, release, distribution, and `main` remain outside this route.

## Safe Resume Prompt

```text
Commander: query the Dispatch Register and current Issue receipts first. Launch a fresh Issue #209 T2 Worker Task at gpt-5.6-terra @ high from exact current dev and integrate it through its authorized route. Then revise Issue #198 for the resulting exact base/target and launch a fresh T2 attempt, preserving #201's renderer repair and three waits plus #198's payload-safe diagnostics. Keep product integration serial; under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
