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


## F08 external validation candidate — retained results and limits

Status: **the exact external development experiment is authorized; grouped execution has retained numerical and termination failures; the later single-text profile has bounded positive observations. The candidate is not shipped and product F08 remains unimplemented.** This report covers [Issue #1147 revision 1](https://github.com/zhouy1017/ai7-harness/issues/1147), the [exact packet](https://github.com/zhouy1017/ai7-harness/issues/1027#issuecomment-6386081328) and [Owner decision](https://github.com/zhouy1017/ai7-harness/issues/1027#issuecomment-6393161886). Authorization, a completed diagnostic workload and a successful individual facet are different facts. The admitted/shipped closure above is unchanged; no product adapter, policy activation, dependency installation or redistribution admission follows from these results.

### Scope, custody and reporting status

The original source base was `d1c31c40428057bdc5a637f55fd8d63dd496d5ec`; the acquisition-only checkpoint is `9e59e3f9e79753295482a677574783869251e30d` on `codex/1147-embedding-validation`. The original official brief was 31,836 UTF-16 code units / 31,874 UTF-8 bytes, SHA256 `ee291685ca4a24ed116d169a8da127f1f5589df41580a626d4ab68dae8b832bf`. This documentation continuation reconciles that checkpoint onto exact target `7cc80f608dfc659b3cd87d7e7da0a7fe75ba83bc` under the [fresh Author assignment](https://github.com/zhouy1017/ai7-harness/issues/1147#issuecomment-6405114263); it runs no experiment. The initial Worker was ChatGPT / Codex / `gpt-6.1-sol` / xhigh; the subsequent independent Reviewer was Claude Max / Claude Code / `claude-opus-5-5` / xhigh. Root owned native launches and their OS cleanup. Earlier reviewed conclusions remain historical evidence; final cross-channel review of the S1 B/comparator/oracle results and this updated report, final head/base and integration remain pending. This subsection does not supply a completed review receipt.

Original acquisition staging was `C:/Users/Chooo/Playground/ai7-material-admission/f08`; later Reviewer evidence was kept in `f08-review-1147` and Root-owned runs in `offline-context` under the same material-admission parent. All experiment text was synthetic. No protected manuscript, credential, provider request, product install or Electron Journey is part of this report. Evidence remains external; this candidate subsection is the only intended tracked change. Historical pins below identify observations at their stated checkpoint, not a promise that every temporary diagnostic remains available after the separately recorded finite cleanups.

### Exact acquisition and isolated closure — initial checkpoint

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

The initial CMS-only observations in the native table were later supplemented by the independent Reviewer: the offline Authenticode image digest matched the signed digest for all ten PE carriers, and signature-only checking was repeated for the five x64 files. Certificate trust, revocation and timestamp validity were still not checked. This additional evidence does not prove source-to-binary reproducibility, a complete applicable notice set, or byte equality with the original NuGet/DXC release binaries. The retained report also identifies host MSVC runtime prerequisites (`MSVCP140*` and `VCRUNTIME140*`, observed system version 14.51.36247.0); minimum supported versions and hosts without them remain unestablished.

Later official-source research sharpened the notice question without acquiring another binary. The exact E5 revision declares MIT; [publisher export discussion 12 and its file diff](https://huggingface.co/intfloat/multilingual-e5-small/discussions/12/files) link the selected quantized graph to its exact `dd476dd0…` SHA256 and 118,346,824-byte size. Microsoft's relevant [E5 project](https://github.com/microsoft/unilm/tree/master/e5) points to its MIT license. The examined texts did not expressly identify the complete copyright/permission/attribution carrier for both the exact graph and tokenizer. The discussion and moving upstream links are supporting provenance, not immutable generation or per-artifact notice attestations. The initial absence of a dedicated model notice carrier does not mean the publisher made no license declaration.

For the native files, pinned ORT `f2c39fe2…` and DXC `b4711839…` license/notice collections and the versioned DirectML 1.15.4 terms identify concrete publisher sources. They do not establish a complete per-carrier notice mapping for the retained, re-signed npm binaries. DXC's expressly build/test-only terms are not automatically runtime obligations. The remaining question is exact linkage/completeness for ORT runtime/binding, DirectML, and DXC/DXIL—not a blanket absence of licenses or an inferred need to download substitute binaries. Redistribution readiness remains held; no legal conclusion or new acquisition is claimed.

### Historical synthetic BM25 checkpoint

The following baseline and its “not run” E5 column are preserved as the initial acquisition-phase checkpoint. Later E5 results are reported separately; the old column is not the current execution status.

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

### Earlier native failures and grouped experiment

The first contained run, `21a06b0da2f347ab85620b2d2662b5f6`, positively exited 1 after 1,856 ms. CPU graph loading and one normalized 384-coordinate warmup succeeded; the diagnostic then failed to construct its exact boundary cases (`2 !== 0`). Its output-directory descriptor retained an absent-versus-present-null SACL representation difference after cleanup. A later d536 preparation was refused before copying/profile/process creation because integral byte counts were serialized with `.0`; corrected metadata was separately authorized. The actual `d53614941fec46dda01b0d975bf1d3d0` run then exited 3221226505 (signed −1073740791) after 13,470 ms with empty final result/capture. Its cause was not proved. These failures were not retroactively made successful by later runs.

The phase-traced `6b97eec2546644238bcafbaff4e17f53` run and checkpointed `1be2661c02c94d6ea9c90e8a7afe4dac` run each exited 134 at the forced-termination boundary (13,380 ms and 13,417 ms). Captures retain `FATAL ERROR: Error::Error napi_define_properties`; neither produced a complete final native result. The latter preserved a verified 171,937-byte prefix checkpoint (`40f6a9fc2abc3acff346cffbf757c62d6fe967ecb6ee0a029bd42ec6ed5211bc`). It was explicitly partial, with numerical failure and full completion false. The timing localizes the failure but does not prove whether termination met native execution, result conversion or error handling, or establish the underlying native cause.

R1A1 `b0278b381239402f8398bd6dbafc2d26` positively exited 0 after 13,649 ms and produced all 15 blocks, a 125,086-byte final record and 288 trace rows. Its exact workload recorded six Workers, eight load attempts/seven ready sessions, 101 run attempts/100 completions, three release cycles and one idle-Worker termination. The final native record said `completed-with-numerical-failures`. The original parent rejected b03 because its Decimal-to-Double conversion changed one retained number by one ulp; its original completion verdict remains false and immutable. A separately reviewed, data-only NUMFIX reanalysis of the same bytes established FullCompletion=true, numericalPass=false and lifecyclePass=true under the original owned-process/exit premises. It was not another model run and did not independently prove OS confinement.

**Grouped batch invariance remains failed.** Against the unchanged 1e-4 coordinate limit, heterogeneous companion/padding cases differed by 0.012186188250780106, 0.009706046432256699 and 0.012623734772205353. Same-role repeats, duplicated target rows and the tested row permutations had zero differences. Those controls do not separate companion content from padding length or prove a cause. The graph's per-tensor dynamic activation quantization is a mechanism hypothesis, not a causal finding. Successful idle termination later does not erase the two outstanding-run aborts or establish safe force-cancellation.

The accepted earlier report records int64 `input_ids`, `attention_mask`, `token_type_ids` and float32 `[batch, sequence, 384]` `last_hidden_state`, with attention-mask-weighted mean followed by one L2 normalization. It also records the separate hand-tensor controls and 95 R1A1 norm observations (maximum error 4.450728674498805e-9, fixed limit 1e-5). Static graph inspection found no external-data requirement. Earlier structural checks in both query/passage roles retained 511 → 511, 512 → 512 and 513 → 512 tokens, including role prefixes, specials and preserved EOS; lone-surrogate and 16,385-code-unit inputs were rejected without slicing UTF-16. These observations apply to the tested graph/configuration; the historical Phase 1 diagnostic hash `79e44c93…` was overwritten before that later audit and is not offered as a retained replayable hand-arithmetic proof.

### Later single-text S1 profile: actual A and B

S1 tested the same acquired model/package bytes using one text per native call. Logical pairs/quartets were scheduled as sequential singleton calls, not heterogeneous native batches. A used one Worker with two sequential sessions; B used a separate process/Worker/session. There were 275 physical calls in total (A 239, B 36), three releases and zero `Worker.terminate()` calls. This is a separately bounded profile, not a repair of the grouped numerical failure or a product batching/cancellation policy.

Root's A run `5f7bf69f16794c3ea0807628f0782c9b` began its recorded process preparation at 2026-10-25T22:12:10.8014737Z; PID 47076 positively exited 0 after 4,215 ms. Its parent verified ten ordered blocks plus final. B `10dbb77e936c4703993b572c14e73ade` began at 22:25:06.1318432Z; PID 16800 positively exited 0 after 1,766 ms, with three ordered blocks plus final. Both parent reports record ownedExitProved=true, completed=true, final fullCompletion=true, numericalPass=true and lifecyclePass=true, closed captures with EOF, no capture overflow, empty cleanup/residual lists and profile deletion HRESULT 0. These are retained run-time observations, not a fresh process/ACL query or final formal review.

Each S1 run copied and read-locked 672 admitted inputs and used the selected zero-capability AppContainer, Low integrity, child-process policy 1 and no loopback exemption. The process commit limit was 2 GiB, working-set limit separately sampled, outer deadline 610,000 ms and sample interval 100 ms. The child envelope retained 2,048 MiB usable / 1,536 MiB pressure / 512 MiB JS heap, 600,000 ms inner watchdog, 524,288-byte block, 1,048,576-byte final and 8,388,608-byte aggregate output limits. This was the selected OS/token contract: default AppContainer filesystem grants remain and the strict canary was failed/inconclusive. Neither the Node guard nor these run receipts establish whole-filesystem exclusivity or universal native-egress denial.

The actual preflight identified Windows 10.0.26200, AMD Ryzen 9 9950X3D, 32 logical processors, Node v24.18.1 win32/x64 (ABI 137/N-API 10), and the pinned archive/model closure. The copied Node executable SHA256 was `ac51903c4c111815d52280b1fdcc8da067cbb37e2fe1a765097b85c3292c8582`, distinct from the declared Node archive hash above. Requested execution was CPU/sequential with one intra-op and one inter-op thread; accepted options do not expose effective native thread counts. The Windows feature observations report AVX/AVX2/AVX512F, not VNNI/BW/VBMI or general non-AVX512 compatibility. Periodic module records still classify extended-length Windows ORT paths imperfectly and omit their loaded-module hashes; copy verification is separate from runtime module provenance. Sampling is not a complete load audit or evidence of egress.

A published 238 normalized rows and retained one canceled call's settlement separately; B published 36 rows. All 274 published norm checks passed, maximum error 4.450728674498805e-9; the canceled settlement also passed its norm check. A's 176 within-run comparisons had maximum coordinate difference 0, with stable rankings across logical-pair, logical-quartet, full-cache, partial-cache and fresh-session phases. The fixed norm 1e-5 and coordinate 1e-4 limits were not widened. This proves the measured finite singleton comparisons only, not arbitrary batching, every text or all hardware.

In A, queued cancellation executed zero native starts. Active cancellation was observed strictly inside its native interval (start 309531500.6377, cancel 309531500.7919, end 309531572.8346 on the controller's clock); native work settled, publication was suppressed, and the later queued job kept its own identity. Stop and post-close admission were refused; idle close released the session and the Worker exited 0 without a Worker error. B also closed and exited 0. This is cooperative settlement/publication suppression, not native preemption. A bounded completed case supplies no universal no-hang, force-cancel or leak-freedom guarantee.

A's 30 steady calls (five for each query/passage ×32/128/512-token family) had nearest-rank overall p50 10.434499979019165 ms, p95 71.49779999256134 ms and maximum 72.04299998283386 ms. In A, 82 controller heartbeats overlapped native work; 26 of 239 pings were observed during native work and 213 after, with none missing. B had seven overlapping heartbeats and 3 of 36 pings during native work/33 after. These observations distinguish controller progress from a hard response-time promise.

S1 controller timing observations are retained separately from native-call duration. The p50/p95/max values below cover each finite run; they do not establish service latency under arbitrary load.

| Run / controller observation | Count | p50 ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| A / heartbeat gap | 131 | 30.26340001821518 | 32.1560999751091 | 34.76190000772476 |
| A / control acknowledgement | 131 | 0.07510000467300415 | 0.18550002574920654 | 1.942900002002716 |
| B / heartbeat gap | 38 | 30.6913999915123 | 32.033900022506714 | 32.13510000705719 |
| B / control acknowledgement | 38 | 0.08660000562667847 | 0.1777999997138977 | 0.27480000257492065 |

Parent samples reported A peak working set/commit 994,004,992 /960,905,216 bytes and B 930,246,656 /904,183,808 bytes. No pressure was observed; induced pressure/OOM/watchdog failure was not exercised. Periodic process-wide readings include JS/native allocations and do not isolate native memory, rule out shorter peaks or prove a hard RSS ceiling. Worker heap limits do not cap native allocations. The one tested AMD host and installed MSVC runtime do not establish broader Windows x64/CPU portability.

### Retained-data comparison and diagnostic corrections

The unchanged pinned S1 comparator ran once on retained files, 2026-10-25T22:50:54.2219491Z–22:50:54.8412726Z (PID 43592, exit 0, empty stderr). It invoked no model or tokenizer. Its 16,826-byte report SHA256 is `1a863864d1fe8c806cb03c603020f781a40695d635ff1967b2b44f7d2e6f80e0`. B matched both A's warm baseline and fresh session across all 36 vectors with maximum coordinate difference 0; all 12 query orders and cosines matched in each comparison. The older b06 one-text rank/score observations also matched, but b06 retained no raw vectors, so no b06 coordinate equality is claimed.

| Frozen ten-answerable-query metric | Recall@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
| Actual BM25 baseline | 0.50 | 0.60 | 0.55 |
| Earlier grouped E5 (failed batch-invariance profile) | 0.70 | 1.00 | 0.85 |
| S1 baseline / fresh session / separate cold process | 0.80 | 1.00 | 0.90 |

The retained per-query E5 results below complement the historical BM25 table. S1 orders are identical in A baseline, A fresh session and B cold process; grouped values retain their failed batch-invariance status. Both use descending cosine, then the accepted candidate ID for ties.

| Case | Grouped E5 top 3 | First relevant rank | S1 E5 top 3 | First relevant rank |
| --- | --- | ---: | --- | ---: |
| Q01 | P01, P02, P13 | 1 | P01, P02, P13 | 1 |
| Q02 | P03, P14, P04 | 1 | P03, P14, P04 | 1 |
| Q03 | P05, P06, P07 | 1 | P05, P06, P07 | 1 |
| Q04 | P08, P07, P01 | 2 | P08, P07, P01 | 2 |
| Q05 | P09, P10, P23 | 1 | P09, P10, P23 | 1 |
| Q06 | P11, P12, P23 | 1 | P11, P12, P23 | 1 |
| Q07 | P14, P13, P22 | 2 | P13, P14, P22 | 1 |
| Q08 | P15, P16, P05 | 1 | P15, P16, P05 | 1 |
| Q09 | P18, P17, P14 | 2 | P18, P17, P14 | 2 |
| Q10 | P19, P20, P23 | 1 | P19, P20, P23 | 1 |
| Q11 | P21, P22, P02 | excluded | P21, P22, P02 | excluded |
| Q12 | P23, P24, P11 | excluded | P23, P11, P24 | excluded |

Q04 and Q09 remained rank 2 under S1; the negated distractor still outranked the relevant Q09 passage. Q11/Q12 are excluded from the answerable denominator and still receive high cosines; these are not calibrated confidence or no-answer decisions. Twelve predeclared synthetic questions cannot establish general editorial, memory or exemplar quality, and no RRF/product-consumer success is inferred.

The validation tools also have preserved failures. The first S1 pure-parent run had 57 cases, 10 passing/47 failing; 44 failures involved an internal aggregate serializer cap and three exposed exact Float32-coordinate decoding. A hash-only 61-case successor passed its four new hash controls but retained 38 numerical failures. Actual scalar probing and a separately reviewed exact-token numerical decoder then preceded two 64-case data-only successes, including validation against the exact native executable. These corrections changed diagnostic JSON/hash handling, not the acquired model, native graph, vector values or tolerances. Original failed receipts and decoder-specific hash oracles remain historical; a passing parser suite is not a native/model experiment or universal numerical theorem.

### Independently derived finite tokenizer comparison

A separately written, data-only derivation used the retained tokenizer/config bytes and compatible primary semantics at Hugging Face tokenizers `37372b67fac56fa5e2b7697d7d4c2966280ddbfd`, spm_precompiled `effe52a6d6f5d8312b1d096ab712cf4cc20b59b6`, and Unicode 13/UAX29 revision 37 for the closed 37-scalar input alphabet. It did not import the candidate tokenizer or use its token arrays as expected answers. Its 24 literal cases comprise 10 boundary cases and 14 Unicode cases across query/passage roles. Root's data-only derivation exited 0 at 23:18:57Z; the expected artifacts were frozen at 23:20:04.5688098Z before the separate retained comparison at 23:21:22.6839072Z.

All 24 retained role/text identity, full/bounded length, shape and capped feed-hash observations match the independently frozen expectations; all 14 retained complete short input-ID/attention-mask pairs also match. Feed hashes include input IDs, attention masks and token types. The comparison report is 26,254 bytes, SHA256 `be66fcbad7ac2489c25653d460c3268b31898b7493e3fdb12eb5eb154cdbc789`; [the bounded result is recorded separately](https://github.com/zhouy1017/ai7-harness/issues/1147#issuecomment-6404855562). No candidate/model/native rerun was used for this comparison.

An independent data audit, without candidate access, verified 37 charsmap traversals, the complete 250,002-row vocabulary, 93 scoring edges/48 endpoint certificates, all 24 input joins, 144 full/capped arrays and 48 feed hashes, finding no mismatch. It separately verified binary64 score additions and selected paths. The inputs exercised no actual equal-score tie, adjacent multi-unknown run or empty replacement; those branches retain source-review-only evidence. This is a compatible-reference finite derivation, not proof of the export's original generator/dependency versions or general Unicode equivalence.

Retained candidate evidence permits full-length comparison plus exact ≤512-token feed hashes, and complete short arrays where saved. It cannot recover discarded/overwritten IDs beyond 512 or prove candidate-internal normalization/unknown spans. The two supplementary Han characters U+20BB7 and U+20000 still become unknown IDs in both roles; agreement does not preserve their original text. Full independent original-generator parity, general-text preservation and semantic adequacy therefore remain held despite the finite observed matches.

### Current facet disposition

| Facet | Retained result and boundary |
| --- | --- |
| Acquired bytes, closed dependencies and notice inventories | Exact pins above; no product admission or source-to-binary equivalence inferred. |
| Graph/I/O and masked-mean/L2 | Observed on the retained CPU configuration; hand arithmetic is separate. |
| Heterogeneous native batching | Failed fixed coordinate tolerance; old failures remain. |
| Singleton consistency / separate-process comparison | Finite S1 within-run and 36+36 cross-process comparisons have zero coordinate difference. |
| Tokenizer oracle | 24 observed facets and 14 complete short pairs agree with a separately frozen compatible-reference derivation; discarded long IDs/original generator/general Unicode remain unproved. |
| Supplementary Han preservation | Loss remains: the two tested supplementary Han surfaces become unknown tokens. |
| Cooperative cancellation / idle release | Observed bounded S1 settlement and suppression; no native preemption or universal lifecycle guarantee. |
| Force termination with outstanding native work | Two fatal earlier runs remain failed/held. |
| Resources and responsiveness | Measured on one host; no induced pressure/OOM/watchdog result, hard RSS or leak-freedom proof. |
| Containment and module provenance | Selected OS/token observations only; strict canary failed/inconclusive, default grants and periodic module-classification gaps remain. |
| Notices and distribution | License declarations and publisher routes known; exact carrier completeness and redistribution readiness held. |
| Formal closure and product F08 | Final review/integration and remaining temporary-evidence disposition pending; no adapter, idle indexing, persistence, Settings/readiness, lexical fallback or semantic-consumer delivery claimed. |

### Historical diagnostic identities

These are the initial checkpoint identities. Deleted or overwritten diagnostics are not claimed replayable.

| Temporary diagnostic | SHA256 |
| --- | --- |
| `f08-acquire.ps1` | `b9018bdecc225f093364724521ed4bcd3a7009b78127c655c935dc467289a12a` |
| `f08-validate.mjs` | `79e44c93ba4cdb203ea934a06a70abc08efab5277909ee6ba98de3101ed27025` |
| `f08-synthetic-cases.json` | `5e02cc74509d96654f4089cefa4cbdb261725e9b0bb9de18d9e4694419bba546` |
| `f08-retrieval-entry.ts` | `06ab0d6675228f57095374ed70c71f69893a0e4fb6c5971359ec49aaf3e69249` |
| `f08-retrieval-entry.mjs` | `ae0e112d4eddebbe4ad45f74beb44a765b3a2c973350342e099565099faf50c5` |

### Commands, evidence custody and cleanup

The initial acquisition/BM25 commands were PowerShell `f08-acquire.ps1` (including corrected `-Resume` and `-SourceTexts -Resume`), Windows bsdtar listing/extraction with scripts disabled, the standalone validation diagnostic, the admitted esbuild bundle of the accepted d1c RetrievalIndex, and `node f08-retrieval-entry.mjs --bm25-only`. The identities above are historical, not a claim that deleted/overwritten scripts remain replayable.

Later native runs used the Root-owned reviewed Windows parent and copied Node with `--preserve-symlinks-main --preserve-symlinks`, exact controller/run/context arguments and pinned input/output limits. S1 used `f08-s1-controller.mjs --profile-run A` or `B --execute-offline`; its controller SHA256 is `ed86773270b2e309105c27b5470c55d3a13048606de7420a1304eaadf794cd69`, Worker `a340001cba5c600f434e78bed4bc676691bceb02c2b88c6b1c09523ba8760a12`, pure contract `bf38b2cd072ccc29d0002d3c803e145041b71def1c347e24e18c3c2f6363ec36`, and closed schema `79a6487ca86bb99fb9730cfc4b642aa2b58fb2e9b4e82d4f2429d787e27b71a5`. These are experiment tools, not product packages or a new CI gate. Data-only comparator and oracle executions are identified above; this document supplies no execution or repeat authority.

Two finite cleanup operations completed on 2026-10-25, without erasing their conclusions. The first ran at 16:52:30–16:52:31 UTC and removed 132 named temporary files (4,840,738 bytes) and 38 empty directories; an independent postcheck preserved 696 asset/provenance/review entries unchanged. This included reviewed primary temporary diagnostics, so they are no longer offered as replay inputs. The separate Root-owned duplicate cleanup ran at 17:21:33–17:22:05 UTC and removed 2,493 equal-copy leaves (3,040,345,812 logical bytes), retaining 1,050 files/758,573,354 bytes at that checkpoint; all b027 inputs and the excluded e0 tree remained unchanged. These counts describe those dated operations, not the current whole-root total after later S1 work. Later sources, binaries, reports and outputs have their own pending finite disposition; no permanent proof registry or completed overall cleanup is claimed.

OS descriptor cleanup remains distinct from file disposal. Later successful runs report exact queried owner/group/DACL+LABEL restoration and securing of newly created output files; audit ACEs were not queried, and newly created outputs had no earlier descriptor to restore. The earlier run21 output difference and seven e0 null-SACL representation differences remain recorded, not repaired or silently reclassified. Finite successful cleanup, a positive owned exit or lack of a new error does not establish universal filesystem isolation, fresh process absence or full audit-SACL equality.

The intended tracked replacement remains documentation only. Reconciliation with the exact assigned integration base is complete; the candidate handback records the applicable documentation checks at its final head. Final writer handoff, fresh cross-channel review of the complete updated account, integration and explicit remaining evidence disposition remain outstanding. Existing failures and missing facets must survive that handoff. This report neither completes Issue #1147's formal closure nor implements the broader F08 feature; no production/shipping permission, new native workload or new material acquisition is implied.
