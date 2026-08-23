# A2 exact Codex artifact evidence

Status: **Commander-verified read-only evidence; stable `0.149.0` App Server x64 package selected as the exact X2 subject; version-bound support mapping and artifact probes remain open; candidate writing and A3 remain stopped**

Recorded: **2026-08-23**

Evidence retrieved through: **2026-08-23T03:16:24Z**

This record admits the result of the bounded [exact-artifact discovery](./A2-EXACT-ARTIFACT-DISCOVERY-DISPATCH.md) into the Commander control line. It does not select a dependency, download or execute an artifact, generate a schema, edit or rescore the A2 candidate, prove Harness Capability Closure or a Codex Capability Gap, enter A3, reopen DeepSeek, choose a maintenance form, or authorize implementation.

## Dispatch and verification boundary

- Task: `/root/a2_exact_artifact_t2`, Repository Development Worker / T2, read-only.
- Requested binding: Claude Code / `claude-sonnet-5` / medium.
- Actual binding: GPT-5.6 Terra / high, same-class fallback. The already-recorded post-reset Claude session returned API HTTP 429 before inference at `$0`, and no later reset evidence existed when this task was dispatched.
- The Worker changed no repository or temporary project file and performed no install, package download, extraction, execution, schema generation, model call, candidate edit, re-score, A3 action, DeepSeek inspection, maintenance-form choice, or external write.
- Independent review of the Worker's returned unit: not applicable because it authored no repository branch or artifact; the Commander performed factual verification only. The separate Commander synthesis commit remains subject to independent T3-par Standards and Spec review.
- The Commander independently re-ran the bounded metadata checks. The control worktree remained clean at `2b1963833725e8589831f4367dc1bc06c6ef4d2a`; the candidate remained clean at review-passed head `f1d212c5ebc5287dbc2b97a716de14b8195e2c3c`.

## Official source set

Only these source classes support this record:

1. current [OpenAI App Server documentation](https://developers.openai.com/codex/app-server/), which currently resolves to the canonical App Server page on `learn.chatgpt.com`;
2. immutable tag, release, Actions, asset, commit, path, and blob metadata from the official [`openai/codex`](https://github.com/openai/codex) repository; and
3. official npm registry metadata and npm attestations for exact `@openai/codex` versions.

Search snippets, third-party articles, mirrors, moving repository files, the local `codex-cli 0.147.0`, and research commit `44e95c857f37f81a5731eab72c32a3d334d0e2c4` are not artifact identities.

The reproducible metadata queries were `npm view @openai/codex@<exact-version> ... --json`, HTTP GET of `https://registry.npmjs.org/-/npm/v1/attestations/@openai%2fcodex@<exact-version>`, and read-only `gh api` GETs for `repos/openai/codex/{git/ref/tags,git/tags,releases/tags,actions/runs,contents}`. The npm SLSA statements name `.github/workflows/rust-release.yml`, `refs/tags/<exact-tag>`, the official repository, the peeled Git commit, and the exact Actions invocation.

## Two coherent published candidates

“Newest published” and “latest stable” are different facts. Both candidates below have an official annotated tag, a peeled source commit, a GitHub release, Windows x64 and arm64 distributions, exact registry integrity, and npm SLSA provenance tying the wrapper and platform variants to the corresponding tag and commit.

| Field | Stable candidate | Newest published prerelease |
| --- | --- | --- |
| npm wrapper | `@openai/codex@0.149.0` | `@openai/codex@0.150.0-alpha.7` |
| npm SRI | `sha512-i4dryj2Y1j+00Mb5n+0n71EYnTK9/KDc2cdFo/dXD0d1oTog2bhUssKDEIOnKmnEf51P0Z/HJTWvTKw/UHyOvQ==` | `sha512-H/fb75EFVrdMNUyfmm6J0Rkitc81ANKMztwainBTWEYCMKoTZ7PV3EZo7nk3p7DzC6M6YwNyLB/lWcdaibyIVA==` |
| Annotated tag object | `a4e15bf371341b067c8278d3b70b1a8c7b3d793e` | `69b81b46830757c3a7adbfc500ca39503e586ba6` |
| Peeled source commit | [`758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`](https://github.com/openai/codex/commit/758ef40f50c1a458425c7cfbf1eb12cbc07af0b0) | [`03eec0241d14dd11a8e4d1e2c4ced5eb6c607ffc`](https://github.com/openai/codex/commit/03eec0241d14dd11a8e4d1e2c4ced5eb6c607ffc) |
| Official release | [`rust-v0.149.0`](https://github.com/openai/codex/releases/tag/rust-v0.149.0), stable, published 2026-08-20 | [`rust-v0.150.0-alpha.7`](https://github.com/openai/codex/releases/tag/rust-v0.150.0-alpha.7), prerelease, published 2026-08-22 |
| Provenance run | [`32412579159`](https://github.com/openai/codex/actions/runs/32412579159); `release` and `publish-npm` jobs passed. The overall run failed only in the unrelated `Update latest-alpha-cli branch` job. | [`32597413327`](https://github.com/openai/codex/actions/runs/32597413327); overall run, `release`, and `publish-npm` passed. |
| Windows alias lock | Exact aliases to `0.149.0-win32-x64` and `0.149.0-win32-arm64` | Exact aliases to `0.150.0-alpha.7-win32-x64` and `0.150.0-alpha.7-win32-arm64` |

The stable Windows npm variants have these SRI values:

- x64: `sha512-qKbwSOOO/fdhQ5MlXE2fts6taPxRPZ/zqeC+eqHD72hLRymV9rFCUbUxOCquognUPRPvS/2/kRCV0UVhoDd3yQ==`;
- arm64: `sha512-pUd8MzuwtqT5DhM1NUE1gETWIZ9fkDA1XB7tt9YNIi/peUgLuziQgZd7o0bNON4cNzgbil1YUN1qDTgQm0g3pg==`.

The prerelease Windows npm variants have these SRI values:

- x64: `sha512-2i2gO85KK1YAwmRB/78201bpPDEjD0kkCDx/e8XY6LTNii2/LzoxSic8CQKw0IfxHrR9Y61ceArgZY3qlZgENQ==`;
- arm64: `sha512-cUwUgHtqVRo+sYth5lRIFomsOYywe7uFB68GQ62Piu+tOX4QyegM25a2wH8pUpP3M2zQ9oXbUMR68T7C54wG3A==`.

## App Server release assets

Each release publishes standalone Windows App Server executables and package archives separately from the npm CLI wrapper. These are the more direct X2 sidecar candidates for AI7; the npm package remains relevant as a separately published acquisition and provenance path.

| Release | Asset | Official SHA-256 |
| --- | --- | --- |
| `0.149.0` | `codex-app-server-x86_64-pc-windows-msvc.exe` | `d181a381eece22dd21f98a06006c03289fe1a705012b9ca8fb3596dc0d90ea61` |
| `0.149.0` | `codex-app-server-aarch64-pc-windows-msvc.exe` | `d4ad0ce6723df5eece7af21031f5bd07466c4c97246f4ad122b12e63b7716491` |
| `0.149.0` | `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz` | `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28` |
| `0.149.0` | `codex-app-server-package-aarch64-pc-windows-msvc.tar.gz` | `ae146c9b72ad3081d3d4ea61234c2e74bfc69a50b48534310982c07629db25b1` |
| `0.150.0-alpha.7` | `codex-app-server-x86_64-pc-windows-msvc.exe` | `d4b36594ad43c4e457b884559562e7a121e7498998d1e2fb0592506a3cc6cda5` |
| `0.150.0-alpha.7` | `codex-app-server-aarch64-pc-windows-msvc.exe` | `39fdbf73d9bd709800c3fede6264cadd8061bce405795834926df27b43d19c5b` |
| `0.150.0-alpha.7` | `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz` | `4425560c7f7fb06dc297990a2164f7244657900649d8ec28dd91858efcc0501a` |
| `0.150.0-alpha.7` | `codex-app-server-package-aarch64-pc-windows-msvc.tar.gz` | `3f78530e3fabbd14e86ad4b13c8722ddc88a61c29cbcb2368d413c43c3e73bdd` |

Exact source dispatches the CLI `app-server` subcommand, and the release workflow builds a distinct `app-server` bundle. This proves presence and provenance without treating the TypeScript SDK or `codex exec` JSON stream as the App Server integration surface.

## Protocol, license, and support identity

- The official App Server documentation defines version-bound generators: `codex app-server generate-ts --out DIR` and `codex app-server generate-json-schema --out DIR`; stable-surface output is the default and `--experimental` adds experimental APIs.
- The Git release inventory publishes `config-schema.json`, not an App Server protocol-schema release asset. The exact source commits do contain generated App Server schema objects: stable aggregate JSON blobs `6802d163...` and `9a40484e...`; prerelease aggregate JSON blobs `188c15b6...` and `a77cf152...`. A later artifact probe must still prove that the chosen downloaded binary reproduces the intended stable schema and record the output digest.
- Both exact commits carry root Apache-2.0 [`LICENSE`](https://github.com/openai/codex/blob/758ef40f50c1a458425c7cfbf1eb12cbc07af0b0/LICENSE), blob `4606e72e...`, and [`NOTICE`](https://github.com/openai/codex/blob/758ef40f50c1a458425c7cfbf1eb12cbc07af0b0/NOTICE), blob `2805899d...`. npm metadata reports Apache-2.0 but does not supply NOTICE contents; release inventory exposes no standalone LICENSE or NOTICE asset. AI7 must therefore verify archive contents and carry the exact notice material separately when required.
- Current official documentation says the **App Server command and WebSocket transport** are experimental and unsupported for production workloads; stdio JSONL is the default transport. The exact stable and prerelease source README snapshots explicitly call WebSocket experimental/unsupported but do not bind the moving page's broader command-level warning to either release. Owner U2 accepts that broader current classification as a bounded risk; it remains a factual Experimental status, not Proven maturity.

## Commander determination

Artifact discovery result: **identified with exact missing links**.

Two coherent artifacts exist, so “no obtainable artifact” is false. The exact source snapshots do not bind the current documentation's broader command-level production warning to either release; that version-bound support mapping remains an explicit missing official link. U2 conservatively applies the broader warning to the selected artifact as a risk-control assumption, not as evidence that OpenAI published that classification for `0.149.0`. The support row therefore remains truthful rather than becoming Proven.

Under the Commander's recorded `DQ-A2-02` authority, select the stable [`rust-v0.149.0`](https://github.com/openai/codex/releases/tag/rust-v0.149.0) App Server release and its x64 package archive `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`, official SHA-256 `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28`, as the exact X2 closure subject. Its source identity is commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`. The matching standalone x64 executable and its digest remain a cross-check input. The arm64 package is an identified same-version sibling, not an added product-architecture promise.

The prerelease is not selected because no load-bearing AI7 requirement currently needs an alpha-only capability, no support-classification difference triggers owner escalation, and adding prerelease risk would contradict the narrow U2 risk posture. If later exact evidence proves an alpha-only requirement, that becomes a new explicit upgrade decision rather than a silent X2 change.

The smallest safe next action is a separately authorized, temporary-directory, no-model/no-provider probe against only the selected x64 package and matching standalone executable. It must verify official digests, archive inventory, Authenticode where present, `--version`/`--help`, stable schema generation and fingerprints, clean stdio startup/initialization/termination, absence of unapproved network or model activity, and LICENSE/NOTICE packaging. That probe may produce evidence only; candidate re-score requires another Commander brief.

## Clarification disposition

- No owner question remains in this artifact-selection branch. The candidate decision queue assigns `DQ-A2-02` to the Commander and defines no escalation trigger that the evidence satisfies.
- Binary behavior, schema identity, packaging contents, and compatibility are factual probes, not owner questions.
- The missing version-bound support mapping stays explicit; U2 is a conservative risk decision, not substitute vendor evidence.
- Maintenance form remains deferred unless a named load-bearing gap survives those probes; DeepSeek remains behind its two-condition re-entry gate.
