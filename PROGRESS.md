# Current checkpoint

## What's done

- Repository-development dispatch now routes through ADR 0059, the Codex-only Issue-bound Task Session runbook, and the query-only Dispatch Register.
- ADR 0015 is preserved as explicitly superseded history; the active provider-neutral/Claude/Spark/fallback and unverifiable actual-model rules are removed without changing product-runtime provider semantics or CI evidence.
- Issue #210 / PR #211 remains the completed predecessor routing repair at the cutover base.

## What's next

- The Commander queries current Issue receipts and built-in Task state, then launches a fresh Issue #209 T2 Worker attempt at `gpt-5.6-terra @ high` from exact current `dev`.
- After Issue #209 integrates, the Commander revises Issue #198 for the resulting exact base/target and launches a fresh T2 Worker attempt before further controlled-file work.

## Key decisions

- T0 Issue shaping, dispatch, acceptance, integration, and external actions remain Commander-only; every T1–T3 Worker and every Reviewer receives a fresh top-level Codex Task Session with a verified Launch Receipt.
- Root `PROGRESS.md` and `HANDOFF.md` are Commander-owned integration-line routers. Per-attempt evidence lives in Issue receipts and Task state, with no central mutable Git ledger or transient-status projection here.
- Product Provider, Model Role, DSH, Provider Processing/fallback, credential, Effect, provider-free E2E, export, publication, distribution, release, and `main` authority are unchanged.

## Unresolved matters or blockers

- Issue #209 remains the next product integration; Issue #198 must wait for that integration and a new exact base/target binding.
- Required product validation and paired Hosted Gate evidence remain governed by each product Issue and the current CI boundary.

## Safe Resume Prompt

```text
Commander: query the Dispatch Register and current Issue receipts first. Launch a fresh Issue #209 T2 Worker Task at gpt-5.6-terra @ high from exact current dev and integrate it through its authorized route. Then revise Issue #198 for the resulting exact base/target and launch a fresh T2 attempt, preserving #201's renderer repair and three waits plus #198's payload-safe diagnostics. Keep product integration serial; under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
