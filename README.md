# AI7 Harness

AI7 is a Chinese-first desktop editorial workbench for professional literary publishing on Windows and macOS. It imports and edits very long manuscripts locally, keeps every consequential change inspectable through exact records, and runs model-assisted manuscript analysis and review through the DeepSeek Harness inside an AI7-owned boundary. What is implemented today is recorded in [`PROGRESS.md`](PROGRESS.md); what each end-to-end Journey proves is recorded in [`docs/development/e2e-journeys.md`](docs/development/e2e-journeys.md); the delivery order is [`docs/development/development-plan.md`](docs/development/development-plan.md). Agents start at [`AGENTS.md`](AGENTS.md).

## Supported development hosts

| Host | CPU | Required runtime | Native archive tool |
| --- | --- | --- | --- |
| Windows 11 24H2 or later | x64 | Node 24.18.1, pnpm 11.24.0 | canonical `%SystemRoot%\\System32\\tar.exe` |
| macOS 15 or later | arm64 | Node 24.18.1, pnpm 11.24.0 | canonical `/usr/bin/ditto` |

The exact Node distributions and SHA-256 values are declared in [`config/dependency-artifacts.json`](config/dependency-artifacts.json). Windows Server 2025 x64 is used only as the truthfully labelled Windows CI carrier. Git and Corepack are required. Python, Microsoft Office, a provider credential, another checkout, and a prefilled dependency store are not required or consulted.

## Quick start

Enable Corepack, let the checked-in `packageManager` field select the exact pnpm release, then run from the repository root:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run check
pnpm test
pnpm run test:service
pnpm run build
pnpm run start-built -- --data-root <absolute-path-outside-this-checkout>
```

`doctor` rejects unsupported hosts and build-affecting ambient overrides. `bootstrap` reconstructs the exact frozen npm closure, verifies the host Electron zip, and materializes the generated runtime. `check`, `test`, and `test:service` are the type-check, unit, and service-integration layers of the Local Verification Ladder. `build` produces the main, sandboxed preload, renderer, service, and shared modules plus notices under ignored `dist/`. `start-built` creates the selected Agent Data Root, prints only `AI7_READY` once the database, dormant Harness composition, renderer, and first paint are ready, and stays attached until AI7 exits. The data root must be absolute and outside the checkout.

## Verification

```text
pnpm run e2e -- --journey <J-01|J-02|J-08|J-12|J-15|J-03|J-04>
pnpm run e2e:all
pnpm --silent run e2e:diagnose -- --journey <id>
pnpm run e2e:debug -- --journey <id>
pnpm run e2e:repeat -- --journey <id> --times <n>
```

`e2e:all` runs every admitted Journey from one build in J-01 → J-02 → J-08 → J-12 → J-15 → J-03 → J-04 order and stops at the first failure. `e2e:debug` and `e2e:repeat` write full-fidelity errors, product output, and failure screenshots only under ignored `test-results/` and refuse to run under CI. Local diagnostic, Local completion, and the paired Windows/macOS Hosted Gate are distinct states; no local result becomes Gate evidence. The rules live in [CI and test boundaries](docs/agents/ci-test-boundaries.md) and [ADR 0062](docs/adr/0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md).

## Test inputs and protected material

Under [ADR 0043](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md), only exact-root `SampleBooks/` material explicitly designated by the Owner may be tracked and used as provider-free test input; exact [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx), 29,550 bytes with SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`, is the standing compatibility baseline under [ADR 0044](docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md). Every other Journey input is generated public synthetic material inside a disposable external root and deleted at cleanup. Model-dependent tests replay hand-written synthetic fixtures under `tests/fixtures/model/` through the in-process deterministic route; CI and the Gate never make a model call. The human-attended `developer-live` scope of [ADR 0065](docs/adr/0065-admit-a-developer-live-provider-processing-scope.md) is the only live route and exists on developer hosts only. Do not place any other manuscript, derivative, private sample Book, credential, raw recording, screenshot, trace, video, product database, or manuscript payload in the repository, logs, artifacts, or a distribution.

The selected macOS V1 profile ([ADR 0052](docs/adr/0052-select-the-macos-v1-distribution-and-data-location-profile.md)) is macOS 15+ on Apple Silicon arm64 with bundle identifier `io.github.zhouy1017.ai7`, a direct-download signed and notarized DMG, manual application replacement, and a per-user Application Support data root. Source-checkout build and E2E do not package, sign, notarize, or claim release readiness.

See [`docs/development/source-checkout.md`](docs/development/source-checkout.md) for lifecycle and environment details and [`docs/development/dependency-provenance.md`](docs/development/dependency-provenance.md) for the exact acquisition, integrity, and license ledger.
