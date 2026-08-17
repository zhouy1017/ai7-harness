# Retained Original-AI7 Development Workflows

Status: **preservation direction accepted; Question 24 detail proposed; Question 25 remains open**

## Source and status vocabulary

This inventory refers to private AI7 Reborn at `dev@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`. Paths are evidence locators, not files authorized for copying.

- **Current** — wired into commands, workflows, or protected tests at the source pin.
- **Pilot** — implemented and deterministically tested, but not operationally accepted.
- **Historical** — useful design evidence that is no longer promotion authority.

## Tiered GitHub Actions verification

| Source evidence | Status | New-project treatment |
| --- | --- | --- |
| `.github/workflows/pr-gate.yml` | Current | Preserve a bounded, unconditional, provider-free PR tier; replace its name, commands, and platform assumptions. |
| `.github/workflows/nightly-full-test-gate.yml` | Current | Preserve broader fan-out, independent Windows proof, bounded timeouts, quarantine visibility, and same-SHA suppression; re-decide schedule and lanes. |
| `.github/workflows/release-candidate.yml` | Current | Preserve fail-closed exact-SHA admission from prior evidence and release-only checks; redesign packaging ownership. |
| `.github/workflows/final-release.yml` | Current adjacent release flow | Preserve trusted candidate-to-final promotion semantics only if the new release design retains this stage. |
| `docs/testing/test-catalog.json` and `scripts/test-catalog.mjs` | Current routing authority | Preserve a machine-owned test registry; regenerate every entry, module, and route for the new architecture. |
| `scripts/test-catalog/` | Current implementation | Preserve catalog, planning, quarantine, exact-SHA evidence, and admission contracts; reimplement through the simplest target-owned boundary. |
| `docs/testing/release-candidate-confidence.md` | Current specification | Use as the strongest three-tier design input. |
| `docs/adr/0101-full-hosted-verification-runs-nightly.md` through `0104-nightly-fans-out-and-release-reuses-exact-sha-evidence.md` | Current accepted source decisions | Treat as rationale; write replacement decisions for the new repository rather than importing their status. |
| `tests/static/ci-workflow-tiering.test.mjs` and related workflow/command contract tests | Current | Preserve the pattern that workflows and their command surface are tested as code. |

The source topology is evidence, not a fixed target:

```text
PR       provider-free bounded verification
Nightly  broad portable suite + independent Windows suites
RC       exact-SHA admission + catalog-selected release evidence
```

Accepted invariant: required tiers are provider-free and fail closed. Open design: tier names, triggers, schedules, platforms, commands, catalog schema, quarantine rules, and which tier proves packaged Windows behavior.

## Generated mock-LLM-provider evidence

Original AI7 contains two complementary systems; the new project should not collapse them into one low-fidelity mock.

### Scenario corpus and exact-match cassette replay

| Source evidence | Status | New-project treatment |
| --- | --- | --- |
| `tests/fixtures/model-generation/public-synthetic-corpus-v1.json` | Current | Preserve a versioned public-synthetic scenario corpus; revise its task mix after product stories are accepted. |
| `tests/fixtures/model-generation/public-synthetic-deepseek-v4-pro-v2.json` | Current accepted promotion input | Preserve sanitized exact-request cassette semantics; replace fixed provider/model identity with Harness-resolved identity. |
| `tests/fixtures/model-generation/public-synthetic-bootstrap-v2.json` | Historical bootstrap | Keep only as interface/provenance history; never accept it as release evidence. |
| `scripts/prepare-model-generation-corpora.mjs` | Current generator | Preserve public synthetic generation, byte-shape privacy checks, and path/report redaction; rewrite its schema and scenarios. |
| `scripts/model-generation-recorder.mjs` | Current opt-in recorder | Preserve reviewed preflight digest, explicit live-call opt-in, normalization, atomic publication, and prohibition in CI. |
| `scripts/model-generation-corpus.mjs` | Current validator | Preserve strict versioned validation using a new Harness-facing scenario schema. |
| `runtime/model_generation.py` (`CassettePlaybackAdapter`) | Current playback boundary | Preserve exact safe-request matching and fail-closed drift behavior; do not inherit the Python class boundary automatically. |
| `scripts/model-generation-provider-free-suite.mjs` | Current ten-call E2E runner | Preserve end-to-end replay plus durable-result assertions; revise task scenarios and record mapping. |
| `scripts/check-model-generation-recording.mjs` | Current promotion guard | Preserve provenance and sanitization checks; generalize provider/model policy. |
| `tests/helpers/fake-model-generation-provider.mjs` | Current deterministic helper | Preserve the fake-provider seam against the selected Harness provider protocol. |
| `docs/testing/model-generation-cassettes.md` | Current specification | Use as the main source reference for generate, record, sanitize, validate, and replay behavior. |

### Small sanitized provider responses

| Source evidence | Status | New-project treatment |
| --- | --- | --- |
| `tests/fixtures/provider-responses/*.json` | Current | Preserve small unit/contract fixtures for Q&A, summary, review, writing, and annotation; never treat them as the sole assembled-agent proof. |
| `scripts/provider-rehearsal.mjs` | Current local-only generator | Preserve explicit opt-in and public/synthetic input restrictions. |
| `scripts/check-provider-fixtures.mjs` | Current guard | Preserve rejection of secrets, raw logs, and private text. |
| `tests/backend-contract/provider-fixture-contract.test.mjs` | Current | Preserve provider-boundary and sanitization contracts. |

Accepted invariant: generated cases and cassette playback provide deterministic provider-free CI. Live-provider rehearsal is separate, opt-in, and never required for an ordinary gate. Whether any fixture ships with the desktop application remains open.

Migration correction: do not byte-copy `public-synthetic-corpus-v1.json`. Although its text is synthetic, `scripts/prepare-model-generation-corpora.mjs` generated it to match a private `sample1.docx` byte length, leaking that source-size fingerprint through its metadata. Regenerate a new public corpus at an independently chosen fixed public size and ID, then refresh derived cassette fingerprints. Raw/private live recordings remain excluded; only reviewed, normalized, public-synthetic, sanitized replay cassettes qualify as mock-provider evidence under [the accepted legacy-data boundary](./24-legacy-data-migration-boundary.md).

## Local multi-agent repository dispatch

This is **Repository Development Dispatch**, not an AI7 end-user workflow and not a second production agent runtime.

| Source evidence | Status | New-project treatment |
| --- | --- | --- |
| `scripts/agent-orchestration.mjs` | Current deterministic/recording CLI | Preserve as test/reference evidence; its recording workers do not prove real agents. |
| `scripts/agent-orchestration-host.mjs` | Pilot composition root | Preserve fail-closed host loading and no fake fallback; do not promote its implementation. |
| `scripts/agent-orchestration/lifecycle.mjs` | Current repository-specific core | Preserve durable lifecycle, typed requests, exact revisions, replay, review, and recovery semantics; map them to the selected development harness. |
| `scripts/agent-orchestration/{repository,record-store,coordination,handoffs,review-handoffs,safe-content,routing}.mjs` | Current tooling | Preserve isolated exact-base worktrees, one writer, structured briefs/reports, scoped authority, content exclusion, and fail-closed evidence. |
| `scripts/agent-orchestration/recording-worker.mjs` | Current test adapter | Retain deterministic fakes for tests only; never represent their receipts as real execution. |
| `scripts/agent-orchestration/pilot.mjs` | Pilot | Use as evaluation history only. |
| `scripts/agent-orchestration/host/` | Pilot bridge | Preserve idempotent effect/receipt lessons while reconciling them with the chosen development harness. |
| `agent-host-connector/` | Pilot, not operationally accepted | Reference Windows authority/enrollment experiments only; do not make DPAPI, Windows Hello, or provider-specific process launch a baseline. |
| `docs/agents/agent-orchestration-runbook.md` | Current operator specification for the pilot | Rewrite the authority and lifecycle contract around the new repository and actual tools. |
| `docs/agents/multi-agent-orchestration-pilot-prd.md` | Pilot | Preserve the “prove through real observations before extraction” lesson. |
| `docs/adr/0109-one-dispatched-task-per-commander-owned-worktree.md`, `0110-dispatches-use-structured-bidirectional-handoffs.md`, and `0115-one-task-lifecycle-interface-owns-agent-orchestration.md` | Current accepted source design | Strong rationale inputs for replacement development-workflow decisions. |
| `tests/tooling/agent-orchestration-*.test.mjs` and `tests/tooling/agent-host-connector.test.mjs` | Current deterministic contracts | Selectively preserve adversarial scenarios; they validate interfaces/fakes, not real provider execution or human authorization. |

The source had not completed its required real Host observations at the pin. Therefore:

- Keep exact-base isolated worktrees, one writable worker, structured bidirectional handoffs, typed authority requests, Commander-only integration/external actions, replay-safe receipts, and secret/manuscript exclusion.
- Adapt those guarantees using the selected development harness instead of copying the large repository-specific state machine.
- Keep recording adapters test-only.
- Treat Windows Host enrollment, provider/model routing, old schema compatibility, and the three-role pilot evaluator as reference material rather than requirements.

## Next decisions

- Question 24's detailed proposal is in [Tiered Verification and Mock-provider Evidence](./26-tiered-verification-and-mock-provider-evidence.md).
- Question 25 will define Repository Development Dispatch roles, authority ceilings, worktree ownership, handoffs, receipts, and the relationship to available development-agent tooling.
