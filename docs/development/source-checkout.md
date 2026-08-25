# J-01 source-checkout build and launch

This is the operational routing document for Issue #24's first provider-free vertical tracer. The governing contract remains [`docs/agents/source-checkout-buildability.md`](../agents/source-checkout-buildability.md); this file records its concrete implementation.

## Declared host matrix

| Host identity | Architecture | Exact toolchain | Host-native prerequisite and detection |
| --- | --- | --- | --- |
| Windows 11 24H2+, NT build 26100+ | x64 | Node 24.18.1; pnpm 11.24.0; Electron 43.4.1; TypeScript 6.0.3 | `%SystemRoot%\\System32\\tar.exe`; `doctor` requires that exact canonical path |
| macOS 15+, Darwin 24+ | arm64 | Node 24.18.1; pnpm 11.24.0; Electron 43.4.1; TypeScript 6.0.3 | `/usr/bin/ditto`; `doctor` requires that exact canonical path |
| GitHub Actions `windows-2025` | x64 | same pins | truthfully labelled Windows Server 2025 CI exception, enabled only by the workflow marker |

The archive adapters are OS tools only. Their bytes are neither copied into `dist/` nor loaded by AI7. Windows extraction uses fixed `tar.exe -xf <verified-zip> -C <canonical-staging-root>` arguments; macOS uses fixed `ditto -x -k <verified-zip> <canonical-staging-root>` arguments. No shell, PATH search, variable flags, or arbitrary archive is involved.

## Exact command surface

```text
pnpm run doctor
pnpm run bootstrap
pnpm run build
pnpm run start-built -- --data-root <absolute-path>
pnpm run e2e -- --journey J-01
```

The pnpm SRI-bearing `packageManager` declaration is the pnpm selection authority. `doctor` reports the OS/CPU, exact runtime pins, canonical native adapter, official npm registry, host Node distribution identity/URL/SHA-256, lock/config hashes, and host Electron artifact identity/URL/SHA-256. The Node runtime executing the command must itself be exactly 24.18.1; CI selects it with the full-SHA-pinned `actions/setup-node` action and the repository records the official distribution digest.

`bootstrap` performs the host check before changing generated state. It then proves generated dependency, store, cache, and runtime roots are exact canonical children of this checkout; rejects redirected junctions or symlinks; removes only the exact checkout-local `node_modules`; and runs a frozen pnpm install. The child has a closed PATH and fresh task-local pnpm/npm user, global, structured, and auth config files. The official unauthenticated npm registry is fixed. Recognized identity/path/output and preload overrides fail in `doctor`; Node's environment-proxy, extra-CA, disabled-TLS-verification, and SSL certificate selectors also fail before parent-process Electron acquisition. Other ambient proxy variables are not enabled for Node fetch and are not forwarded to acquisition children.

The hosted runner explicitly supplies `NPM_CONFIG_PREFIX` as an empty string for every exact root command, neutralizing the runner image's otherwise ambient npm prefix before pnpm starts. `doctor` treats only that exact empty value as non-influential and rejects every nonempty value; bootstrap children never inherit the selector.

The Electron runtime is not an npm dependency. Bootstrap downloads or reuses only the host artifact declared in [`config/dependency-artifacts.json`](../../config/dependency-artifacts.json), verifies its SHA-256, extracts to a new checkout-local staging directory with the fixed OS adapter, and proves Electron 43.4.1, embedded Node 24.18.1, ABI 148, `node:sqlite`, FTS5, and the archive-root `LICENSE` and `LICENSES.chromium.html` carriers. Only then does it rename the staged carrier into the generated `.runtime/` owner. A prior runtime never satisfies the command without fresh verified extraction.

`build` rejects ambient acquisition selectors before dynamically importing esbuild, type-checks the one root package, validates any existing `dist/` is the exact canonical generated target, and writes the production-shaped carrier without source maps. No signing, installer, updater, provider, or release mechanics are involved.

`start-built` accepts exactly one data-root option after at most one pnpm literal separator. Before Electron exists, it loads the built shared data-root owner, creates and canonicalizes the external root plus its exact `shell` child, and places `--user-data-dir=<canonical-shell>` before the built main entry. Main independently requires Chromium's early switch and Electron's `userData` path to resolve to that same canonical directory before setting the path or opening authority. The launcher binds the main process to its exact parent PID and remains attached. The fixed payload-free `AI7_READY` line is forwarded only after canonical Agent Data Root setup, the single-instance lock, SQLite authority, awaited dormant six-service Cordis composition, renderer load, and first paint. Pre-readiness failure tears down owned processes and exits nonzero. Parent loss terminates main and service leases. A clean existing data root is preserved; pre-existing linked or redirected shell/store/object paths fail closed.

`e2e` accepts only journey `J-01`, generates a 51-block public-synthetic DOCX outside the checkout, installs the built Node egress guard before third-party controller imports, preflights its disposable Agent Data Root and shell with the same built owner, and launches the same exact Electron carrier directly with that shell selected before the main entry. Playwright control travels only over inherited Chromium `--remote-debugging-pipe` file descriptors: no debug port, inspector, WebSocket endpoint, TCP listener, or dev server exists. The main-owned picker hook supplies one selected result but cannot expose a path to the renderer or skip parse, review, domain commit, projection, editor, or journal flow.

## Closed product interval

After bootstrap, the E2E controller, Electron main, isolated renderer, and service deny outbound HTTP(S), WebSocket, DNS, and socket primitives appropriate to their process. The product receives no repository token, registry credential, provider credential, debug selector, or ambient payload path. Renderer checks return booleans only; the scenario emits a fixed failure location and creates no screenshot, trace, video, artifact, log payload, database assertion, or tracked DOCX.

Generated `node_modules/`, `.pnpm-store/`, `.cache/`, `.runtime/`, `dist/`, E2E temp roots, and Agent Data Roots are reconstructable or disposable outputs. None is a source input. The workflow uses a fresh checkout and no dependency cache action, so an empty job-local state remains the normal path.
