# Source-checkout dependency and artifact provenance

This ledger covers the currently admitted source-checkout journeys. Package identities and tarball integrity are owned by [`package.json`](../../package.json) and the frozen [`pnpm-lock.yaml`](../../pnpm-lock.yaml); non-registry carriers are owned by [`config/dependency-artifacts.json`](../../config/dependency-artifacts.json). [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) carries the license routing included in every build.

## Registry boundary and selected closure

All npm packages resolve from `https://registry.npmjs.org/` at exact versions and lockfile integrities. Strict peers, engines, store-content verification, frozen installs, exact overrides, and disabled automatic peer installation are enabled. The only build-script allowlist entry is `esbuild@0.28.2`; Electron has no npm package and no npm lifecycle script.

The package manager is exact `pnpm@11.24.0`, selected from the official npm carrier by the root `packageManager` declaration and its sha512 SRI. Its source identity is <https://github.com/pnpm/pnpm> and its license is MIT. Corepack is supplied by the declared Node carrier; it is not an ambient package-manager search path.

The admitted runtime owners are:

- DSH/Cordis: `@deepseek-ai/cordis@4.0.1`; `@deepseek-ai/cosmokit@1.8.2`; `@deepseek-ai/schemastery@3.18.1`; `@standard-schema/spec@1.1.0`; and the exact `@deepseek-ai/` scoped `0.1.0-rc.6` set `dsh-agent`, `dsh-agent-loop`, `dsh-attachment`, `dsh-brand`, `dsh-code-runtime`, `dsh-invariants`, `dsh-llm`, `dsh-scope`, `dsh-session`, `dsh-session-persistence`, `dsh-settings`, `dsh-system-prompt`, `dsh-timeout`, `dsh-tools`, `dsh-typert-protocol`, and `dsh-user-approval`.
- DOCX parsing: `fflate@0.8.3`, `saxes@6.0.0`, and transitive `xmlchars@2.2.0`.
- Editor: `prosemirror-commands@1.7.2`, `prosemirror-history@1.5.0`, `prosemirror-keymap@1.2.3`, `prosemirror-model@1.25.11`, `prosemirror-state@1.4.4`, `prosemirror-transform@1.12.0`, `prosemirror-view@1.42.3`, with transitive `orderedmap@2.1.1`, `rope-sequence@1.3.4`, and `w3c-keyname@2.2.8`.
- Protected Secret Store: `@napi-rs/keyring@1.3.0` plus the publisher-declared exact optional native-carrier set. Product support selects only `@napi-rs/keyring-win32-x64-msvc@1.3.0` on Windows x64 or `@napi-rs/keyring-darwin-arm64@1.3.0` on macOS arm64; no other carrier becomes a supported product route.
- Sub-agent seam, installed for dependency validation only: `@deepseek-ai/dsh-subagent`, `@deepseek-ai/dsh-subagent-in-process-driver` and `@deepseek-ai/dsh-subagent-spawn-in-process` at `0.1.0-rc.6`, plus `zod@4.4.3`, the seam's one new runtime dependency. No production composition mounts them; see [Sub-agent seam carriers](#sub-agent-seam-carriers).

Development-only owners are `@types/node@24.13.3` with `undici-types@7.18.2`, `typescript@6.0.3`, `esbuild@0.28.2` plus all 26 exact optional `@esbuild/*@0.28.2` lock carriers (only the current host carrier is materialized), and `playwright-core@1.62.1`. Local testing under ADR 0062 adds `vitest@4.1.11` with its exact 69-package closure: `vite@8.2.2`, `rolldown@1.2.7` with all exact optional `@rolldown/binding-*` carriers, `lightningcss@1.33.0` with its exact optional `lightningcss-*` carriers, `postcss@8.5.26`, `chai@6.2.2`, the `@vitest/*@4.1.11` packages, and small utilities; only the current host carriers are materialized, no package in that closure declares a build script, and `esbuild@0.28.2` remains the sole allowlist entry.

The aggregate `@deepseek-ai/dsh`, shell, web, filesystem, network, provider, schedule, jobs, workflow, replay, and testkit packages are absent, as are `dsh-tool-subagent`, the fork and ACP sub-agent providers, and the seam's optional `dsh-agent-presets`, `dsh-sandbox`, `dsh-sandbox-policy`, `dsh-session-projection` and `dsh-session-projection-cache` peers. The keyring carrier is the sole native N-API/`.node` product dependency; it is main-private and exposes no Provider adapter, secret enumeration, service-protocol value, renderer value, shell command, file fallback, or business authority. Some required DSH packages publish unused replay/fork, fixture, or Code Mode symbols, and the sub-agent seam publishes continuable-child, fork-seed, structured-output and per-request route, persona and tool-filter options; those bytes do not create a mounted service, tool, provider, renderer surface, or business authority.

## Harness lineage

The dated source audit in [`kick-in/01-source-provenance.md`](../../kick-in/01-source-provenance.md) examined `deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`, whose source manifests declared rc.5 even though rc.5 was never published. This tracer consumes the distinct exact npm rc.6 artifacts above under the pinning contract in [`kick-in/30-upstream-consumption-and-upgrade-contract.md`](../../kick-in/30-upstream-consumption-and-upgrade-contract.md); the two records must not be conflated. No upstream source was copied or vendored. The consumed package authority is the frozen lockfile's exact registry tarball identities and SRIs.

## Lifecycle and secondary acquisition

`esbuild@0.28.2` is the sole necessary postinstall allowlist entry. Ordinarily pnpm restores the exact optional host package from the lock. If that carrier is absent, esbuild's exact postinstall may invoke npm to acquire only `@esbuild/<platform>@0.28.2`; it inherits bootstrap's official-registry, empty task-local npm user/global/auth configuration and closed PATH. Esbuild then binds the executable bytes to its package-owned `esbuild.binaryHashes` SHA-256 before use:

| Supported host carrier | SHA-256 from `esbuild@0.28.2` `binaryHashes` |
| --- | --- |
| `@esbuild/win32-x64/esbuild.exe` | `c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef` |
| `@esbuild/darwin-arm64/bin/esbuild` | `10b6243df618d374bb2d5c9cfbe7052e1405f6aa4e53a6164f11a91b9f2e1384` |

This possible verified secondary fetch is why esbuild is not described as registry-only or lifecycle-free. `ESBUILD_BINARY_PATH` and npm/pnpm registry, config, store, cache, auth, and preload selectors fail closed before build or bootstrap can import or invoke it.

`@napi-rs/keyring@1.3.0` has no install lifecycle or runtime JavaScript dependency. Its parent tarball SRI is `sha512-WrOw/bcXm0f9qHkumlT1QlArXSTWqaY9sunsDpOk+yCCorCKMxvWT/a3xko4EYHVdeZoh00yI2TydXn6eyICDA==`; the supported Windows x64 carrier SRI is `sha512-4DnCWXwDc0HRKwyRlG5y0VhKZW2tNRQfKKfyj6IX/KWfDNyq9hn4n+GL1auyDcOO/v8PwnhmYo2+rOOqCkvvOg==`, and the supported macOS arm64 carrier SRI is `sha512-pl76hJvdYUBn6I24bXiOBMA9nbDapo3I5B+f3OorjDU4dUMSypXeKbOVehJe8fhgTiH24flMyTS3aAIy43xegQ==`. Build verifies the exact current-host parent package, carrier package, version, and native binary under checkout `node_modules`; Node resolution from `dist/main/index.cjs` reaches that same checkout closure. Because the publisher loader recognizes `NAPI_RS_NATIVE_LIBRARY_PATH` and `NAPI_RS_FORCE_WASI`, the main-private owner rejects either variable before importing the package. No ambient native path, WASI module, alternate OS store, CLI, shell, `safeStorage`, or file carrier is accepted.

## Sub-agent seam carriers

[Issue #1158](https://github.com/zhouy1017/ai7-harness/issues/1158) admits these four registry carriers under the Owner-approved packet recorded in [#1068](https://github.com/zhouy1017/ai7-harness/issues/1068#issuecomment-6393162139). Each archive was acquired from its exact `https://registry.npmjs.org/` tarball URL and matched its full SRI before extraction; every extracted entry is a regular file under `package/`, with no executable bit, native module, or `.gyp` file.

| Package | Archive bytes | SHA-512 SRI | `LICENSE` SHA-256 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-subagent@0.1.0-rc.6` | 124409 | `sha512-vROmBDAlaFAzzSlTBOlvg/7fO55zxhUztnLtB3lKmN5RevrNQBjTsbeIMDQ8ow5ZplxEOnLU+sikFoA5JaoH8A==` | `ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be` |
| `@deepseek-ai/dsh-subagent-in-process-driver@0.1.0-rc.6` | 14387 | `sha512-KK8Ep4PeSyrM3YQdcZhetXsiBd+bliKu6NWWKyTh60LobKtVNREfPBlqRfzc0mU0ZIKD4VEC7RfuJaqvz4UlPw==` | `ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be` |
| `@deepseek-ai/dsh-subagent-spawn-in-process@0.1.0-rc.6` | 6048 | `sha512-62mtUEr5megxVy6CwQCdZVq5MCSt+kMw74ns5m7PK0PlZTWcxQVBQHNdfkE9sX4Cageu7YTvciUJuH8amm6bsQ==` | `ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be` |
| `zod@4.4.3` | 759588 | `sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==` | `3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8` |

The seam's one ordinary dependency is `zod` (`^4.4.3`, pinned to exact `4.4.3`); the spawn provider's is the existing `@deepseek-ai/schemastery@3.18.1`; the driver and Zod declare none. Required peers resolve to the existing Cordis and DSH `0.1.0-rc.6` pins and to each other. Of the seam's optional peers only the already installed `dsh-session-persistence` and `dsh-user-approval` resolve, and neither gains a mount; the others stay absent. Zod neither replaces schemastery nor upgrades any package. The three DSH manifests declare no scripts; Zod declares `clean`, `build`, `postbuild`, `test:watch`, `test` and `prepublishOnly`. None of the four declares a `preinstall`, `install`, `postinstall` or `prepare` hook, a binary, or a bundled or optional dependency, so `esbuild@0.28.2` stays the only build-script allowlist entry. Zod's build, test and publication scripts are not executed by this validation.

All four declare and carry MIT: the three DSH archives carry one identical `LICENSE` with Copyright (c) 2026 DeepSeek, and Zod's carries Copyright (c) 2025 Colin McDonnell. No archive carries a `NOTICE` or another license carrier. The DSH manifests name `deepseek-ai/deepseek-harness` but record no `gitHead`, and their registry metadata has no provenance attestation, so no source-to-tarball chain, upstream tag or signed source is asserted; Zod's metadata attestation link was observed, not cryptographically verified. The established facts are the registry SRIs, the acquired manifests and the carrier texts.

These packages are installed and type-checked, and only `tests/unit/dsh-subagent-dependencies.test.ts` composes them: the native seam, driver and spawn provider behind network denial with one synthetic in-memory adapter, as a provider-free compatibility witness. Production is unchanged — the dormant six-service mount, `HARNESS_PACKAGE_PINS`, every composition descriptor and `subagents: false` stay as they were, and no policy, fixture or Plan grants a sub-agent. A production consumer (the restricted one-shot facade on the accepted per-unit governor and fences, with the parent attempt's scope, binding, policy, ceiling and counters, and a selected fixture) remains a separate assigned outcome of [#1068](https://github.com/zhouy1017/ai7-harness/issues/1068).

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

The runtime npm closure is MIT except `saxes@6.0.0` (ISC); `@napi-rs/keyring` and its native carriers use the MIT license with Copyright (c) 2020 N-API for Rust. The saxes npm tarball omits a license file, so its exact two applicable ISC blocks are reproduced from the authoritative [`v6.0.0` tag license](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE). Development tooling adds Apache-2.0 (`playwright-core@1.62.1` and `typescript@6.0.3`). Esbuild and its platform carriers are MIT. The vitest closure is MIT except Apache-2.0 (`detect-libc@2.1.2`, `expect-type@1.4.0`), MPL-2.0 (`lightningcss@1.33.0` and its `lightningcss-*` carriers, redistributed unmodified), ISC (`picocolors@1.1.1`, `siginfo@2.0.0`), and BSD-3-Clause (`source-map-js@1.2.1`); `stackback@0.0.2` declares MIT in its manifest without a license file. Electron brings its MIT license and its complete Chromium/third-party notice carrier. The package/version/copyright groups and license texts or carrier routes are maintained in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).


## F08 external validation candidate — Phase 1 checkpoint

Status: **acquired and inventoried; candidate execution held; not admitted or shipped.** This subsection reports [Issue #1147 revision 1](https://github.com/zhouy1017/ai7-harness/issues/1147), the [exact packet](https://github.com/zhouy1017/ai7-harness/issues/1027#issuecomment-6386081328), the [Owner decision](https://github.com/zhouy1017/ai7-harness/issues/1027#issuecomment-6393161886) and [actual Phase 1 assignment](https://github.com/zhouy1017/ai7-harness/issues/1147#issuecomment-6393418002). Approval authorized this experiment; it supplied no successful result, product adapter, production activation or redistribution permission. The admitted closure above is unchanged. Product F08 remains unimplemented.

### Assignment and boundaries

Entry and source base: `d1c31c40428057bdc5a637f55fd8d63dd496d5ec`, initially clean at Orca-generated `zhouy1017/codex-1147-embedding-validation`; that branch was preserved and assigned `codex/1147-embedding-validation` created from the same commit. Target: `codex/integration-21`. The official brief body was read in full, 31,836 UTF-16 / 31,874 UTF-8 bytes, SHA256 `ee291685ca4a24ed116d169a8da127f1f5589df41580a626d4ab68dae8b832bf`, exact-equal to the published preparation source. Both complete authority comments and the packet/addendum were read; their earlier proposed labels describe historical preparation.

Actual sole Worker/writer: ChatGPT subscription / Codex / `gpt-6.1-sol` / xhigh; requested/effective Orca settings and terminal agree, and safe login-status output confirmed ChatGPT without exposing credentials. Task `task_16da17b5adb3`, dispatch `ctx_fe3bbe6fe471`, terminal `term_1d4c709e-a180-4073-b5cf-2f25444a50cb`, runtime `47b940e9-15d7-40a2-8719-e6941066954b` (Orca 1.4.237), workspace `C:/Users/Chooo/orca/workspaces/ai7-harness/codex-1147-embedding-validation`. Entry ask `msg_67eb94cb72a3` received explicit Phase 1 GO before mutations/acquisition. The selected fresh Claude / Claude Code / `claude-opus-5-5` / xhigh Reviewer has no actual launch or handoff record yet; review and final head/base remain unresolved.

External staging is exclusively `C:/Users/Chooo/Playground/ai7-material-admission/f08`. It was absent at preparation and entry, then rechecked absent with ordinary, non-reparse ancestors through its parent before exclusive creation. Owned groups are metadata, archives, models, extracted, diagnostics and results. No repository/global install, shared cache mutation, lifecycle execution, secret, protected manuscript, provider call, guest use or host/guest network change occurred. Only synthetic cases were used. This document is the sole tracked change.

### Exact acquisition and isolated closure

Acquisition finished 2026-10-25T04:29:52Z. Each exact official version record was reread and its SRI compared with the brief before its official tarball was fetched. SHA512 was recomputed over compressed bytes before extraction; all 18 matched, as did the observed compressed byte counts and SHA256 values below on subsequent local verification. Registry unpackedSize is separate and was retained externally, never used as compressed size. No version/range/mirror substitution or optional addition was made. Matching SRI establishes archive integrity, not source-to-binary reproducibility.

| Exact package / official metadata | Compressed bytes | Archive SHA256 | Expected = observed SHA512 SRI | License |
| --- | --- | --- | --- | --- |
| [onnxruntime-node@1.30.0](https://registry.npmjs.org/onnxruntime-node/1.30.0) | 113507888 | `6e3390d6b783e7be946fad629292799da28d0b42f84856e50d2c1b0383291e75` | `sha512-twhs1C2C/BFkz1yc5OY0KIU2GUq6DURO7hD4bx5Q2Qy3nAMJwRXW8xU3NVczE29VA9lolLOYepoD8fjTGOfIqw==` | MIT |
| [onnxruntime-common@1.30.0](https://registry.npmjs.org/onnxruntime-common/1.30.0) | 66795 | `7906c439e0d3e0f4048caa23b64cdfadc0f455c377f579ce1ab2a4b778f07d5f` | `sha512-7fdVWjAID1dVhH/G8qK3APARunV4VkBFoCQAP7qp4Wkab0mrorvmc+sqiT+mKXOzDqdjN5j+/Z9nb4gzNPWcyA==` | MIT |
| [@huggingface/tokenizers@0.2.0](https://registry.npmjs.org/%40huggingface%2Ftokenizers/0.2.0) | 87011 | `2800014c83b8186b2e4210c20672f1fb65a12cef85d7e95e0f2003e022611b4a` | `sha512-LidMHe1FpcSYH4vcSjXooda34pC0M8m1gmDOv7SQi6Iv+ib1zX7J3sHBCC9/3FPCkn2k1b55FneVqMRxrr99pg==` | Apache-2.0 |
| [adm-zip@0.6.0](https://registry.npmjs.org/adm-zip/0.6.0) | 32244 | `98973cbd21fd7b9e99d2f5b59ce761b756687c744c218de5baf7ff7e600b6635` | `sha512-XleryMhbuksdKtofnWZ9Sk+4CUTbms4Mb/EU32SZwToAyZ5RgVos/ki8n+yr0LWHOGKuakbXTuuYNHLQjhddgg==` | MIT |
| [global-agent@4.1.3](https://registry.npmjs.org/global-agent/4.1.3) | 18140 | `478ca4fff13292091adabb7f8ef985bf952f809cbf53ee5f9828ebd49b47a0a8` | `sha512-KUJEViiuFT3I97t+GYMikLPJS2Lfo/S2F+DQuBWzuzaMPnvt5yyZePzArx36fBzpGTxZjIpDbXLeySLgh+k76g==` | BSD-3-Clause |
| [globalthis@1.0.4](https://registry.npmjs.org/globalthis/1.0.4) | 8504 | `de98da383c6f5c2ae39c847cedd2a2e4fd4ba344312c4309d8cee6a3a07076eb` | `sha512-DpLKbNU4WylpxJykQujfCcwYWiV/Jhm50Goo0wrVILAv5jOr9d+H+UR3PhSCD2rCCEIg0uc+G+muBTwD54JhDQ==` | MIT |
| [define-properties@1.2.1](https://registry.npmjs.org/define-properties/1.2.1) | 5203 | `5de7e3804fadee9d773cd494b695e6efedfee8837e751fd9b9b77c3e9c6b40f4` | `sha512-8QmQKqEASLd5nx0U1B1okLElbUuuttJ/AnYmRXbbbGDWh6uS208EjD4Xqq/I9wK7u0v6O08XhTWnt5XtEbR6Dg==` | MIT |
| [define-data-property@1.1.4](https://registry.npmjs.org/define-data-property/1.1.4) | 8913 | `16304ad73df1364ca8623c28a8969de01cd7189b4f9b05668fadb598f110e4d2` | `sha512-rBMvIzlpA8v6E+SJZoo++HAYqsLrkg7MSfIinMPFhmkorw7X+dOXVJQs+QT69zGkzMyfDnIMN2Wid1+NbL3T+A==` | MIT |
| [es-define-property@1.0.1](https://registry.npmjs.org/es-define-property/1.0.1) | 4431 | `5986b8b13121340a8b0d5c7d8f0f961aa80ef3a74515ca9cb7a78d86ed0385f7` | `sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==` | MIT |
| [es-errors@1.3.0](https://registry.npmjs.org/es-errors/1.3.0) | 5338 | `d14dd1c35b4bd3b8aca3219fd3627eb7f3eb49cf6b4c8a7ca58b91fd7a190993` | `sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==` | MIT |
| [gopd@1.2.0](https://registry.npmjs.org/gopd/1.2.0) | 4584 | `d536d0de4dd285dc1468fbb7f39334a47ee0eec9c27f9b626a6e71466c9fda82` | `sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==` | MIT |
| [has-property-descriptors@1.0.2](https://registry.npmjs.org/has-property-descriptors/1.0.2) | 4429 | `0219bbd8f32e268eeb6efff55a2c6ff2d502098f49c583ff023b2d9d5a8bfa87` | `sha512-55JNKuIW+vq4Ke1BjOTjM2YctQIvCT7GFzHwmfZPGo5wnrgkid0YQtnAleFSqumZm4az3n2BS+erby5ipJdgrg==` | MIT |
| [object-keys@1.1.1](https://registry.npmjs.org/object-keys/1.1.1) | 7677 | `9678d9055619767c8a134033709e88a6e0a19600f3d3f2cda40acdfd75e7f212` | `sha512-NuAESUOUMrlIXOfHKzD6bpPu3tYt3xvjNdRIQ+FeT0lNb4K8WR70CaDxhuNguS2XG+GjkyMwOzsN5ZktImfhLA==` | MIT |
| [matcher@4.0.0](https://registry.npmjs.org/matcher/4.0.0) | 3483 | `2c318d57c8cb40d219c95c1a5699a85ac7555839332208a559cc3c0157be160e` | `sha512-S6x5wmcDmsDRRU/c2dkccDwQPXoFczc5+HpQ2lON8pnvHlnvHAHj5WlLVvw6n6vNyHuVugYrFohYxbS+pvFpKQ==` | MIT |
| [escape-string-regexp@4.0.0](https://registry.npmjs.org/escape-string-regexp/4.0.0) | 2017 | `4b44a14da6987a3c0585c2ff16b3800425732ff35cad710c65e72d7f8e33b11b` | `sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==` | MIT |
| [semver@7.8.0](https://registry.npmjs.org/semver/7.8.0) | 29128 | `f4f00c32a88c3c33424e5759590c29c2ed599eb5125cc0df4f2d8c6cfdd6fc04` | `sha512-AcM7dV/5ul4EekoQ29Agm5vri8JNqRyj39o0qpX6vDF2GZrtutZl5RwgD1XnZjiTAfncsJhMI48QQH3sN87YNA==` | ISC |
| [serialize-error@8.1.0](https://registry.npmjs.org/serialize-error/8.1.0) | 3479 | `09092ee9990c5609ef691eca7de26e4b4bde285920ceef40fd806edd5ccc017f` | `sha512-3NnuWfM6vBYoy5gZFvHiYsVbafvI9vZv/+jlIigFn4oP4zjNPK3LhcY0xSCgeb1a5L8jO71Mit9LlNoi2UfDDQ==` | MIT |
| [type-fest@0.20.2](https://registry.npmjs.org/type-fest/0.20.2) | 37225 | `b9d5d4fc05287af1445030152284e7def803976beb4b23ae4dc26824e79465a2` | `sha512-Ne+eE4r0/iWnpAxD852z3A+N0Bt5RN//NjJwRd2VFHEmrywxf5vsZlh4R6lixl6B+wz/8d+maTSAkN1FIkI3LQ==` | (MIT OR CC0-1.0) |

All dependency keys agree with the closed manifest: node → adm-zip/global-agent/exact common; global-agent → globalthis/matcher/semver/serialize-error; globalthis → define-properties/gopd; define-properties → define-data-property/has-property-descriptors/object-keys; define-data-property → es-define-property/es-errors/gopd; has-property-descriptors → es-define-property; matcher → escape-string-regexp; serialize-error → type-fest. Other named packages have no declared runtime edges. There are no additional optional/peer/bundled requirements. Type-fest is a declaration-only carrier (`./index.d.ts`), with no runtime JavaScript entry; its presence is verified rather than falsely claiming require('type-fest') succeeds. No development dependencies were acquired.

Actual manifests declare ORT node's `postinstall: node ./script/install`; no other install/preinstall/postinstall was found. Publisher/build/test scripts also remained unexecuted. The method was direct HTTPS-to-file plus pre-execution hashing and the existing Windows bsdtar, with no package-manager installation. Archive listings rejected absolute paths, traversal, backslashes/colon/control characters, duplicate/case collisions, links and special members before extraction; destinations remained inside staging. The layout contains 595 regular package files, each inventoried by size/SHA256 and locally rechecked. Native files remain unmodified. Existing Node resolution inspected all declared entries/edges without importing them and found only staged paths; NODE_PATH and NODE_OPTIONS were absent. The Windows native loader path was inspected in the package source, not loaded.

The first acquisition pass stopped on the diagnostic's handling of an empty dependency object. The owned root was retained; the corrected pass reused and reverified existing approved bytes without redownload/overwrite. A separate diagnostic distinguished type-only resolution and fixed its explicit './index.d.ts' assertion. These were diagnostic failures, not candidate compatibility results. All final data-integrity/resolution checks pass. No package install/prepack/build/model resolver/NuGet/DXC fallback ran.

Model source is exact revision `614241f622f53c4eeff9890bdc4f31cfecc418b3` of [intfloat/multilingual-e5-small](https://huggingface.co/api/models/intfloat/multilingual-e5-small/revision/614241f622f53c4eeff9890bdc4f31cfecc418b3?blobs=true). The two LFS files match approved size/SHA256; each small file matches its approved size and Git blob identity, computed as SHA1 over the Git blob header plus exact bytes. Their newly computed content SHA256 values are separate:

| Pinned relative path | Bytes | Observed SHA256 | Expected = observed Git blob, where applicable |
| --- | --- | --- | --- |
| `onnx/model_qint8_avx512_vnni.onnx` | 118346824 | `dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88` | SHA256 above matches approved LFS SHA256 |
| `onnx/tokenizer.json` | 17082730 | `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39` | SHA256 above matches approved LFS SHA256 |
| `onnx/config.json` | 653 | `bbb7c1333fc4b3e27fbc9cd5d2070aabcc1d4dfb99917c3633e772f97545a6b6` | `698e598c24523f3857295b11abec0703d19ea180` |
| `onnx/tokenizer_config.json` | 443 | `a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b` | `059214673d9d6d2ee319411e2ffec8c024b816d5` |
| `onnx/special_tokens_map.json` | 167 | `d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7` | `e0b1d18ecd0ae4ff1d47bd297d910c0cf83e504b` |
| `1_Pooling/config.json` | 200 | `987f7a67a38fa564c849bb5d277c52ab9088a84368fc0be31a354125aebb12a0` | `acbd4014202bf4dbc6c03229bcbeef7c4feafb58` |
| `sentence_bert_config.json` | 57 | `948201d8329907aae938fa62f9ceeed53f5694dacc2b87b9f3b78b37ee986529` | `4eca68d85ecd3034cf4174d8a4033a75344ea62d` |
| `modules.json` | 387 | `c6e29747481e8b5dd2b58401966aeac910de39092f90cda9a704b1545f902b04` | `ac2039abdf6ff023b27c919bb9675cfe378cb10f` |

Only these eight model assets were acquired. The final observed asset transport origins were `https://us.aws.cdn.hf.co` for the two LFS assets and `https://huggingface.co/api/resolve-cache/models/` for the six small files, with exact revision paths retained externally and signed query strings omitted. No alternative graph, external-data sibling, sentencepiece binary or reference tokenizer was fetched.

### Complete bundled native inventory

All 17 native files belong to the verified node archive. Architecture is read from PE/ELF/Mach-O headers, not inferred solely from directory names. File/product versions below are actual Windows version-resource observations; absent versions stay absent. All ten PE carriers contain embedded CMS signatures with Microsoft Corporation signer subjects; CMS signature verification used SignedCms.CheckSignature(true), which does **not** validate the PE Authenticode content digest, certificate trust, revocation or timestamp policy. No online chain lookup was requested. Signer thumbprints were `AB172913A2960A224809EE8A0C371CD47A079B72` and `1D77A9B9E8FE2075D9AD15123257FB90DB0DA4A1`, with observed certificate expiry in April 2027. Non-PE signatures were not assessed. This is an explicit limited signature observation, not an Authenticode trust pass.

| Path under ORT bin/napi-v6 | Format / architecture | Bytes | SHA256 | Reported file / product version | Signature observation |
| --- | --- | --- | --- | --- | --- |
| `darwin/arm64/libonnxruntime.1.30.0.dylib` | Mach-O / arm64 | 44589928 | `685d2be5dba1309c89d3a5324b7fd06a5c42f1a61bfea32d14c4cc28d072121d` | none reported | not assessed (PE-only signature parser) |
| `darwin/arm64/libonnxruntime.1.dylib` | Mach-O / arm64 | 44589928 | `685d2be5dba1309c89d3a5324b7fd06a5c42f1a61bfea32d14c4cc28d072121d` | none reported | not assessed (PE-only signature parser) |
| `darwin/arm64/onnxruntime_binding.node` | Mach-O / arm64 | 266840 | `a3f993357759b06ae2411f70af60f5e041d04521ea7f0d12cb7546e411a527dd` | none reported | not assessed (PE-only signature parser) |
| `linux/arm64/libonnxruntime.so.1` | ELF / arm64 | 25135496 | `1f549d46250b005580b597f4164984aaf75b3bcb9f3aeb07c7f8a8fe60b23c76` | none reported | not assessed (PE-only signature parser) |
| `linux/arm64/onnxruntime_binding.node` | ELF / arm64 | 394648 | `afec78dc11d38dc81605b068cefe1fc73ffe77ca240c15468aa40786150beac8` | none reported | not assessed (PE-only signature parser) |
| `linux/x64/libonnxruntime.so.1` | ELF / x64 | 45828512 | `ffb75a925ba05e47b235bb66e3e3911714a80b328a9c9425539feb204aa32a23` | none reported | not assessed (PE-only signature parser) |
| `linux/x64/onnxruntime_binding.node` | ELF / x64 | 389488 | `ccdc60b981d93a490cf9513d3f583547252b6e285b72988a96a494f2f006c7b8` | none reported | not assessed (PE-only signature parser) |
| `win32/arm64/DirectML.dll` | PE / arm64 | 18444600 | `aaf72a9d55aa123e0708d957d30dd4fbeb7a2e335ec6257ed5ff4261a402b9ee` | 1.15.4+241025-1615.1.dml-1.15.fac7597 / 1.15.4+241025-1615.1.dml-1.15.fac7597 | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/arm64/dxcompiler.dll` | PE / arm64 | 22285624 | `442a995492579e1048cf1f05a86ab00f476c46b7f9d0996e588884040a543bbe` | 1.8.2502.8 / 1.8.2502.8 (b4711839e) | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/arm64/dxil.dll` | PE / arm64 | 1769784 | `859b6d638c5ca3df39e9cab2a602cb0f63d0e63d750f84bb2a9ec9031319b73e` | 1.8.2502.8 / 1.8.2502.8 (b4711839e) | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/arm64/onnxruntime_binding.node` | PE / arm64 | 422200 | `d8179924f15c2d3c1c8a75c50adf1671ec28c7f1cb0da9fc28b17daa02c5ecf5` | none reported | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/arm64/onnxruntime.dll` | PE / arm64 | 29815136 | `6c3a2abf5c6aca11c48a0d338a91af309f2266f25ce2e4084e6a87bbcb0fbfd0` | 1.30.0.20260909.4.f2c39fe / 1.30.0.20260909.4.f2c39fe | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/x64/DirectML.dll` | PE / x64 | 18527584 | `234e8898778cdec88d3cb0539508273494082812c968699f3de665a018971625` | 1.15.4+241025-1615.1.dml-1.15.fac7597 / 1.15.4+241025-1615.1.dml-1.15.fac7597 | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/x64/dxcompiler.dll` | PE / x64 | 17986360 | `593d42df78c7f9cbd97c1374af107cfe20985759f98b77afc1448fe41ee3cc76` | 1.8.2502.8 / 1.8.2502.8 (b4711839e) | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/x64/dxil.dll` | PE / x64 | 1508664 | `cf9a3981263f8ec30c9905d136eeaf4b4573209c602198671b958ec86905dea8` | 1.8.2502.8 / 1.8.2502.8 (b4711839e) | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/x64/onnxruntime_binding.node` | PE / x64 | 298848 | `ddd428464069b84414d34ec1796c7c2a69c33a976e4b0390692629e394f92fa1` | none reported | embedded CMS verifies; PE digest, trust and revocation not checked |
| `win32/x64/onnxruntime.dll` | PE / x64 | 28754232 | `508c362f5673483dd3a086379c392795b2e42d10d5e6f3f90ebd7ac21c97af67` | 1.30.0.20260909.4.f2c39fe / 1.30.0.20260909.4.f2c39fe | embedded CMS verifies; PE digest, trust and revocation not checked |

The Windows x64 binding/runtime, DirectML and both shader DLLs are present; CPU selection does not turn this archive into a CPU-only carrier. DirectML resources identify 1.15.4; DXC/DXIL identify 1.8.2502.8 (b4711839e). ORT resources identify 1.30.0.20260909.4.f2c39fe. The [ORT source commit](https://github.com/microsoft/onnxruntime/tree/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7) is source evidence; the node registry record has no gitHead and does not prove source-to-tarball equivalence. No other platform/provider was activated, rebuilt or repaired.

### Actual notice carriers and unresolved rights

**Held:** neither onnxruntime-node nor onnxruntime-common tarball contains a LICENSE/COPYING/NOTICE-named file. Their source headers and package metadata declare Microsoft/MIT, but no dedicated native DirectML/DXC carrier is present in those archive inventories. Exact public source/license text below was retained separately as metadata, without repacking the archives or asserting complete distribution readiness. The ORT source ThirdPartyNotices contains generic LLVM and other component entries, but no DirectML/DXC/DXIL-specific match; that is not a per-DLL build/license manifest.

DirectML's actual 1.15.4 version agrees with the pinned dml.cmake default. Its official Microsoft software terms differ from MIT and retain separate third-party/notices obligations. The DXC packaging route names v1.8.2502, and exact b4711839eb9a87da7c3436d9b212e0492359fbbd LICENSE/ThirdPartyNotices are available as public text; actual copied-DLL notice completeness remains unproved. Separate DirectML NuGet and DXC release binaries were not acquired. Missing carrier evidence is held; no future redistribution or complete component-term coverage is inferred.

The exact model metadata declares MIT and lists 43 siblings with no dedicated LICENSE/COPYING/NOTICE path. The pinned model card was read as public metadata (497,538 bytes); authorship citations and an unrelated source project's notice do not supply an authoritative notice carrier for these exact quantized graph/tokenizer bytes. That carrier remains held. No notice was invented or silently added to the asset/package.

Actual JavaScript license files:

| Package license carrier under extracted/node_modules | Bytes | SHA256 |
| --- | --- | --- |
| `@huggingface/tokenizers/LICENSE` | 11357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `adm-zip/LICENSE` | 1106 | `6bb5b2d4c07d793ca928daa63a8899c6914fafb5ac3aa04ec10cae07f3d57dca` |
| `global-agent/LICENSE` | 1531 | `2aabdab5d0ce03a7314def8222988c2da4ba593ae82ae312439e5e306001dbae` |
| `globalthis/LICENSE` | 1081 | `acfaf437865d82f0fa9b9cdcae8b550bed8d011adaa5b42d973191caf99f62a8` |
| `define-properties/LICENSE` | 1080 | `00d402c2bbe7c67369bd01ce2c16b8ed46ccc949a1ee2d6bb8f9606afa8c7434` |
| `define-data-property/LICENSE` | 1071 | `b41d08bc3624d8c436fc80237d73ebb361985a67f4504bbcd703e5ca2b27254c` |
| `es-define-property/LICENSE` | 1071 | `5e325595b4ea8cfec3802f545b1def5d7b73e4a5b8e9ba63e32a320f67732292` |
| `es-errors/LICENSE` | 1071 | `5e325595b4ea8cfec3802f545b1def5d7b73e4a5b8e9ba63e32a320f67732292` |
| `gopd/LICENSE` | 1071 | `d90bf0a089da4cf43d644ed240a0b3825dcdb705e64e38371d56995a4cc9e4c5` |
| `has-property-descriptors/LICENSE` | 1067 | `0f0ca96f50793990031ebc488a38f7292ff70bce8ab6a8e5eeda674abc32ccdf` |
| `object-keys/LICENSE` | 1080 | `5640e5cbe2e9f57f6ccfdd8dbfbeadb875495bdbcb69d2666ce3177ccd0942e4` |
| `matcher/license` | 1117 | `5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3` |
| `escape-string-regexp/license` | 1117 | `5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3` |
| `semver/LICENSE` | 765 | `4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b` |
| `serialize-error/license` | 1117 | `5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3` |
| `type-fest/license` | 1116 | `64a93ffc0a06a2266dbb57ed7ebe3b56ba66ab337b6347fabdbf86c76819fbae` |

Type-fest declares MIT OR CC0-1.0; its actual bundled file is MIT. Global-agent's actual carrier is BSD-3-Clause, semver ISC, tokenizer Apache-2.0, and the other present JS carriers MIT. These are per-package observations, not a blanket MIT label for ORT's bundled native closure.

Exact public text/source observations (bytes and SHA256):

| Pinned public text / source | Bytes | SHA256 |
| --- | --- | --- |
| [ort-LICENSE.txt](https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/LICENSE) | 1073 | `2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c` |
| [ort-ThirdPartyNotices.txt](https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/ThirdPartyNotices.txt) | 338088 | `143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3` |
| [ort-dml.cmake.txt](https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/cmake/external/dml.cmake) | 5014 | `63955bc5296908d3f5ed06b03938e9797d6bd8f8ea60432d6bc679d47e6f034e` |
| [ort-windows-packaging.yml.txt](https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/tools/ci_build/github/azure-pipelines/stages/nodejs-win-packaging-stage.yml) | 8656 | `ae9214955250ed75d160b24be1f3690bc238ea77cad1286c31018ba9eb6405f6` |
| [ort-npm-packaging.yml.txt](https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/tools/ci_build/github/azure-pipelines/stages/nodejs-npm-packaging-stage.yml) | 11774 | `631bb2bdefa89b2ff21cefa530ebb7fa0721d0bfe8253dc60e6d80a2d8aae8d6` |
| [ort-install-metadata.js.txt](https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/js/node/script/install-metadata.js) | 1788 | `2cfbb2fcf1f170d5da564c0be3222821050bcbd282c9e0493e9433649ac2f130` |
| [dxc-LICENSE.TXT](https://raw.githubusercontent.com/microsoft/DirectXShaderCompiler/b4711839eb9a87da7c3436d9b212e0492359fbbd/LICENSE.TXT) | 29241 | `27a49e35d1da96eba18fba54bc882667ff0ff8c0254f16f2b6e165d605ba7df8` |
| [dxc-ThirdPartyNotices.txt](https://raw.githubusercontent.com/microsoft/DirectXShaderCompiler/b4711839eb9a87da7c3436d9b212e0492359fbbd/ThirdPartyNotices.txt) | 11256 | `19512a5d0a015ef16d167272c164da49a604614a786206212a80ad486ed0be6d` |
| [DirectML-1.15.4-License.html](https://www.nuget.org/packages/Microsoft.AI.DirectML/1.15.4/License) | 23916 | `77e7c5d6cba9dc67fb7cc650d7475904c570cf6ba51883c9620192ea7c068d3e` |
| [model-README.md](https://huggingface.co/intfloat/multilingual-e5-small/raw/614241f622f53c4eeff9890bdc4f31cfecc418b3/README.md) | 497538 | `0038de97aee16258cecbad7ffda4b4febd6953e747a00e0ddbc8e6ed241e9c1c` |

### Synthetic BM25 baseline, separate from candidate execution

The 12 Chinese queries / 24 short passages and relevant IDs were frozen before any scoring in temporary `f08-synthetic-cases.json`, SHA256 `5e02cc74509d96654f4089cefa4cbdb261725e9b0bb9de18d9e4694419bba546`. Q01–Q04 are paraphrase cases (including two memory/exemplar-like cases), Q05–Q08 lexical cases, Q09–Q10 negation/number counterexamples, Q11 ambiguous and Q12 no-answer. Labels/cases were not tuned after results. No source corpus or query text is copied into this document.

The actual accepted RetrievalIndex from exact d1c was bundled read-only with its canonical helper and existing Node-denial owner, using the explicitly assigned existing esbuild 0.28.2 executable. Its observed SHA256 `c7bee37877d0aa6a046e52783fa0a2cf1a9ce5579d68bb3083bda99d4bff18ef` matches the admitted carrier. Bundle SHA256 `ae0e112d4eddebbe4ad45f74beb44a765b3a2c973350342e099565099faf50c5`; source commit `d1c31c40428057bdc5a637f55fd8d63dd496d5ec`. Bundle inputs are only src/service/retrieval/index.ts, src/service/analysis/canonical.ts, src/shared/network-denial.ts and the external temporary entry; imports outside that bundle are Node builtins. A null embedding provider preserves real Han-bigram BM25, maximum 8, source/candidate mapping and score/candidate-ID tie ordering. This execution imported no newly acquired candidate package and is not an offline native test.

| Case / category | Relevant IDs fixed before scores | BM25 returned IDs in rank order (maximum 8) | First relevant rank | E5 |
| --- | --- | --- | --- | --- |
| Q01 / paraphrase | P01 | none | no relevant hit | not run |
| Q02 / paraphrase | P03 | P15 | no relevant hit | not run |
| Q03 / paraphrase-memory-like | P05 | none | no relevant hit | not run |
| Q04 / paraphrase-exemplar-like | P07 | none | no relevant hit | not run |
| Q05 / lexical | P09 | P09, P10 | 1 | not run |
| Q06 / lexical | P11 | P11, P12 | 1 | not run |
| Q07 / lexical-cross-section | P13 | P13, P14 | 1 | not run |
| Q08 / lexical | P15 | P15, P16, P06, P05 | 1 | not run |
| Q09 / counterexample-negation | P17 | P18, P17, P24, P16, P14, P23, P22 | 2 | not run |
| Q10 / counterexample-number | P19 | P19, P20, P10, P09 | 1 | not run |
| Q11 / ambiguous | none; excluded from recall/MRR | P21, P22 | no relevant hit | not run |
| Q12 / no-answer | none; excluded from recall/MRR | none | no relevant hit | not run |

Over the ten predeclared answerable cases, BM25 recall@1 = **0.50**, recall@3 = **0.60**, MRR = **0.55**. Q01/Q03/Q04 miss, Q02 returns unrelated P15, and Q09 ranks the negated-fact distractor P18 above relevant P17. Q09's P24/P16 tie is resolved by actual candidate ID. Q11 returns conflicting hearsay candidates but supplies no determined answer; Q12 has no result. Both are excluded from recall/MRR. All returned rank IDs are shown; local temporary results retain scores and the exact candidate mapping below. E5 cosine ranks, recall, repeatability and comparisons are **not run**, with no RRF or semantic-quality claim.

| Synthetic passage ID returned by BM25 | Actual RetrievalIndex candidate ID |
| --- | --- |
| P05 | `4ef9fc2d8194b762598663d5d26c433fcc3fd727f8a351f94b35ec2904c1f5e1` |
| P06 | `4eca0bbd4592a5c4232182c6220df76a28549cc314d7340ee048d3dc9ea67e8f` |
| P09 | `17f0ffd80aea33cc9bf0b8729e4b760d8d27ebd5bcf1969919a6ac62012c0b5b` |
| P10 | `e27b3c2fba63ba887fae180e474b38add8a93828a8bdfdd55750a414d8dfeec3` |
| P11 | `638fb9c1578d0584403a2227b8e8ac4077707debd84edd58a53b4997521702e6` |
| P12 | `d37610bfe91b4e1d6b8f364dd509e285597ad4a89df06f8bfc25fb8e12395bb6` |
| P13 | `3cdb8b69ac11ffbc3a51fa0a38698db38f5137c57b7cecaef6ba38042436e9e9` |
| P14 | `a115290679c46b342173ef0f56d6185464e248e04f1e53f8f06cdb86fe06cecf` |
| P15 | `de34d1636ec24a458342df245216810f6199a98a06019c0338fa54e476973220` |
| P16 | `9b5ca45d2c3291c4984a1615b71b2884e358e563cb85ac99e8b62f2da6dc07c6` |
| P17 | `9353211d024ad57e3855f404f3f27032b371f31b792f20fd3d3e952b424b142d` |
| P18 | `80dd5ad804285a65ca61afea69ed2a0b620a0b16f1605274d85d1afe74e8816b` |
| P19 | `d13c12aa52a70416dc847820931a3a1e671bb9166978d727ae2ff4dbe34bff47` |
| P20 | `590bf23620c769b03be8748f5d20afeaff9645ee53e8d8ec17a824fb126cc908` |
| P21 | `589748da236354b059bc0d2ed45c355c56a782e14fe72fd4e16be66c62a1b93d` |
| P22 | `aa859c4c4b798742d0c782ba55fdaeb235e0d5e52885245c97758db65bcc5c6b` |
| P23 | `2d90919e96d16a41d3c1e198d5bf0fa95253ab6fb91801d53c58ad3774b5f087` |
| P24 | `46b11db82ee4afafa0287314c529dd592521f7fa89093e8161497ae59b443d9e` |

### Environment, bounded preparation and facet disposition

The acquisition/BM25 host observed Windows 11 Pro 10.0.26200, x64, AMD Ryzen 9 9950X3D, 16 cores / 32 logical processors. A 2026-10-25T04:36:53Z snapshot showed 49,429,620 KiB visible / 11,815,656 KiB free physical memory; that is an observation, **not an assigned usable native budget**. ISA support was not independently measured. Existing `C:/Program Files/nodejs/node.exe` reports v24.18.1 / win32 / x64 and executable SHA256 `ac51903c4c111815d52280b1fdcc8da067cbb37e2fe1a765097b85c3292c8582`; this is distinct from the declared Node archive hash above. Existing tar is Windows bsdtar 3.8.9, SHA256 `a3ac62fd4cdf619a7c53f71ca3fe5fb42f72020975670ff29afe3603f6416a8e`. Existing cached pnpm 11.24.0 was detected with COREPACK_ENABLE_NETWORK=0; no setup/install occurred.

| Facet | Status | Exact disposition |
| --- | --- | --- |
| Exact archive/model sizes, SHA256, SHA512 SRI and Git blobs | pass | 18 packages / 8 assets; separate local verification passed |
| Safe extraction, declared closure and resolution containment | pass | 595 regular files, 17 native files; staged-only resolution without import |
| Native versions / architecture / signature observation | pass, limited | Header/version and embedded CMS observations above; PE digest/trust/revocation unverified |
| Native/model notice completeness and redistribution readiness | held | Missing archive carriers and exact model notice owner; no distribution grant |
| Independent exact-E5 token ID/mask parity | held | No independent oracle bound to these exact files; no second tokenizer/reference dependency acquired |
| Actually offline native context / usable resource lease | held | Commander had assigned neither at this checkpoint; no guest or firewall/network change |
| Graph load/operators/I/O/external-data contract / CPU provider | not run | Candidate JS/native code was not imported; filename alone proves no compatibility result |
| Real 384-vector pooling/L2, prefix roles, 512 boundaries and Unicode | not run | Requires the assigned offline execution phase; no fabricated tensor/output metadata |
| Small hand-tensor pool/L2 arithmetic | pass, separate | Hand-calculated masked mean then L2 matched; batch order/padding checked; zero mask, nonfinite and zero norm rejected; no graph evidence |
| Frozen actual BM25 baseline | pass, bounded observation | Twelve cases above; no model or learning claim |
| E5/BM25 comparison and E5 counterexamples | not run | E5 import/execution held; BM25 baseline is not semantic evidence |
| Native load/warmup/thirty jobs/three release cycles | not run | No assigned offline execution context |
| Overlapping heartbeat/control latency, timing p50/p95/max | not run | No native work; no fake async delay was measured |
| Native-inclusive RSS/peak/private bytes, pressure behavior | not run | No native workload or usable budget assigned; no RSS-minus-heap or hard cap claim |
| Queued/active cancel, late results, stop/close/error and owned exit | not run | No Worker/session executed; no hard preemption or no-hang guarantee |
| General Windows x64 / non-AVX512 CPU breadth | held | No tested native CPU yet; no additional graph/provider/hardware substituted |
| Fresh Reviewer reproduction / temporary cleanup | pending | No handoff yet; preserve verified bytes and temporary tools/results for review |

Numerical tolerances were fixed before scores: norm absolute 1e-5 and repeat/padded-batch maximum coordinate 1e-4; no candidate observations exist to compare or widen them against. The independent-tokenizer prerequisite remains separate from structural tokenization or same-library repeat/decode. This phase did not run the unrelated XLM-R test downloader.

Static inspection of the acquired exact ORT API confirms CPU/sequential/intraOpNumThreads/interOpNumThreads declarations and session.release(): Promise<void>, delegating to handler.dispose() and native dispose(). Its backend schedules synchronous native load/run in setImmediate; that is not controller event-loop isolation. No effective session/provider/thread option, abort signal, native preemption, release timing or memory bound was tested. A later GO must first establish actual offline isolation covering native DLL egress and a usable resource budget, then use one controller, one owned Worker/session, at most one active/one queued job, input/batch/sequence caps and the full brief's finite workload. The Node guard is defense in depth, not proof of native isolation. Native diagnostic execution code is not represented here as ready or validated.

### Commands, temporary evidence and next owner

Executed surfaces: PowerShell `& <staging>/diagnostics/f08-acquire.ps1` (then `-Resume` after the diagnostic correction), `-SourceTexts -Resume` for exact public text metadata; existing `tar -tf/-tvf` then `tar -xf <archive> -C <isolated-package> --strip-components 1 --no-same-owner --no-same-permissions`; `node <staging>/diagnostics/f08-validate.mjs`; the verified existing esbuild binary with `f08-retrieval-entry.ts --bundle --platform=node --format=esm --target=node24 --outfile=<staging>/diagnostics/f08-retrieval-entry.mjs --metafile=<staging>/metadata/retrieval-bundle.json`; and `node <staging>/diagnostics/f08-retrieval-entry.mjs --bm25-only`. Candidate packages, publisher scripts, product tools, Electron Journeys and product ladders were not run.

| Temporary diagnostic | SHA256 |
| --- | --- |
| `f08-acquire.ps1` | `b9018bdecc225f093364724521ed4bcd3a7009b78127c655c935dc467289a12a` |
| `f08-validate.mjs` | `79e44c93ba4cdb203ea934a06a70abc08efab5277909ee6ba98de3101ed27025` |
| `f08-synthetic-cases.json` | `5e02cc74509d96654f4089cefa4cbdb261725e9b0bb9de18d9e4694419bba546` |
| `f08-retrieval-entry.ts` | `06ab0d6675228f57095374ed70c71f69893a0e4fb6c5971359ec49aaf3e69249` |
| `f08-retrieval-entry.mjs` | `ae0e112d4eddebbe4ad45f74beb44a765b3a2c973350342e099565099faf50c5` |

Metadata inventories, immutable assets/archives/original notices and temporary synthetic/results/tool sources remain only under the assigned external root. This is a Phase 1 checkpoint, **not whole-Issue validation completion**. After a recorded sole-owner handoff, the fresh Reviewer must independently verify bytes/extraction/scripts/notices and reproduce meaningful bounded checks in the actual assigned offline context, reusing verified assets. Temporary diagnostics/results must be removed after reproduction and before integration; they are not a permanent proof registry. Verified assets/notices await the Commander's explicit external disposition and may not be published or deleted by inference. The native resource lease, actual Reviewer, handoff, incoming/final heads and final target base remain pending. Documentation-only checks do not replace this external experiment.
