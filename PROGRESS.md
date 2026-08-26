# Progress

## What's done

- Completed Issue #73's documentation/policy outcome from exact clean `dev@4c50f0a39a81a6945cbcc87d17531f122354f6d2` on `docs/73-sample1-recording-baseline`, targeting `dev` only.
- Added [ADR 0044](docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), exact Provider Processing v2 JSON/self-contained Draft 7 schema/own human projection, active-policy-set v2 JSON/schema, and the [manual model-fixture recording runbook](docs/development/manual-model-fixture-recording.md).
- Reconciled only the authorized current routers/owners: `AGENTS.md`, `CONTEXT-MAP.md`, Execution policy routes, policy README, project constraints, CI boundary, Git protected-material rule, SampleBooks README, V2 migration direction, root README, ADR 0043's partial-supersession status/link, and root progress/handoff. Existing product-domain definitions are unchanged.
- Kept current implementation truthfully synthetic until a separately revised Issue #36 lands. Exact [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx) is the accepted next standing compatibility baseline at 29,550 bytes and SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- Validated all new and retained JSON/schema pairs with `Test-Json`; both active sets' exact pins; 121 local links across the final 16 changed Markdown files; the exact 20-path allowlist; self-contained v2 schemas; `CLAUDE.md` wrapper integrity; and `git diff --check`.
- Verified all protected v1 SHA-256 values remain identical before/after: Provider Processing JSON `d9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a`, schema `ddc034f759a286885a415b1f1b20387e4285a52801b1a19cee149a2a037cf50f`, projection `c482d2cc0a7e29810f49d07422c19561c34450741aa19c3e12a6ccee3acbb2c7`; active-set JSON `13821bdd8f137ce85fb5c384ef2d34caebd9274142df553c06b7251168840371`, schema `ca610917036dd991c80bd1eb9c7045f86db99dea9eb3047f3a78d6c7aed50c73`; External Export JSON `b66fa0f2ad7d721f879c91e3cbb8e84f6a7bb08b107424d87871ab07937242de`, schema `3cfcdba47ace9a8d199ae264e769e7b85b8fc4e14bc7bcff7390de8ed15775ad`, projection `43c8a61f33c264181f47e74dd1e3ed7a236e9c780f8275e5d0f6adf35b85bddd`.
- Active-set v2 pins exact Provider Processing v2 SHA-256 `d0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc` and unchanged External Export v1 SHA-256 `b66fa0f2ad7d721f879c91e3cbb8e84f6a7bb08b107424d87871ab07937242de`.
- No Provider call, credential setup, fixture generation, product code, dependency, CI workflow, standing gate, export, learning, publication, release, push, merge, or `main` action occurred. Archive sweep: none; no lifecycle trigger completed and historical `kick-in/26` remains historical.

## What's next

- After integration, revise Issue #36 against the then-current exact `dev` so the bounded provider-free J-01 path consumes exact `sample1` and truthfully handles all discovered fidelity signals.
- Keep real recording deferred until a model-dependent product path exists and the Commander requests immediate human intervention before any binding or transmission is frozen.

## Key decisions made

- `Sample1 Compatibility Baseline / sample1 兼容性基线` and `Recorded Deterministic Model Fixture / 录制型确定性模型夹具` are repository-development vocabulary only; no product-domain term was added.
- Provider Processing v2 is default-deny with exactly one eligible-only rule, `sample1-manual-model-fixture-recording`. It requires exact imported lineage plus a public instruction, local/human-attended/manual execution, one call, a non-`unset` budget, exact Task and Provider Binding, an opaque Credential Reference, no fallback, and the actual Harness/provider/final Payload-Egress path.
- ADR 0044 partially supersedes ADR 0043 only for exact `sample1` standing compatibility and the separately governed manual-recording/reviewed-fixture exception. ADR 0043 continues to govern the other Public SampleBooks; all immutable v1 policy records remain predecessor history.
- Ordinary Windows/macOS CI remains provider-free and network-disabled. Deterministic replay exists only inside a complete journey and creates no new gate, Provider proof, current quality proof or Effect Receipt.

## Unresolved matters or blockers

- Deliberately deferred recording-time human inputs: exact Provider, model, endpoint, adapter/config revision, Task, Model Role, public instruction/prompt contract, explicit monetary/token ceiling, Credential Reference enrollment, and then-current Provider retention/test-reuse/redistribution terms.
- No blocker remains for this documentation/policy Issue. Product implementation and real recording each require later separate authority.

## Resume Prompt

As Commander, integrate Issue #73 only into the then-current `dev`, then revise Issue #36 against that exact target so its bounded provider-free J-01 path uses exact `sample1`; keep real recording deferred until the model-dependent product path exists and request immediate human intervention before freezing any recording binding or transmission.
