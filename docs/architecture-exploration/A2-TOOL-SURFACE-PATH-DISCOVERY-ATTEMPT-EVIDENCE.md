# A2 exact Codex tool-surface path-discovery attempt evidence

Status: **attempt stopped fail-closed; retrieval identities passed, but the provisional extractor result is invalid and admits no path, edge, hash, capability, or candidate conclusion; a new exact reviewed retry brief is required before another request**

This is Commander-preserved repository-development evidence. It is not canonical product architecture, a successful discovery result, source-semantic evidence, a capability disposition, a Codex Capability Gap, or implementation authority.

## Authority and assignment

- Reviewed plan: `e5e21c90643366b6a81f9f13841d705ee263f9f4:docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-DISPATCH.md`, Git blob `e255b8450d85e70aeb35f902de242189d453be7a`, 36,475 bytes.
- Worker / class: `/root/a2_tool_path_discovery_t2`, Worker / T2, read-only.
- Requested binding: Claude Code / `claude-sonnet-5` / medium.
- Actual binding: GPT-5.6 Terra / high, same-class fallback.
- Exact downgrade reason: real Claude session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` returned API HTTP 429 before inference at `$0`; no later availability evidence existed. Task class and authority did not change.
- Returned-unit independent review: N/A. The Worker wrote no repository unit; this Commander evidence and any retry brief require fresh T3-par Standards and Spec review.

Before and after the attempt, the control worktree was exact and clean at `e5e21c90643366b6a81f9f13841d705ee263f9f4`, and the candidate worktree was exact and clean at `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`. Candidate content was not read.

## Exact retrieval observations

The Worker reported these bounded observations before the invalid result was detected:

| Item | Observation |
| --- | --- |
| Commit request | `https://api.github.com/repos/openai/codex/git/commits/758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`; HTTP 200; final host `api.github.com`; `2026-08-23T10:33:47.443Z` |
| Returned commit | `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0` |
| Root tree | `0f7a27df60e01dccf918f3203235266a0d6e3258` |
| Recursive-tree request | `https://api.github.com/repos/openai/codex/git/trees/0f7a27df60e01dccf918f3203235266a0d6e3258?recursive=1`; HTTP 200; final host `api.github.com`; `2026-08-23T10:33:48.035Z` |
| Tree body | 1,866,548 decompressed bytes; SHA-256 `9e593437c804cc41992bd33fe0f1986d52bb4f5506032f87aeb6e1094b9e3cce`; 7,260 entries; `truncated: false` |
| Tree retention | 46 distinct original/fixed identities retained; 7,214 unrelated entries discarded |
| Raw requests | Exactly 45 authorized exact-commit `raw.githubusercontent.com` GETs; all HTTP 200 with official final host |
| Original manifest | 43/43 metadata identities matched; 42 Rust lexical inputs plus one metadata-only README; 1,665,858 aggregate bytes |
| Fixed leads | 3/3 identities matched; 119,096 aggregate bytes |
| Newly resolved source reads | 0 |

The fixed-lead content was used only for zero-snippet lexical extraction and was not admitted as semantic evidence. The Worker discarded the verified raw bytes after the two executions and retained no Codex source copy.

## Fail-closed result

The Worker froze an in-memory JavaScript extractor under Node.js `v24.15.0` and ran its provisional five-manifest pipeline twice. The two provisional runs were byte-identical. A post-run conformance audit then found that the implementation applied `INLINE-MODULE` before the dispatch's ordered `EDGE-RESOLUTIONS` precedence. For an observed external-root edge in `codex-rs/app-server/src/in_process.rs`, the reviewed order required the earlier `CARGO-MAPPING-REQUIRED` code.

That is an extractor-implementation defect, not a defect in the reviewed precedence and not an observation about Codex capability. Therefore:

- the provisional extractor source, Base64, manifests, component hashes, envelope hash, edge rows, and path rows are invalid and are not recorded or admitted;
- the attempt supplies no valid novel-path count, frozen-set recommendation, unresolved-edge result, absence result, re-score input, `BLK-A2-03` closure, or gap evidence;
- the 45-request source ceiling for this attempt is exhausted;
- no retry, forty-sixth raw request, or reuse of discarded bytes occurred; and
- another attempt requires a separately committed and independently reviewed exact retry brief.

## Nonclaims and final state

The attempt performed no new-source-content read, candidate read beyond HEAD/status, candidate write, semantic trace, runtime or downloaded-binary execution, model call, MCP operation, schema generation, re-score, gap inference, A3 work, DeepSeek inspection, maintenance-form selection, implementation, repository write, or external write.

Immediately before the Worker returned, control remained exact and clean at `e5e21c90643366b6a81f9f13841d705ee263f9f4`; candidate remained exact and clean at `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`. No task temporary directory was retained.
