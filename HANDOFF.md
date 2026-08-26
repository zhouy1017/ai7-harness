# Issue #73 sample1 compatibility and recording-baseline handoff

Start with root [`AGENTS.md`](AGENTS.md), verify the current exact `dev` target and [`PROGRESS.md`](PROGRESS.md), then use the authority owners below. This is a cold-start router for an Owner-accepted design/policy baseline intended for `dev`; it is not authority to call a Provider, generate a fixture, implement product behavior, push, merge, release or touch `main`.

## Exact baseline

- Issue branch/base: `docs/73-sample1-recording-baseline` from exact `dev@4c50f0a39a81a6945cbcc87d17531f122354f6d2`, targeting `dev` only.
- Exact compatibility input: [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx), 29,550 bytes, SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- New decision owner: [ADR 0044](docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), partially superseding ADR 0043 only for this exact file's standing compatibility and separately governed local manual recording / reviewed-fixture exception.
- Current policy selection only after qualifying `dev` integration: [`active-policy-set.v2.json`](docs/policies/active-policy-set.v2.json) selects Provider Processing v2 SHA-256 `d0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc` and unchanged External Export v1 SHA-256 `b66fa0f2ad7d721f879c91e3cbb8e84f6a7bb08b107424d87871ab07937242de`.
- Worker binding: requested `claude-opus-5@high`; actual `gpt-5.6-sol@xhigh`; T3; fallback because the Owner explicitly reported local Claude disabled.

## Current decision

- `sample1` is the cross-Issue compatibility invariant for manuscript-dependent supported journeys. Truthfully representable fidelity signals resolve through preserve or an explicit initially-unselected degradation decision; discovery is not another Owner-admission trigger and cannot silently reject or replace the exact file.
- Current implementation still uses a runtime-generated synthetic DOCX. This baseline is the accepted next target, not a claim that Issue #36, full J-01 or every manuscript-dependent outcome is implemented.
- Provider Processing v2 remains default-deny and contains exactly one eligible-only rule, `sample1-manual-model-fixture-recording`. It creates no implementation, credential or current call.
- Any future recording is local-only, human-attended, manually started, `maxCalls: 1`, non-`unset`-budget, exact-binding and no-fallback through the actual AI7 product / Primary Agent Harness / Provider adapter / final Payload-Egress path. Ordinary Windows/macOS CI remains provider-free and network-disabled.
- Raw request/response bytes stay in protected local staging outside repositories and are deleted after admission or abandonment. Only a separately authorized normalized, sanitized, rights-reviewed and human-reviewed fixture may enter through another Issue/pull request. It never ships, enters learning/export/publication, proves Provider conformance/current quality, or becomes an Effect Receipt.

## Deferred recording-time human inputs

Immediately before any future transmission, the Commander must request human intervention to freeze the exact Provider, model, endpoint, adapter/config revision, Task, Model Role, public instruction/prompt contract, explicit monetary/token ceiling, Credential Reference enrollment and then-current Provider retention/test-reuse/redistribution terms. The recording remains deferred until the model-dependent product path exists.

## Safe next action

After this baseline is integrated, revise Issue #36 against the then-current exact `dev` so its bounded provider-free J-01 path consumes exact `sample1` and truthfully handles its fidelity signals. Re-dispatch only after that revised Issue/Change Brief is authorized. Do not start real recording from Issue #36 or this handoff.

Archive sweep: none. No lifecycle trigger completed in this task, historical `kick-in/26` remains historical, and no history was rewritten.
