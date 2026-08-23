# A2 selected Codex artifact corrected static-retry evidence

Status: **Commander retry completed as `probe partial`; evidence integration preserves one malformed retained hash field plus an unadmitted forensic reconciliation and awaits exact-head Standards and Spec re-review; no downloaded binary executed, no candidate changed, and no later action is authorized**

Recorded: **2026-08-23**

This record preserves the exact result of the one fresh retry authorized against the independently review-clean [A2 selected Codex artifact static Commander probe](./A2-ARTIFACT-PROBE-DISPATCH.md). Its label is **probe partial**, the highest label available to this static plan because revocation and every dynamic behavior remain untested. The label is not a Proven capability, Harness Capability Closure, a Verified Codex Capability Gap, production-support evidence, dependency acceptance, legal-compliance acceptance, dynamic-probe readiness, A3 authority, DeepSeek runtime admission, a maintenance-form decision, or implementation authorization.

## Authority and immutable inputs

- Repository role / action owner: **Commander**. Worker routing was not applicable to the probe because it performed an external GET, which Repository Development Dispatch reserves to the Commander.
- Reviewed corrected plan object: control head `711f676b98c69dda2f541b9de3f2096eb45c16f7`, path `docs/architecture-exploration/A2-ARTIFACT-PROBE-DISPATCH.md`, blob `011c6bbf215cd42e8feabfd4bf93a910b1a70df4`, 16,511 bytes.
- Retry authorization: control head `01774b54490bc723879ed165c49d5f48f7cc53d5`.
- Review-clean first-attempt evidence remains immutable at control head `0e4fe4657ca4d2f2154178ce59d982aef2c37b12`, path `docs/architecture-exploration/A2-STATIC-ARTIFACT-PROBE-EVIDENCE.md`, blob `66d0a09b36c392254c8e93a4e1e21e205380742d`, 8,789 bytes.
- Frozen A2 candidate: `docs/4-v2-architecture-candidate@f1d212c5ebc5287dbc2b97a716de14b8195e2c3c`.
- Selected subject: `openai/codex` stable tag `rust-v0.149.0`, annotated tag object `a4e15bf371341b067c8278d3b70b1a8c7b3d793e`, source commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`, asset `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`.
- Requested official URL: `https://github.com/openai/codex/releases/download/rust-v0.149.0/codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`. The GET followed GitHub's normal redirect to `release-assets.githubusercontent.com`; the expiring signed query is deliberately not retained.

Preflight found the authorization head and candidate exact and clean, and found zero `ai7-codex-a2-probe-*` temporary directories. The retry acquired new bytes into a new task directory; it did not reuse or reconstruct the first attempt's bytes or unretained header type.

## Exact execution result

- Report schema: `2`; attempt: `2`.
- Start: `2026-08-23T05:07:35.0636521Z`.
- End: `2026-08-23T05:08:20.9246981Z`.
- Result label: **probe partial**.
- Failure: none.
- Repository write during the probe: `false`.
- Downloaded-binary execution: `false`.

### P1 — package and official identity

| Fact | Expected | Observed | Result |
| --- | --- | --- | --- |
| HTTP status | successful official GET | `200` after the official redirect | matched |
| Response content length | `116042307` bytes | `116042307` bytes | matched |
| Downloaded size | `116042307` bytes | `116042307` bytes | matched |
| Asset SHA-256 | `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28` | same | matched |
| Release tag | `rust-v0.149.0` | same | matched |
| GitHub release ID | immutable official metadata | `374028976` | recorded |
| Release publication time | immutable official metadata | `2026-08-20T21:04:55Z` | recorded |
| GitHub asset ID | immutable official metadata | `522789117` | recorded |
| Asset update time | immutable official metadata | `2026-08-20T21:04:22Z` | recorded |
| Annotated tag object | `a4e15bf371341b067c8278d3b70b1a8c7b3d793e` | same | matched |
| Peeled source commit | `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0` | same | matched |

These facts establish that the newly acquired bytes matched the selected official release identity. They do not by themselves establish archive safety, executable trust, packaging completeness, runtime behavior, or any A2 capability row.

### P2 — two-pass archive safety and inventory

Both in-process `System.Formats.Tar.TarReader` passes completed. The first validated every header before extraction. The second revalidated and matched each raw name, exact type, canonical path, declared size, and ordinal before writing each regular file with `FileMode.CreateNew`.

| Check | Observation |
| --- | --- |
| Safety result | two-pass validation and extraction succeeded |
| Header count | `9` |
| Exact permitted types | `3` `Directory`; `6` `RegularFile`; no other type |
| Directory paths | `bin`; `codex-path`; `codex-resources` |
| Directory terminal separators normalized | `3`, only after exact `Directory` type capture |
| Link or special entries | `0` |
| Unsafe or colliding paths | `0` |
| Reparse points | `0` |
| Extraction escapes | `0` |
| Declared and actual regular-file bytes | `335316397` |
| Safety ceilings | 10,000 entries; 1 GiB one file; 2 GiB declared total; none reached |
| Probe-reported manifest serialization | UTF-8; LF; sorted `path<TAB>size<TAB>sha256<LF>` |
| Raw probe-reported manifest SHA-256 | `e8676fb4daa693e21a97d681f5c945c464795b04ca4db9aff0003dc4ee066fc6` |
| Post-probe reconstruction from the six retained display fields | `7af3ab526a2755743aaffefaa9e6a75309822d2cc720b87db20b4d1661276a0e`; input includes one malformed 65-character field |
| Forensic candidate reconciliation | removing one of the adjacent duplicated `8` characters yields 64-character candidate `861c65efa4f6021352df256aa18b9c1d49feaef201e229c8e8667815dc37a515`, which reproduces raw aggregate `e8676fb4...`; inference only, not admitted as the file digest |
| Per-file hash disposition | five retained fields are 64-character SHA-256 values; `codex-package.json` is invalid-length and its digest is unusable/unknown |
| Aggregate fingerprint disposition | unusable as evidence because the candidate reconciliation is not a retained observation and exact serialized bytes are gone |

The temporary operation retained six path/type/size rows and their displayed hash fields in its in-memory report but did not retain the exact serialized manifest bytes after cleanup. Five fields have the required 64 hexadecimal characters. The retained `codex-package.json` field is `861c65efa4f6021352df256aa18b9c1d49feaef201e229c8e86678815dc37a515`, which is 65 hexadecimal characters and therefore cannot be a SHA-256 value. Its digest is **invalid as retained, unusable, and unknown**; the path, type, and 237-byte size remain captured.

Independent review serialized the six displayed fields under the probe-declared UTF-8/no-BOM, LF, sorted `path<TAB>size<TAB>sha256<LF>` rule, including the final LF, and obtained `7af3ab526a2755743aaffefaa9e6a75309822d2cc720b87db20b4d1661276a0e`, not raw aggregate `e8676fb4daa693e21a97d681f5c945c464795b04ca4db9aff0003dc4ee066fc6`. Removing one of the adjacent duplicated `8` characters from the malformed field produces 64-character candidate `861c65efa4f6021352df256aa18b9c1d49feaef201e229c8e8667815dc37a515`; substituting that candidate reproduces raw aggregate `e8676fb4...` exactly. This strongly suggests a display/transcription duplication, but the original report object and serialized bytes are no longer available to confirm it. The candidate is therefore **forensic inference only**, not the admitted `codex-package.json` digest. No aggregate fingerprint or complete six-file hash result is admitted, and no artifact-invalidity or capability-gap inference follows.

Captured complete regular-file row set:

| Relative path | Tar type | Bytes | Retained hash field | Disposition |
| --- | --- | ---: | --- | --- |
| `bin/codex-app-server.exe` | `RegularFile` | 241640752 | `d181a381eece22dd21f98a06006c03289fe1a705012b9ca8fb3596dc0d90ea61` | usable 64-character SHA-256; matches selected standalone digest |
| `bin/codex-code-mode-host.exe` | `RegularFile` | 65882416 | `3c6726ab12b8de7c0bccecf4551af686d9dbe1b9fcdaee90bd66f60837943ac2` | usable 64-character SHA-256 |
| `codex-package.json` | `RegularFile` | 237 | `861c65efa4f6021352df256aa18b9c1d49feaef201e229c8e86678815dc37a515` | invalid 65-character field; digest unusable/unknown |
| `codex-path/rg.exe` | `RegularFile` | 4218880 | `14231169855ec5205cf5a1b6f1db358ff4aed4247c86b69ce8aae647c77f6680` | usable 64-character SHA-256 |
| `codex-resources/codex-command-runner.exe` | `RegularFile` | 8158512 | `8fdae9f1e7ab322b976ce9cf1acd6c19504193a0dcdb9f0429e2f7ec20c128d4` | usable 64-character SHA-256 |
| `codex-resources/codex-windows-sandbox-setup.exe` | `RegularFile` | 15415600 | `17c9d3e69ca54a9ddcc6b7cbba6922b1310455f66b9d9f88706f80d1553ab2e2` | usable 64-character SHA-256 |

The contained `codex-app-server.exe` digest exactly matched the separately published standalone executable digest named by the reviewed plan.

### P3 — static executable identity and cache-only trust observations

- Verification machine caption `Microsoft Windows 11 专业版`, version `10.0.26200`, build `26200`, reported architecture `64 位`.
- Every trust call ran in-process with UI disabled, cache-only URL retrieval, revocation checking disabled, and paired `WTD_STATEACTION_VERIFY` / `WTD_STATEACTION_CLOSE`.
- Trust context: the current Windows machine trust store/cache. Results are machine- and cache-specific. Revocation was not checked and is unconditionally **untested/unknown**.
- Timestamp presence was `unknown` for every executable because the bounded local inspection did not establish it.

| Executable | Verify / close | Static classification | Verification UTC |
| --- | --- | --- | --- |
| `bin/codex-app-server.exe` | `0x00000000` / `0x00000000` | cache-only non-revocation trust succeeded; revocation untested | `2026-08-23T05:08:19.2737206Z` |
| `bin/codex-code-mode-host.exe` | `0x00000000` / `0x00000000` | cache-only non-revocation trust succeeded; revocation untested | `2026-08-23T05:08:19.4853658Z` |
| `codex-path/rg.exe` | `0x800B0100` / `0x00000000` | unknown: no locally readable embedded signature | `2026-08-23T05:08:19.5439842Z` |
| `codex-resources/codex-command-runner.exe` | `0x00000000` / `0x00000000` | cache-only non-revocation trust succeeded; revocation untested | `2026-08-23T05:08:19.5600140Z` |
| `codex-resources/codex-windows-sandbox-setup.exe` | `0x00000000` / `0x00000000` | cache-only non-revocation trust succeeded; revocation untested | `2026-08-23T05:08:19.5702165Z` |

The four executables with locally readable embedded certificates reported one internally consistent signer:

- Subject: `CN="OpenAI OpCo, LLC", O="OpenAI OpCo, LLC", L=San Francisco, S=California, C=US`.
- Issuer: `CN=Microsoft ID Verified CS AOC CA 03, O=Microsoft Corporation, C=US`.
- Thumbprint: `621DBDC56D1E7EE1F68380AD3F8CD188BEE06A89`.

For `rg.exe`, local certificate extraction recorded `System.Management.Automation.MethodInvocationException: Exception calling "CreateFromSignedFile" with "1" argument(s): "找不到申请的对象。"`, and WinVerifyTrust returned `0x800B0100`. The plan named no official signer expectation for this helper, so the record preserves its trust status as **unknown**, not a hard artifact-invalidity finding or a signature pass; it does not attribute the result to missing cached chain material.

### P4 — package and legal inventory

The complete archive inventory contained `codex-package.json` and no file classified by the reviewed plan as LICENSE, NOTICE, SBOM, detached signature, protocol schema, or third-party attribution.

| Object class | Packaged observation |
| --- | --- |
| `codex-package.json` | present at `codex-package.json` |
| LICENSE | absent from the complete inventory |
| NOTICE | absent from the complete inventory |
| SBOM | absent from the complete inventory |
| Detached signature | absent from the complete inventory |
| Protocol schema | absent from the complete inventory |
| Third-party attribution | absent from the complete inventory |

The probe separately re-fetched and matched the selected source commit's exact legal objects:

| Source object | Git blob | SHA-256 |
| --- | --- | --- |
| `LICENSE` | `4606e72e042564097e8780d66c1d4dcb611869bd` | `d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc` |
| `NOTICE` | `2805899d56d0332d175cfc613c67d45d6f006db7` | `9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915` |

There was no packaged legal object to compare byte-for-byte. The observed package absence is not converted into a legal conclusion, a permission, or an inference that source-tree legal material was packaged; later dependency and distribution acceptance must supply its own notices/obligations decision.

## Safety and cleanup attestation

- The retry created one fresh `ai7-codex-a2-probe-*` task-specific child beneath the resolved Windows temporary root. It was not a workspace, repository, user-profile root, home directory, or unresolved environment path. The probe changed process-local `TEMP` / `TMP` only for the operation and restored both values before cleanup.
- The task path was validated before use. Before cleanup it was re-resolved, required to remain a separator-bounded child of the resolved temporary root, and required to retain the exact `ai7-codex-a2-probe-` leaf prefix.
- Cleanup validation and removal succeeded. A separate post-probe check found zero matching task directories.
- Immediately after the probe, the control branch remained exactly `01774b54490bc723879ed165c49d5f48f7cc53d5` and clean. The candidate remained exactly `f1d212c5ebc5287dbc2b97a716de14b8195e2c3c` and clean.
- No downloaded executable, archive helper, package manager, installer, launcher, CLI, App Server entrypoint, schema generator, model/provider/account operation, or tool/MCP operation ran.
- No repository file changed during the probe. This evidence file and its coordination updates are later Commander integration, not probe writes.

## Explicit limitations and unperformed work

- Revocation checking was deliberately disabled and remains unconditionally untested/unknown. Non-revocation trust results are machine- and cache-specific; timestamp presence is unknown.
- The downloaded `0.149.0` App Server's `--version` and `--help` behavior was not tested. Earlier observations from the separately recorded local `codex-cli 0.147.0` are not evidence about this artifact.
- Stable TypeScript/JSON-schema generation, deterministic double-generation, output fingerprints, and binary/schema equivalence were not tested. The matching `0.149.0` CLI archive remained future-only and was neither acquired nor executed.
- JSON-RPC `initialize` then `initialized`, App Server startup/termination, process-tree behavior, filesystem behavior, socket behavior, and outbound-network behavior were not tested.
- Account/login, thread/turn, model/provider, tool, MCP, plugin/marketplace, feedback, remote-control, and any user/project-data transmission behavior was not tested.
- No product dependency was installed or accepted. No protocol/client was generated. No capability matrix row was re-scored.
- The per-file-hash plan result is incomplete: five retained file hashes are usable, while the retained `codex-package.json` hash field is invalid-length and its reconciled candidate remains inference only. The aggregate manifest fingerprint is unusable.

## Bounded interpretation and stop boundary

This attempt establishes that newly acquired bytes matched the selected official release; the reviewed two-pass rules safely inventoried and extracted this exact archive; all six path/type/size rows and five usable file hashes were captured, while the `codex-package.json` digest and aggregate manifest fingerprint remain unusable; the contained App Server entrypoint matched its standalone digest; four contained executables produced one consistent cache-only non-revocation signer observation; `rg.exe` had no locally readable embedded signature; and the captured complete inventory lacked the named legal, SBOM, detached-signature, schema, and attribution files. These are static artifact facts only.

1. Independently review this evidence unit against the exact corrected plan, captured report, and authority boundary.
2. Keep the A2 candidate frozen and do not re-score it until the Commander separately decides, after review, whether this exact evidence supports a bounded candidate-writing brief.
3. Do not execute a downloaded binary or authorize a dynamic probe without a new exact plan and independent review satisfying every deferred containment prerequisite.
4. Do not enter A3, reopen DeepSeek runtime comparison, choose adapter/upstream/patch/fork maintenance form, begin implementation, or treat `probe partial` as production acceptance.
