# A2 exact Codex tool-surface path-discovery retry dispatch

Status: **prepared after one fail-closed implementation attempt; blocked until the exact control commit containing this brief and its evidence passes independent Standards and Spec review; no retry, semantic source trace, candidate write, re-score, runtime, A3, DeepSeek comparison, maintenance-form choice, or implementation is authorized yet**

This is a repository-development retry brief. It is not canonical product architecture, a successful discovery result, a capability disposition, a Codex Capability Gap, or implementation authority.

## Purpose

The first read-only attempt exhausted its exact request budget and invalidated its provisional result after detecting an extractor precedence defect. It produced no admitted path, edge, manifest, or hash. This brief authorizes at most one wholly fresh attempt only after exact-head review. It changes no discovery method, source scope, candidate row, capability conclusion, or later-phase gate.

The retry must execute the review-clean protocol in [the original path-discovery dispatch](./A2-TOOL-SURFACE-PATH-DISCOVERY-DISPATCH.md) exactly. This document adds only three safeguards:

1. reacquire every allowed official byte; reuse no prior response, source byte, provisional result, or inferred correction;
2. freeze and pass the exact synthetic conformance suite below before the first network request, and rerun it unchanged after the official pipeline; and
3. treat any conformance, identity, request, manifest, or final-state failure as a failed retry with no discovery result.

## Exact authorities

Read only these exact objects:

1. Review-clean protocol: `e5e21c90643366b6a81f9f13841d705ee263f9f4:docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-DISPATCH.md`, Git blob `e255b8450d85e70aeb35f902de242189d453be7a`, 36,475 bytes.
2. Fail-closed first-attempt evidence in the exact retry-authorization commit: `docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-ATTEMPT-EVIDENCE.md`, required Git blob `925e5ebc985ee51cc0a455fd7b2e8fcfe63ec735`, 4,964 bytes.
3. The original protocol's exact admitted repository objects and immutable official `openai/codex@758ef40f50c1a458425c7cfbf1eb12cbc07af0b0` metadata/source inputs. No new authority is added.
4. Candidate identity `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93` for HEAD/clean-state verification only. Do not read candidate content.

Current-head `AGENTS.md` and `PROGRESS.md` supply operating rules/status only. Do not use another task transcript, moving documentation, local Codex installation, other tag/branch, code search, package, archive, schema, runtime, model, MCP, or third-party source.

## Exact assignment and start gate

- Task: `AI7 V2 A2 — retry exact Codex tool-surface path discovery and freeze`.
- Role / class: Worker / T2, read-only. Commander synthesis and this retry unit have a T3-par Standards and Spec review floor.
- Requested binding: Claude Code / `claude-sonnet-5` / medium.
- Actual binding rule: the recorded real Claude session returned API HTTP 429 before inference at `$0`, with no later availability evidence. Use same-class GPT-5.6 Terra / high fallback and record exact task identity/reason. This changes no task class or authority.
- Control worktree: exact review-clean commit containing this brief, read-only during the retry.
- Candidate worktree: verify only exact clean HEAD `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`.
- Write boundary: none. Do not create a repository or temporary file, branch, commit, issue, pull request, or external record.

The Worker may start only after both review axes pass the exact commit containing this brief and evidence. Verify exact control/candidate heads and clean states before freezing the extractor or making a request. A mismatch stops before all network activity.

## Frozen extractor and conformance suite

Before the first network request:

1. implement the complete original protocol, including all five canonical manifests and the complete-result envelope;
2. canonicalize and freeze the complete extractor-plus-test-harness source as UTF-8/no-BOM/LF/exactly-one-final-LF bytes, byte size, SHA-256, and single-line standard Base64;
3. prohibit source modification after that freeze; and
4. run the following exact vectors twice in the same process and require byte-identical actual results equal to the literal expectations.

Synthetic vectors are not Codex evidence and never enter the discovery manifests or counts. In each source string, `\n` denotes one LF byte; offsets are zero-based over the UTF-8 bytes of that exact string, while lines are one-based. The synthetic tree index is empty for every vector. All paths and tree candidates are in-memory fixtures; no filesystem or network access is permitted.

| ID | Synthetic input | Required result |
| --- | --- | --- |
| `V-01` | path `codex-rs/app-server/src/in_process.rs`; `mod inner { use serde::Prompt; }\n` | declaration 0 / leaf 0 / line 1 / anchor offset 23; one eligible `LINK-REQUEST` edge for `serde::Prompt`; class `UNRESOLVED`; code `CARGO-MAPPING-REQUIRED`, never `INLINE-MODULE` |
| `V-02` | same path; `mod inner { use ::serde::Prompt; }\n` | declaration 0 / leaf 0 / line 1 / offset 25; one eligible edge for `::serde::Prompt`; class `UNRESOLVED`; code `UNSUPPORTED-ROOT` |
| `V-03` | same path; `mod inner { use crate::Prompt; }\n` | declaration 0 / leaf 0 / line 1 / offset 23; one eligible edge for `crate::Prompt`; class `UNRESOLVED`; code `INLINE-MODULE`, which precedes tree-candidate checks |
| `V-04` | invalid path `outside.rs`; `use serde::Prompt;\n` | declaration 0 / leaf 0 / line 1 / offset 11; one eligible edge for `serde::Prompt`; class `UNRESOLVED`; code `CARGO-MAPPING-REQUIRED`, which precedes input-shape checking |
| `V-05` | invalid path `outside.rs`; `use crate::Prompt;\n` | declaration 0 / leaf 0 / line 1 / offset 11; one eligible edge; class `UNRESOLVED`; code `UNSUPPORTED-INPUT-SHAPE` |
| `V-06` | path `codex-rs/core/src/lib.rs`; `use super::Prompt;\n` | declaration 0 / leaf 0 / line 1 / offset 11; one eligible edge; class `UNRESOLVED`; code `ROOT-UNDERFLOW` |
| `V-07` | path `codex-rs/core/src/tools/mod.rs`; `use crate::Prompt::{Foo, *};\n` | declaration 0; leaf 0 produces one eligible edge for `crate::Prompt::Foo`, class `UNRESOLVED`, code `NO-TREE-CANDIDATE`; leaf 1 produces one no-edge `GLOB`; both use line 1 / raw anchor offset 11 |
| `V-08` | path `codex-rs/core/src/tools/mod.rs`; `use crate::Prompt;\nuse self::Prompt;\nuse super::Prompt;\n` | three eligible leaf-0 edges at declaration ordinals 0/1/2, lines 1/2/3, offsets 11/29/48; each is class `UNRESOLVED` / `NO-TREE-CANDIDATE`; roots are admitted keyword tokens, not raw identifiers |
| `V-09` | path `codex-rs/core/src/tools/mod.rs`; `use crate::r#Prompt;\n` | no eligible edge; one declaration-0 / leaf-0 no-edge `RAW-IDENTIFIER`; anchor `Prompt`, line 1, offset 13 |
| `V-10` | path `codex-rs/core/src/tools/mod.rs`; `use crate::Prompt::{;\n` | one declaration-0 no-edge `UNSUPPORTED-USE-TREE`; anchor `Prompt`, line 1, offset 11, leaf ordinal `<NONE>` |

The harness must compare structured fields, canonical rows, counts, and applicable resolution precedence—not only a boolean or hash. A failure, exception, unexpected extra/missing row, source/digest drift, or difference between the two synthetic runs stops before network. After the two official executions and before returning a result, rerun the same vectors twice with the same frozen source and require the same literal results; a failure invalidates the official result.

## One fresh official attempt

Only after the preflight suite passes, execute every retrieval, verification, extraction, resolution, classification, serialization, hashing, ceiling, report, and cleanup rule from the original reviewed protocol unchanged.

The new attempt receives exactly its own original ceilings:

- one exact commit-object GET;
- one exact recursive-tree metadata GET;
- at most 45 exact raw-source GETs for the same 42 reviewed Rust sources plus three fixed leads;
- zero newly resolved source-content GETs;
- the original 999,999-edge, 24-path/21-novel-path, and 2,000,000-byte ceilings; and
- zero other network, code-search, clone, archive, package, binary, schema, runtime, model, MCP, documentation, repository-write, external-write, or new-authority actions.

All official bytes must be newly obtained after preflight. The prior tree body, raw blobs, provisional extractor, source Base64, manifests, hashes, and inferred results are forbidden inputs. Matching immutable identities may be reported as a fresh observation but never treated as proof that a request was unnecessary.

If any original global stop or ceiling fires, or the post-run synthetic suite fails, emit no novel-path manifest or expanded frozen-set recommendation. Do not repair the extractor, repeat a request, choose a subset, reuse a response, or start another attempt.

## Required report

Return the original ten report sections, with these additions:

1. bind the start attestation to the exact retry-authorization head and evidence blob above;
2. add a **Conformance record** inside the Extractor declaration: exact vector IDs, two preflight and two post-run results, literal expected-versus-actual field comparison, frozen source bytes/size/SHA-256/Base64, and confirmation that source/digest never changed;
3. state that every official byte was freshly reacquired and no prior byte/result was reused;
4. distinguish a valid empty/no-novel result from any stopped/invalid result; and
5. retain `returned-unit independent review N/A`, exact requested/actual binding and fallback, and final control/candidate clean attestations.

The report and any Commander evidence synthesis authorize no candidate disposition, source-semantic claim, candidate write, re-score, `BLK-A2-03` closure, gap inference, runtime or downloaded-binary execution, A3, DeepSeek inspection, maintenance selection, implementation planning, or implementation. A valid report must be committed as Commander evidence and pass fresh T3-par Standards and Spec review before a separate semantic trace brief may be prepared.

## Stop boundary

This retry is unauthorized until the exact commit containing this brief and first-attempt evidence passes both review axes. A clean review authorizes exactly one read-only attempt. Nothing later follows automatically.
