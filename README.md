# AI7 Harness

This checkout carries the provider-free AI7 new-Book tracer, the complete J-02 long-manuscript editing module, and the cohesive J-08 interrupted-manuscript recovery module. A local DOCX is reviewed before the initial Book graph is created atomically; the resulting Manuscript can then be edited through bounded windows, outline and whole-manuscript navigation, CJK search, frozen atomic replacement, Milestone Versions, durable undo/redo, persisted restart/reopen, and recovery-first comparison/restoration after an interrupted lifetime with acknowledged journal-only work. It is intentionally not full J-01 or the broader Book Workspace.

## Supported development hosts

| Host | CPU | Required runtime | Native archive tool |
| --- | --- | --- | --- |
| Windows 11 24H2 or later | x64 | Node 24.18.1, pnpm 11.24.0 | canonical `%SystemRoot%\\System32\\tar.exe` |
| macOS 15 or later | arm64 | Node 24.18.1, pnpm 11.24.0 | canonical `/usr/bin/ditto` |

The exact Node distributions and SHA-256 values are declared in [`config/dependency-artifacts.json`](config/dependency-artifacts.json). Windows Server 2025 x64 is used only as the truthfully labelled Windows CI carrier; it is not presented as Windows 11.

Git and Corepack are required. Python, Microsoft Office, a provider credential, another checkout, and a prefilled dependency store are not required or consulted.

## Quick start

Enable Corepack, let the checked-in `packageManager` field select the exact pnpm release, then run these commands from the repository root:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run build
pnpm run start-built -- --data-root <absolute-path-outside-this-checkout>
```

`doctor` rejects unsupported hosts and recognized build-affecting ambient overrides. `bootstrap` reconstructs the exact frozen npm closure, verifies the host Electron zip, and materializes the generated runtime without an Electron npm package or native npm extractor. `build` produces the main, sandboxed preload, renderer, service, shared data-root/network boundary modules, and notices under ignored `dist/`.

`start-built` creates and canonicalizes the selected Agent Data Root and its `shell` directory before Electron starts, passes that exact shell through Chromium's standard user-data switch, preserves it if present, prints only `AI7_READY` after the database, dormant six-service Harness composition, renderer load, and first paint are ready, and remains attached until AI7 exits. The data root must be absolute and must not contain or be contained by the checkout.

Run any admitted journey through the one logical provider-free E2E surface with:

```text
pnpm run e2e -- --journey J-01
pnpm run e2e -- --journey J-02
pnpm run e2e -- --journey J-08
```

The current J-01 scenario uses exact [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx), 29,550 bytes with SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`, as its provider-free public input under [ADR 0044](docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md). It verifies the server-derived eight-category fidelity review, all three import-identity finding classes and their initially-unselected target consequences, exact review-v4 rebinding, source-path loss/change recovery, prepared-attempt reconciliation, completion paint and acknowledgement, inconclusive-outcome containment, durable abandonment cleanup, the linked degradation decision/import record, a bounded 32-of-97 manuscript window, and durable journal acknowledgement. The controller never reads the product database or retains, uploads, or logs manuscript payloads or derivatives; runtime state remains inside the disposable external test data root and is deleted after the journey.

J-02 generates its deterministic clean 10,000,000-character, 50,000-block Chinese DOCX only under the disposable external E2E root. It drives that file through the same native picker and production-shaped product, verifies every renderer window remains at most 32 blocks, exercises navigation/search/replacement while journal editing remains available, persists a Milestone Version and restart-safe history, and includes the applicable keyboard, real composition-event, visible-focus, 200% reflow, and forced-colors behavior. The generated DOCX and all runtime state are deleted during cleanup and never become tracked fixtures or uploaded evidence.

J-08 generates small clearly public synthetic DOCX inputs only under the disposable external E2E root. It is designed to prove a clean shutdown/reopen does not create Recovery Attention; an interruption after an acknowledged journal edit opens the exact affected Book recovery-first ahead of a pending import; journal reconstruction, checkpoint, and any verified applicable snapshot remain unselected until the user chooses; `仅查看` stays bounded and permanently readonly; and deferral carries an explicit return route through the lower-priority import target, review, commit, completion, and unrelated editor while the affected branch remains service-readonly. It also proves that a corrupt or missing newest applicable snapshot falls back to an older verified one, that no verified snapshot produces exactly two eligible choices plus a separate disclosure, and that mismatch, missing-object, partial, orphan, and structurally incomplete snapshot behavior fails closed. Restoration creates one new descendant without replaying pre-restoration history, and `当前为恢复的工作状态` survives clean restart until a later explicit Milestone clears it. The journey includes exact candidate identities and consequence disclosure, recovery-screen keyboard choice, visible focus, 200% reflow, forced colors, and CDP-confirmed Chromium `net::ERR_BLOCKED_BY_CLIENT` denial. Synthetic inputs, recovery objects, SQLite state, and all other runtime evidence are deleted during cleanup and are never logged or uploaded.

Under [ADR 0043](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md), only exact-root `SampleBooks/` material explicitly designated by the Owner through an authorized Issue and pull request may be tracked and used as provider-free local/hosted-CI test input. Directory placement alone grants no admission. ADR 0044 also establishes a future separately authorized local manual recording path for exact `sample1`, but no call, credential setup, fixture or live-provider CI path exists now. Do not place any other manuscript or derivative, private sample Book, credential, raw recording, screenshot, trace, video, product database, or manuscript payload in logs, uploaded artifacts, or a distribution.

See [`docs/development/source-checkout.md`](docs/development/source-checkout.md) for lifecycle and environment details and [`docs/development/dependency-provenance.md`](docs/development/dependency-provenance.md) for the exact acquisition, integrity, and license ledger.
