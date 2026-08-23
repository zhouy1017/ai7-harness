# A2 selected Codex artifact static Commander probe

Status: **amended after review-clean first-attempt evidence; static retry not authorized until this exact correction passes independent review; all selected binaries remain unexecuted; candidate writing and A3 remain stopped**

Recorded: **2026-08-23**

This is a Commander-owned repository-development evidence plan for the exact X2 subject. It authorizes official read-only GETs and temporary local writes only. It authorizes no binary execution, outbound data transmission, product dependency, candidate edit, matrix re-score, Closure or Gap claim, A3, DeepSeek runtime work, maintenance-form choice, implementation, or external write. The probe may begin only after the Commander records a clean independent re-review of this plan.

## Role and authority

- Repository role / action owner: **Commander**, bounded official download plus static local artifact-integrity evidence.
- Worker dispatch is not permitted for this operation because it performs an external GET; Repository Development Dispatch reserves external actions to the Commander. The Claude-first Worker rule is therefore not applicable and no provider fallback or quota event is recorded for the probe.
- Independent Reviewer role: review this plan before acquisition and review the resulting Commander evidence unit before any dynamic-probe, candidate-writing, or re-score brief exists. A Reviewer does not download, extract, execute, or edit the unit under review.
- Repository write boundary during the probe: **none**. Do not edit, stage, commit, or create a file in any repository or project worktree. The Commander may integrate the resulting evidence only after the temporary operation has ended and its facts have been independently checked.
- Temporary write boundary: one newly created, task-specific directory beneath the resolved Windows temporary directory. It must not be a workspace, repository, user profile root, home directory, or unresolved environment-variable path.

## Exact admitted control objects

Read these immutable objects with `git show <commit>:<path>`:

1. Selected-artifact evidence:
   - `4704043d68da67f74d19dc2f2e3c798d5bd12dc2:docs/architecture-exploration/A2-EXACT-ARTIFACT-EVIDENCE.md`
   - blob `f934efbf48573a9404440c6b4eaf13461d4e8144`, 11902 bytes.
2. Commander closure-subject decision:
   - `4704043d68da67f74d19dc2f2e3c798d5bd12dc2:docs/architecture-exploration/A2-CLOSURE-SUBJECT-DECISION.md`
   - blob `7630529e3536fc1bc58e5c9ec4e4acffd22faeb6`, 4378 bytes.
3. Owner U2 risk decision:
   - `4704043d68da67f74d19dc2f2e3c798d5bd12dc2:docs/architecture-exploration/clarifications/0003-accept-bounded-unsupported-codex-risk.md`
   - blob `921983e817668b1a51f4799c4942e265ba4280a5`, 5661 bytes.
4. Review-clean first-attempt evidence:
   - `0e4fe4657ca4d2f2154178ce59d982aef2c37b12:docs/architecture-exploration/A2-STATIC-ARTIFACT-PROBE-EVIDENCE.md`
   - blob `66d0a09b36c392254c8e93a4e1e21e205380742d`, 8789 bytes.

The first real execution matched P1 identity and stopped in the first P2 header pass on `bin/`; the report did not retain that accepted header's exact permitted type. This corrected plan does not reconstruct the type or reuse the downloaded bytes. It authorizes no retry until the Commander records a clean independent review of the exact correction head.

Do not read a task transcript or active candidate worktree. Candidate head `f1d212c5ebc5287dbc2b97a716de14b8195e2c3c` remains read-only and is not an input to this local artifact probe.

## Exact selected input

- Release: [`openai/codex` `rust-v0.149.0`](https://github.com/openai/codex/releases/tag/rust-v0.149.0).
- Source commit: `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`.
- Package asset: `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`.
- Exact URL: `https://github.com/openai/codex/releases/download/rust-v0.149.0/codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`.
- Expected byte size from official release metadata: `116042307`.
- Expected package SHA-256: `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28`.
- Matching standalone executable release digest for a contained-entrypoint cross-check: `d181a381eece22dd21f98a06006c03289fe1a705012b9ca8fb3596dc0d90ea61` for `codex-app-server-x86_64-pc-windows-msvc.exe`.
- Exact source schema evidence: aggregate JSON blobs `6802d1635345501032a4010552fda8372ec9396a` and `9a40484e126746a92592e2c658171e81be720785`.
- Exact source legal evidence: `LICENSE` blob `4606e72e042564097e8780d66c1d4dcb611869bd`; `NOTICE` blob `2805899d56d0332d175cfc613c67d45d6f006db7`.

Official release metadata and exact-commit source-object GETs are allowed for re-verification. Do not substitute npm, a newer release, the local `codex-cli 0.147.0`, research commit `44e95c...`, moving `main`, or any alpha artifact.

Independent review established that this App Server package cannot generate protocol schemas: at source commit `758ef40f...`, standalone parser `codex-rs/app-server/src/main.rs`, blob `4d5ab3f122bf836faf8729d39e946da0065ec466`, has no generator subcommands, while CLI parser `codex-rs/cli/src/main.rs`, blob `45218a6d394d6f4d77b73e1344a48af2b5ab647c`, owns `GenerateTs` and `GenerateJsonSchema`. Official release metadata identifies `codex-x86_64-pc-windows-msvc.exe.tar.gz`, size `99939600`, SHA-256 `a9493cfb26886c364bfb95a095a821ab3c4afeaaca35e43609e26fd49ce937fd`, containing a CLI executable whose standalone release SHA-256 is `14b7e6b2356e82d1d9275579eaa588757b4e0a501b65dcc19fccdf77bd83dc00`. Those are future dynamic-probe inputs only: this static probe does not download or execute them and does not add the CLI to X2 or the product runtime. The exact CLI source labels the generator commands experimental even though official documentation describes default output as the stable protocol surface; a later plan must preserve both facts.

## Safety setup

1. Create a fresh directory whose leaf starts `ai7-codex-a2-probe-` beneath `[System.IO.Path]::GetTempPath()`. Resolve it to an absolute path and record the path class, not any unrelated directory contents.
2. Before cleanup, re-resolve the path, require that it remains below the resolved temporary root and retains the exact task prefix, and remove only that directory with `Remove-Item -LiteralPath ... -Recurse -Force`.
3. Keep all downloaded and extracted files inside that directory. Never write beneath the workspace, an inherited `HOME` or `CODEX_HOME`, the user profile root, repository metadata, or a broad path.
4. Stream each official GET directly into a new file with a five-minute overall timeout and bounded buffers. Do not invoke a downloaded file. If a request outlives one tool yield, continue through the returned session rather than issuing a second download.
5. Use only in-process .NET hashing, gzip/tar reading, file APIs, and cache-only Windows signature inspection. Do not call `Get-AuthenticodeSignature`, an archive executable, package manager, installer, launcher, CLI, App Server entrypoint, helper, or any other downloaded executable. For trust verification, call `WinVerifyTrust` in-process with no UI, `WTD_REVOKE_NONE`, `WTD_CACHE_ONLY_URL_RETRIEVAL`, `WTD_REVOCATION_CHECK_NONE`, and paired `WTD_STATEACTION_VERIFY`/`WTD_STATEACTION_CLOSE`; the [Microsoft `WINTRUST_DATA` contract](https://learn.microsoft.com/en-us/windows/win32/api/wintrust/ns-wintrust-wintrust_data) makes the cache-only flag mandatory to prevent network retrieval. These flags intentionally disable revocation checking: revocation status is always untested/unknown in this probe and can never support a passed signature verdict.
6. Never run login, account, thread start/resume, turn start, schema generation, tool calls, MCP calls, provider/model discovery, feedback upload, remote control, marketplace/plugin operations, or any command that could send user/project data or invoke a model.

## Ordered probe

Stop at the first fail-closed condition and return the evidence collected so far.

### P1 — download and identity

1. GET only the exact selected package URL into the temporary directory.
2. Record actual byte size and SHA-256.
3. If size or digest differs from the expected official values, do not list, extract, or execute the archive.
4. Re-query official release metadata and confirm the asset name, size, digest, tag, and source-tag commit still match. A redirect is allowed only when the final bytes satisfy the exact digest.

### P2 — two-pass safe archive inventory and extraction

1. Read gzip and tar in-process with `System.IO.Compression.GZipStream` and `System.Formats.Tar.TarReader`; do not pass the archive to `tar.exe`, Explorer, or another extractor.
2. Complete a first header pass without extraction. Permit only `Directory`, `RegularFile`, and `V7RegularFile`. Reject every symlink, hardlink, device, FIFO, sparse, PAX header entry, or other type, and reject any non-empty link target or link metadata.
3. Record the raw effective entry name and exact `TarReader` entry type before path validation, including in any failure report. Normalize `\` to `/`. Only when the exact type is `Directory`, allow either no terminal separator or remove **exactly one** terminal `/` as structural directory notation; after removal, reject an empty name or a name still ending in `/`, so a root marker or repeated terminal separator cannot pass. Never remove a terminal separator from `RegularFile` or `V7RegularFile`, so it remains an empty-segment failure. Then reject an absolute, UNC, NT-device, or drive-qualified path; alternate data stream/colon; control character; leading, internal, or remaining terminal empty segment; `.` or `..` segment; Windows reserved device name; trailing dot/space; case-insensitive duplicate; or file/directory prefix collision. Resolve the canonical separator-free destination with `Path.GetFullPath` and require an ordinal-ignore-case, separator-bounded prefix beneath the fresh extraction root.
4. Fail closed above 10,000 entries, 1 GiB for one declared regular file, or 2 GiB declared total uncompressed size. These are safety ceilings, not expected package facts.
5. Only after the whole first pass succeeds, reopen the archive and repeat the same validation while extracting each regular file with `FileMode.CreateNew`. Compare each second-pass raw name, exact entry type, canonical path, declared size, and ordinal position with the first-pass record before writing. Create only validated directories, never follow a link, refuse an existing or reparse-point component, and verify actual count and byte totals against the first pass before inspecting content.
6. After extraction, fail if any descendant has the `ReparsePoint` attribute or resolves outside the extraction root. Return a sorted inventory of relative path, type, byte size, and SHA-256 for every regular file.
7. Identify `codex-package.json`, the App Server entrypoint, helper executables, and any LICENSE, NOTICE, SBOM, signature, schema, or third-party attribution file. Absence is evidence, not permission to source it elsewhere.

### P3 — executable identity and signature

1. Compute SHA-256 for the contained `codex-app-server.exe`. Compare it with the official matching standalone executable digest above.
2. Apply the cache-only `WinVerifyTrust` call above to every contained executable and record its exact result code. Extract embedded signer-certificate subject, issuer, and thumbprint in-process without chain download; record timestamp presence only when local signature data exposes it, otherwise `unknown`. Record OS build, UTC verification time, trust-store context, cache-only operation, and **revocation not checked**. Cached chain state can still make the non-revocation trust result machine-specific.
3. Record the signer exactly; do not invent an expected signer subject that official release metadata does not state. A bad digest, malformed/cryptographically invalid signature, surprising/internally inconsistent signer identity, or prior archive failure makes the static probe fail. Failure to establish non-revocation trust solely because required chain material is absent from the local cache makes that trust result `unknown`; it is not evidence that the artifact is invalid. Because revocation is unconditionally untested, the overall static result is at most **probe partial** even when every other check succeeds. No downloaded executable runs regardless of the result.

### P4 — packaging and legal comparison

1. Compare any packaged LICENSE, NOTICE, SBOM, signature, schema, or third-party attribution file with the exact source/release objects where an official identity exists.
2. Record absence separately from mismatch. Do not infer that source-tree legal material was packaged when the archive does not contain it.
3. Record the final archive and extracted-file inventory fingerprints without retaining the artifact.

## Deferred dynamic boundary

This static plan deliberately stops before all binary execution. `--version`, `--help`, stable schema generation, binary/schema equivalence, JSON-RPC initialization, process-tree behavior, filesystem behavior, and socket behavior remain unperformed and unresolved.

A later dynamic plan requires another exact Commander commit and independent review. It must name and integrity-check the exact matching `0.149.0` CLI solely as a schema generator; prove two default-stable generations byte-for-byte equal using a declared UTF-8/LF, forward-slash, sorted `path<TAB>sha256<LF>` manifest serialization; and use the mandatory `initialize` then `initialized` JSONL sequence. Before either CLI or App Server runs, it must establish a temporary working directory, an explicit minimal environment allowlist, disabled discovery of inherited config/plugins/credentials, filesystem isolation with a disposable restricted principal or equivalent sandbox, and outbound deny active before launch with blocked-attempt logging. Socket polling alone is insufficient. If no already-authorized mechanism can prove those controls without a new system-level mutation, dynamic execution stops and remains a separately recorded missing link.

## Exact stop conditions

Stop without continuing when any of these occurs:

- package size or SHA-256 mismatch;
- any archive link/special type, unsafe/colliding path, reparse point, extraction escape, or safety-ceiling breach;
- App Server entrypoint digest mismatch, malformed/cryptographically invalid Authenticode signature, or surprising/internally inconsistent signer identity; a cache-only non-revocation trust result that is unknown solely because local chain material is absent is recorded as partial rather than invalid;
- any request to execute a downloaded binary, generate a schema, initialize App Server, authenticate, read an inherited Codex home, or perform a model/provider/tool call;
- timeout, unbounded read/write, or cleanup target validation failure; or
- any requested step would cross the repository, candidate, external-write, credential, DeepSeek, A3, maintenance, or implementation boundary.

## Exit report

Return one report containing:

- Commander role, exact start/end timestamps, explanation that Worker routing was inapplicable, and confirmation of no repository write or downloaded-binary execution during the probe;
- temporary-directory validation and cleanup result;
- package URL, release/tag/commit identity, expected/actual size and SHA-256;
- archive safety result and complete file inventory summary;
- entrypoint/helper hashes, cache-only Authenticode result codes, signer metadata, OS/time/trust-cache context, the unconditional `revocation not checked` limitation, and the resulting partial ceiling;
- exact statement that version/help/schema generation, binary/schema equivalence, initialization, process-tree behavior, and socket behavior were not tested;
- LICENSE/NOTICE/SBOM/attribution presence or absence;
- every limitation and unperformed step; and
- one result label: **probe partial** or **probe failed**. **Probe passed** is unavailable because revocation and every dynamic behavior remain untested.

These labels describe only this bounded static artifact probe. None means Proven capability, Harness Capability Closure, a Verified Codex Capability Gap, production support, dependency acceptance, dynamic-probe readiness, A3 readiness, or implementation authority.

Stop after the report. The Commander alone may admit the evidence, decide whether a candidate-writing/re-score brief exists, or authorize any later action.
