---
status: accepted
---

# Adopt a local verification ladder with CI as the delivery gate

On 2026-09-04 the Owner reviewed the development test process and found it inverted: the only automated surface was the fourteen-minute Hosted E2E Functional Gate, local runs discarded every error detail, and the Gate had become the debugger (43 of the last 100 runs failed, one branch ran it 22 times, and five consecutive Issues added diagnostic markers for one intermittent Windows-only J-02 failure without a root cause). This decision amends [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md)'s engineering-rigor trade-off for local development, amends [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md)'s local feedback loop and [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md)'s Local diagnostic clause, and leaves the Gate itself unchanged as the per-Ready-pull-request delivery gate.

## Decision

### Local Verification Ladder

Development runs a **Local Verification Ladder** on the actual supported development host. Its layers are required developer-run surfaces, maintained with the code, and never CI or merge gates:

| Layer | Command | Content |
| --- | --- | --- |
| L0 | `check` | Type check only (`tsc --noEmit`, including `tests/**`) |
| L1 | `test` | vitest unit tests over pure modules such as DOCX parsing, protocol validation, canonical data roots, network denial, launch policy, recovery objects, and Task authorization schema/trigger immutability on in-memory `node:sqlite` |
| L2 | `test:service` | vitest service-integration tests over the Editorial, bounded-manuscript, and Task authorization stores on a temporary data root and temporary SQLite database, without Electron |
| L3 | `build` | Unchanged |
| L4 | `e2e -- --journey <id>` / `e2e:all` | Unchanged admitted Journeys with CI-identical payload-safe output |
| Debug | `e2e:debug -- --journey <id>` | Full-fidelity local run: complete error and `cause` chain, stack, product stdout/stderr, failure screenshot, written only to ignored `test-results/` |
| Repeat | `e2e:repeat -- --journey <id> --times N` | Bounded repetition of one Journey that stops at the first failure and keeps that run's full-fidelity artifacts |

`build`, `e2e`, `e2e:all`, and `e2e:diagnose` exist today. `check`, `test`, `test:service`, `e2e:debug`, and `e2e:repeat` are staged and land only through their implementing Issues; no document may describe them as available before then.

ADR 0027's exclusion list continues to govern CI and merge evidence: no unit, integration, coverage, lint, type-check, or other standing gate is added to the hosted workflow. ADR 0027's statement that the Owner accepts lower engineering rigor no longer applies to local development. vitest is the accepted local test runner and is admitted through its own dependency Issue under the exact-pin and provenance rules.

### Local debug fidelity

On the developer host, `e2e:debug` and `e2e:repeat` may emit complete errors, stacks, product process output, and failure screenshots. Those artifacts exist only under `test-results/`, which is ignored, and never enter the repository, CI logs, or uploaded artifacts. The E2E inputs remain public synthetic material or admitted Public SampleBooks, so the boundary moves from "never emit" to "never commit or upload". The `e2e`, `e2e:all`, and `e2e:diagnose` commands and the hosted workflow keep their payload-safe output byte for byte. Any debug switch is a controller-only setting that never enters the product process environment.

### Ready precondition and red-Gate handling

A product pull request records `Local Verification Ladder` in its Change closure with the exact head, host, and the outcome of every existing layer before the Commander marks it Ready. A missing attestation blocks Ready.

A red Gate returns the pull request to Draft. The change is reproduced locally with `e2e:debug` and `e2e:repeat`. When a failure does not reproduce locally, the next step is reproduction in a CI-parity environment (a Windows Server 2025 virtual machine or sandbox, or a resource-constrained local run), not another diagnostic-marker Issue; marker-only changes are the last resort after that. Only a clearly external runner, network, or infrastructure transient may be rerun once without a code change, as before.

### Test maintenance

A new owner ships with its unit tests in the same Issue. An observed bug first receives the smallest regression at the nearest unit or service layer; an E2E variation is added only when the user-visible outcome requires it. Tests are removed only when the behavior they protect is explicitly changed.

### Model-dependent testing

Model-dependent paths use two fixture tiers. Synthetic deterministic fixtures, authored by hand and covering error, budget, account-limit, and interruption shapes, are the default for tests and for CI. The Recorded Deterministic Model Fixture under [ADR 0044](./0044-use-sample1-as-compatibility-and-recording-baseline.md) is a realism anchor replayed only in the journey it was recorded for; replay asserts the assembled request digest against the fixture's prompt-contract digest so drift is detected without transmission. Recording tooling is unit-tested with synthetic raw responses before the single authorized recording. ADR 0044, Provider Processing Policy v2, and the manual recording runbook remain the recording authority; this decision adds no call, credential, or provider path.

## Rejected alternatives and consequences

- **Keep the E2E-only surface and add more diagnostic markers.** Rejected: markers cannot replace a reproducible local loop, and the last five marker Issues did not find a cause.
- **Make unit or integration tests a hosted gate.** Rejected: the Owner wants CI as the delivery gate only; local surfaces are required but not merge evidence.
- **Run the Gate only before `dev` → `main` promotion, or only on macOS.** Rejected: macOS regressions would surface late, and the Windows Server runner is exactly where the intermittent failure appears.
- **Keep payload-safe-only output on the developer host.** Rejected: the redaction protects CI logs and artifacts, not the developer's own machine over public inputs.

ADR 0027's Gate identity, provider-free and network-denied interval, platform parity, failure semantics, and CI exclusion list are unchanged. ADR 0049's Draft-first, Ready-only, one-occurrence cadence and ADR 0053's three verification states remain; Local diagnostic now includes the full-fidelity local debug artifacts described above. Repository-development dispatch, receipts, and every product-runtime authority are unaffected. The detailed rules live in [`docs/agents/ci-test-boundaries.md`](../agents/ci-test-boundaries.md).
