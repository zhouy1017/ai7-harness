# Current handoff

Begin by identifying your harness, Codex or Claude Code, then query the [Dispatch Register](docs/agents/dispatch-register.md) with that harness's tools: read the current Issue bodies and Launch/Return Receipts, then correlate them with your harness's live session state. Do not infer completion from `idle` or copy transient session status into this router.

Development verification follows [ADR 0062](docs/adr/0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md) and the [CI and test boundary](docs/agents/ci-test-boundaries.md): the developer-run Local Verification Ladder is required before Ready, the Hosted E2E Functional Gate stays the per-Ready-pull-request delivery gate, and a red Gate returns to Draft for local, then CI-parity, reproduction. Staged commands (`check`, `test`, `test:service`, `e2e:debug`, `e2e:repeat`) land only through their implementing Issues.

The next production step is Commander-only: shape and launch, in order, the vitest dependency Issue (exact pin, provenance ledger, notices, `check`/`test`, smoke tests), the e2e debug/repeat Issue, the pure-module unit-test batch, the service-integration batch, and the J-02 reproduction campaign. Dispatch follows [ADR 0061](docs/adr/0061-route-repository-dispatch-by-commander-harness.md): fresh Task Session on your harness, dual binding lines in every body, schema-v3 receipts. Open Issues #215, #198, #217, #227, and #91 are already in ADR 0061 form. Keep product integration serial.

Provider calls, credentials, `sample1` recording, fixture admission, product Effect, export, publication, release, distribution, and `main` remain outside this route. Under ADR 0058, repository development does not query, estimate, report, or consider Actions usage.

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then query the Dispatch Register and current Issue receipts with that harness's tools. Shape and launch the vitest dependency Issue first (exact pin, provenance ledger, notices, check/test commands, smoke tests), then the e2e debug/repeat Issue, then the unit and service test batches, then the J-02 reproduction campaign, each as a fresh Task Session on your harness with schema-v3 receipts. Keep product integration serial and require the Local Verification Ladder attestation before Ready. Under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
