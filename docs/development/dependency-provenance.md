# J-01 dependency and artifact provenance

This ledger is bounded to the Issue #24 tracer. Package identities and tarball integrity are owned by [`package.json`](../../package.json) and the frozen [`pnpm-lock.yaml`](../../pnpm-lock.yaml); non-registry carriers are owned by [`config/dependency-artifacts.json`](../../config/dependency-artifacts.json). [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) carries the license routing included in every build.

## Registry boundary and selected closure

All npm packages resolve from `https://registry.npmjs.org/` at exact versions and lockfile integrities. Strict peers, engines, store-content verification, frozen installs, exact overrides, and disabled automatic peer installation are enabled. The only build-script allowlist entry is `esbuild@0.28.2`; Electron has no npm package and no npm lifecycle script.

The package manager is exact `pnpm@11.24.0`, selected from the official npm carrier by the root `packageManager` declaration and its sha512 SRI. Its source identity is <https://github.com/pnpm/pnpm> and its license is MIT. Corepack is supplied by the declared Node carrier; it is not an ambient package-manager search path.

The admitted runtime owners are:

- DSH/Cordis: `@deepseek-ai/cordis@4.0.1`; `@deepseek-ai/cosmokit@1.8.2`; `@deepseek-ai/schemastery@3.18.1`; `@standard-schema/spec@1.1.0`; and the exact `@deepseek-ai/` scoped `0.1.0-rc.6` set `dsh-agent`, `dsh-agent-loop`, `dsh-attachment`, `dsh-brand`, `dsh-code-runtime`, `dsh-invariants`, `dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-session-persistence`, `dsh-settings`, `dsh-system-prompt`, `dsh-timeout`, `dsh-tools`, `dsh-typert-protocol`, and `dsh-user-approval`.
- DOCX parsing: `fflate@0.8.3`, `saxes@6.0.0`, and transitive `xmlchars@2.2.0`.
- Editor: `prosemirror-commands@1.7.2`, `prosemirror-history@1.5.0`, `prosemirror-keymap@1.2.3`, `prosemirror-model@1.25.11`, `prosemirror-state@1.4.4`, `prosemirror-transform@1.12.0`, `prosemirror-view@1.42.3`, with transitive `orderedmap@2.1.1`, `rope-sequence@1.3.4`, and `w3c-keyname@2.2.8`.

Development-only owners are `@types/node@24.13.3` with `undici-types@7.18.2`, `typescript@6.0.3`, `esbuild@0.28.2` plus all 26 exact optional `@esbuild/*@0.28.2` lock carriers (only the current host carrier is materialized), and `playwright-core@1.62.1`.

The aggregate `@deepseek-ai/dsh`, shell, web, filesystem, network, provider, schedule, jobs, workflow, replay, and testkit packages are absent. No native N-API/`.node` runtime dependency is installed. Some required DSH packages publish unused replay/fork, fixture, or Code Mode symbols; those bytes do not create a mounted service, tool, provider, renderer surface, or business authority.

## Harness lineage

The dated source audit in [`kick-in/01-source-provenance.md`](../../kick-in/01-source-provenance.md) examined `deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`, whose source manifests declared rc.5 even though rc.5 was never published. This tracer consumes the distinct exact npm rc.6 artifacts above under the pinning contract in [`kick-in/30-upstream-consumption-and-upgrade-contract.md`](../../kick-in/30-upstream-consumption-and-upgrade-contract.md); the two records must not be conflated. No upstream source was copied or vendored. The consumed package authority is the frozen lockfile's exact registry tarball identities and SRIs.

## Lifecycle and secondary acquisition

`esbuild@0.28.2` is the sole necessary postinstall allowlist entry. Ordinarily pnpm restores the exact optional host package from the lock. If that carrier is absent, esbuild's exact postinstall may invoke npm to acquire only `@esbuild/<platform>@0.28.2`; it inherits bootstrap's official-registry, empty task-local npm user/global/auth configuration and closed PATH. Esbuild then binds the executable bytes to its package-owned `esbuild.binaryHashes` SHA-256 before use:

| Supported host carrier | SHA-256 from `esbuild@0.28.2` `binaryHashes` |
| --- | --- |
| `@esbuild/win32-x64/esbuild.exe` | `c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef` |
| `@esbuild/darwin-arm64/bin/esbuild` | `10b6243df618d374bb2d5c9cfbe7052e1405f6aa4e53a6164f11a91b9f2e1384` |

This possible verified secondary fetch is why esbuild is not described as registry-only or lifecycle-free. `ESBUILD_BINARY_PATH` and npm/pnpm registry, config, store, cache, auth, and preload selectors fail closed before build or bootstrap can import or invoke it.

## Toolchain and non-registry carriers

| Identity | Host | Immutable source | SHA-256 | Use and verification |
| --- | --- | --- | --- | --- |
| `node-v24.18.1-win-x64.zip` | Windows x64 | `https://nodejs.org/dist/v24.18.1/node-v24.18.1-win-x64.zip` | `ec56b84a7551893ab2324ebdfdc4ab974a63b4781162600b68a1293cc3e53765` | declared developer/CI runtime; `doctor` reports the identity/digest and verifies the executing Node version; CI selects it through full-SHA-pinned setup-node |
| `node-v24.18.1-darwin-arm64.tar.gz` | macOS arm64 | `https://nodejs.org/dist/v24.18.1/node-v24.18.1-darwin-arm64.tar.gz` | `eb02f7fab96d3d67de40c5ec8566096fcb4c2026728787683ae5a97eb612b941` | same contract for the macOS matrix entry |
| `electron-v43.4.1-win32-x64.zip` | Windows x64 | `https://github.com/electron/electron/releases/download/v43.4.1/electron-v43.4.1-win32-x64.zip` | `c2ef9a5f65472c34d14bd3e67b7d14e66b0c01f124aba45263d6a4232160e13a` | bootstrap verifies the archive, fixed-OS extraction, license carriers, Electron/Node/ABI/SQLite/FTS5, then atomically activates it |
| `electron-v43.4.1-darwin-arm64.zip` | macOS arm64 | `https://github.com/electron/electron/releases/download/v43.4.1/electron-v43.4.1-darwin-arm64.zip` | `fe3cac8cbfd9ba1739fac6c69166cf30848741f93cbe251d800ae6ef7cebb64b` | same contract with `/usr/bin/ditto` preserving the app bundle |

Electron is a secondary runtime artifact, not an npm dependency. Both exact release zips retain their own `LICENSE` and `LICENSES.chromium.html` at archive root; those verified carriers are copied into every `dist/notices/` output alongside the tracked AI7 notices. Node's license source and Electron's license source are declared in the artifact manifest.

No mirror is admitted by this baseline: bootstrap hardcodes the official npm and Electron sources. Any future source-route change requires its own reviewed manifest and Change Brief while keeping identity and digest pinned. No private registry, personal auth file, global pnpm config, sibling checkout, predecessor tree, or prefilled runtime can supply a correctness input.

## License audit

The runtime npm closure is MIT except `saxes@6.0.0` (ISC); that npm tarball omits a license file, so its exact two applicable ISC blocks are reproduced from the authoritative [`v6.0.0` tag license](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE). Development tooling adds Apache-2.0 (`playwright-core@1.62.1` and `typescript@6.0.3`). Esbuild and its platform carriers are MIT. Electron brings its MIT license and its complete Chromium/third-party notice carrier. The package/version/copyright groups and license texts or carrier routes are maintained in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
