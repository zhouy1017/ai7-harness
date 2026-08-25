# AI7 Harness

This checkout carries the first provider-free AI7 vertical tracer: select a local DOCX, review a new-Book import before creating records, commit the exact initial Book graph atomically, edit one bounded manuscript window, and explicitly save to the durable Edit Journal. It is intentionally not full J-01.

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

Run the one admitted provider-free journey with:

```text
pnpm run e2e -- --journey J-01
```

The scenario generates its public-synthetic Chinese DOCX under an external disposable temp root at runtime. Do not place a manuscript, manuscript derivative, credential, screenshot, trace, video, or product database in this repository.

See [`docs/development/source-checkout.md`](docs/development/source-checkout.md) for lifecycle and environment details and [`docs/development/dependency-provenance.md`](docs/development/dependency-provenance.md) for the exact acquisition, integrity, and license ledger.
