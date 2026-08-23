# A2 selected Codex artifact static-probe evidence

Status: **Commander probe failed closed during the first archive-header pass; evidence unit awaiting independent review; no binary executed, no candidate changed, and no rerun is authorized**

Recorded: **2026-08-23**

This record preserves the exact result of the first real execution of the review-clean [A2 selected Codex artifact static Commander probe](./A2-ARTIFACT-PROBE-DISPATCH.md). Its label is **probe failed**. That label applies only to this bounded static attempt: it is not a Codex Capability Gap, a statement that the official artifact is unsafe, a candidate score, Harness Capability Closure, dynamic-probe readiness, A3 authority, DeepSeek runtime admission, a maintenance-form decision, or implementation authorization.

## Authority and immutable inputs

- Repository role / action owner: **Commander**. Worker routing was not applicable because the operation performed an external GET, which Repository Development Dispatch reserves to the Commander.
- Reviewed plan object: control head `63053510ba89af89b7b4d19f4b2a6210440669af`, path `docs/architecture-exploration/A2-ARTIFACT-PROBE-DISPATCH.md`, blob `1eca7e1396c0f846e229637bb056d2527528b606`, 15,236 bytes.
- Execution authorization: control head `ebfcba5ddbc102a5d8b99a5230a2f33900246343`.
- Frozen A2 candidate: `docs/4-v2-architecture-candidate@f1d212c5ebc5287dbc2b97a716de14b8195e2c3c`.
- Selected subject: `openai/codex` stable tag `rust-v0.149.0`, annotated tag object `a4e15bf371341b067c8278d3b70b1a8c7b3d793e`, source commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`, asset `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`.
- Requested official URL: `https://github.com/openai/codex/releases/download/rust-v0.149.0/codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`. The GET followed GitHub's normal redirect to `release-assets.githubusercontent.com`; the expiring signed query is deliberately not retained.

Two command-delivery attempts preceded the real probe and performed no probe action. The first failed while constructing the tool input, before PowerShell existed. The second overlong inline command was rejected before PowerShell started. A preflight after both reported control head `ebfcba5...`, candidate head `f1d212c5...`, both trees clean, and zero `ai7-codex-a2-probe-*` temporary directories. The real probe then ran once in one interactive PowerShell process using the same static scope.

## Exact execution result

- Start: `2026-08-23T04:43:58.4927389Z`.
- End: `2026-08-23T04:44:32.8967881Z`.
- Result label: **probe failed**.
- Stop phase: P2, first in-process `System.Formats.Tar.TarReader` header pass, before extraction.
- Exact failure: `Rejected empty, dot, or dot-dot tar segment in 'bin/'`.
- Failure mechanism: the header passed the permitted-entry-type check, then the reviewed validator normalized separators, split the effective name on `/`, and rejected the empty segment produced by the terminal separator. The report did not retain the accepted header's exact one-of-three permitted type, so this record does not silently reconstruct it.
- No archive entry was extracted. No archive inventory, entrypoint hash comparison, Authenticode result, signer identity, packaged legal-file comparison, or source-to-package legal comparison was produced after the stop.

### P1 facts established before the stop

| Fact | Expected | Observed | Result |
| --- | --- | --- | --- |
| HTTP status | successful official GET | `200` after the official redirect | matched |
| Asset size | `116042307` bytes | `116042307` bytes | matched |
| Asset SHA-256 | `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28` | same | matched |
| Release tag | `rust-v0.149.0` | same | matched |
| GitHub release ID | immutable official metadata | `374028976` | recorded |
| GitHub asset ID | immutable official metadata | `522789117` | recorded |
| Annotated tag object | `a4e15bf371341b067c8278d3b70b1a8c7b3d793e` | same | matched |
| Peeled source commit | `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0` | same | matched |

These facts prove the acquired bytes matched the selected official release identity. They do not prove archive safety, executable identity, signature trust, packaging completeness, runtime behavior, or any A2 capability row.

## Explicitly unperformed or unknown

The fail-closed P2 stop means every later observation is explicitly **not tested** or **unknown**; absence of an observation is not a pass:

- The complete archive header inventory, second validation pass, extraction, reparse/escape scan, sorted file manifest, entrypoint/helper inventory, and entrypoint/helper SHA-256 values were not produced. Archive safety beyond the accepted-type `bin/` header is unknown.
- Authenticode verification, cache-only non-revocation trust result, embedded signer subject/issuer/thumbprint, timestamp presence, OS/trust-store/cache context, and internal signer consistency were not tested. Revocation was not checked and remains unconditionally untested/unknown.
- Packaged LICENSE, NOTICE, SBOM, detached-signature, protocol-schema, and third-party-attribution presence or absence is unknown. No packaged legal or schema object was compared with the exact source objects, and no packaging-completeness claim is made.
- The downloaded `0.149.0` App Server's `--version` and `--help` behavior was not tested. Earlier observations from the separately recorded local `codex-cli 0.147.0` are not evidence about this artifact.
- Stable schema generation, deterministic double-generation, schema fingerprints, and binary/schema equivalence were not tested.
- JSON-RPC `initialize` then `initialized`, App Server startup/termination, process-tree behavior, filesystem behavior, socket behavior, and outbound-network behavior were not tested.
- Account/login, thread/turn, model/provider, tool, MCP, plugin/marketplace, feedback, remote-control, and any user/project-data transmission behavior was not tested.

## Safety and cleanup attestation

- The probe created one fresh task-specific child beneath the resolved Windows temporary root and changed the process-local `TEMP`/`TMP` values only for the operation. It restored both values before cleanup.
- The cleanup target was re-resolved, required to remain a separator-bounded child of the resolved temporary root, and required to retain the exact `ai7-codex-a2-probe-` leaf prefix.
- Cleanup validation passed and the one task directory was recursively removed. A separate post-probe check found zero matching task directories.
- The control branch remained exactly `ebfcba5ddbc102a5d8b99a5230a2f33900246343` and clean. The candidate remained exactly `f1d212c5ebc5287dbc2b97a716de14b8195e2c3c` and clean.
- No downloaded executable, archive helper, package manager, installer, launcher, CLI, App Server entrypoint, schema generator, model/provider/account operation, or tool/MCP operation ran.
- No repository file changed during the probe. This evidence file and its coordination updates are later Commander integration, not probe writes.

## Bounded interpretation

The failure is a validator/subject-shape collision, not evidence that the selected package contains a link, special entry, unsafe absolute path, collision, reparse point, digest mismatch, or invalid executable. The current plan says to reject every empty segment, while the admitted header name contains a terminal separator. The safe semantics are therefore unresolved at this exact evidence point.

The Commander's preliminary correction candidate is intentionally non-authorizing: for an entry whose `TarReader` type is exactly `Directory`, remove exactly one terminal `/` as structural directory notation before segment validation; still reject an empty result, every leading separator, repeated terminal separator, internal empty segment, dot/dot-dot segment, and all existing collision, prefix, reparse, escape, type, and size failures. Regular-file names receive no such normalization. Independent review must decide whether that rule is faithful and safe. It must be written into a new exact plan object and independently reviewed before another GET or probe execution.

## Stop boundary

1. Independently review this evidence unit against the exact execution facts and authority boundary.
2. Do not rerun the probe from `63053510...`; it has produced its fail-closed result.
3. Do not edit or re-score the A2 candidate, authorize a dynamic probe, enter A3, reopen DeepSeek runtime comparison, choose adapter/patch/fork maintenance form, or begin implementation.
4. A later static retry requires a separate Commander plan correction, exact commit, and independent Standards and Spec pass. Its result remains capped at **probe partial** even if the full static sequence succeeds.
