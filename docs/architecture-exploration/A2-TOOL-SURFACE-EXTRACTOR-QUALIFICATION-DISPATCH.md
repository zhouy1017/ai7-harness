# A2 tool-surface extractor offline-qualification dispatch

Status: **superseded by the owner's minimal-validation decision and ADR 0027; no qualification, retry, official request, source trace, or proof task will run**

This historical brief records an abandoned evidence-tool direction. It is not active authority, product implementation, canonical architecture, official Codex evidence, a capability disposition, or a blocker for V2 design.

## Purpose and phase split

The reviewed discovery protocol is stable, but two one-shot Workers failed because their in-memory extractor implementation was not qualified: the first violated resolution precedence after official retrieval; the second had a JavaScript syntax error before retrieval. Identical execution cannot validate a wrong program, and an official request budget is the wrong place to debug that program.

This task is **Phase A only**: develop and qualify one exact extractor/test-harness source against synthetic literals, entirely offline and in memory. It may iterate within the ceilings below. It makes zero official Codex requests and produces no Codex or candidate evidence.

A `QUALIFIED` result still authorizes no official request. The Commander must first persist the exact source/Base64/digest and qualification results, obtain fresh T3-par Standards and Spec review, and prepare a separate Phase-B immutable-source execution brief. Phase B may execute the reviewed bytes as-is but may not modify or requalify them.

## Exact authorities

Read only these exact objects:

1. Normative discovery protocol: `e5e21c90643366b6a81f9f13841d705ee263f9f4:docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-DISPATCH.md`, Git blob `e255b8450d85e70aeb35f902de242189d453be7a`, 36,475 bytes.
2. Review-clean vector/oracle definitions: `3a3540020f80be5090af9e8602104ba0fd796c6f:docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-RETRY-DISPATCH.md`, Git blob `8326c12a1972a77e96f76f562edfa96a8d687e91`, 10,432 bytes, limited to `V-01`–`V-10`, canonical-source rules, and phase/nonclaim boundaries. It grants no retry.
3. Fail-closed retry-attempt evidence in the exact qualification-authorization commit: `docs/architecture-exploration/A2-TOOL-SURFACE-PATH-DISCOVERY-RETRY-ATTEMPT-EVIDENCE.md`, required Git blob `42f0df88e5c290a576ac9f6b0fbbdca1801145d0`, 4,219 bytes.
4. Candidate identity `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93` for HEAD/clean-state verification only. Do not read candidate content.

Current-head `AGENTS.md` and `PROGRESS.md` provide repository operating rules/status only. Do not read another task transcript, Codex source, current/moving documentation, GitHub metadata, local Codex installation, package, archive, schema, or third-party source.

## Assignment and start gate

- Task: `AI7 V2 A2 — qualify deterministic tool-path extractor offline`.
- Role / class: Worker / T2, read-only. Commander qualification evidence receives independent T3-par Standards and Spec review.
- Requested binding: Claude Code / `claude-sonnet-5` / medium.
- Actual binding rule: the recorded real Claude session returned API HTTP 429 before inference at `$0`, with no later availability evidence. Use same-class GPT-5.6 Terra / high fallback and record exact task identity/reason. This changes no task class or authority.
- Control worktree: exact review-clean commit containing this brief, read-only during the task.
- Candidate worktree: verify only exact clean HEAD `8eb70e315ea4a4103c1820fe9fd0bdeae49f5f93`.
- Write boundary: none. All candidate source revisions, fixtures, executions, and outputs exist only in process memory and the returned coordination report. Do not create/edit a repository or temporary file, branch, commit, issue, pull request, or external record.

The Worker may start only after both review axes pass the exact commit containing this brief and evidence. Verify the exact control/candidate heads, clean states, and three object identities before constructing revision 1. A mismatch stops the task.

## Closed synthetic environment

- Runtime is exactly the already observed local Node.js `v24.15.0`; a different or unavailable version stops the task.
- One **source revision** includes the qualification runner, extractor, test harness, fixtures, and literal oracle in the same canonical byte sequence and source identity. The Worker may invoke exactly `node.exe --input-type=commonjs -` at most once per revision, supplying that complete source through standard input and receiving only one structured qualification result through standard output. `NODE_OPTIONS` and `NODE_PATH` must be absent from that child environment. No command-line source, environment-variable source, file-backed loader, or temporary file is allowed.
- That source may load exactly `node:vm`, `node:crypto`, and `node:buffer`. Its runner compiles the embedded extractor-plus-harness program once with `new vm.Script(embeddedSource, { filename: 'ai7-a2-tool-path-extractor.js' })`, then runs the two required executions in fresh contexts in the same process. Do not call `node --check` or load another module.
- Neither the runner nor the embedded program may start another process, access an environment variable, filesystem, network, clock, randomness, locale, or mutable external state. The fresh contexts expose only the exact deterministic hashing and byte primitives defined by the same source revision; they expose no `process`, `require`, dynamic import, console, timer, or host object not named by this brief.
- Inputs are only the ten exact source strings, paths, empty synthetic tree, offsets, ordinals, classifications, and expected codes in `V-01`–`V-10`.
- The complete source revision is self-contained. It accepts only its embedded literal strings/path/tree/context fixtures and the three exact Node built-ins above; it performs no other filesystem, environment, process, clock, randomness, locale, network, module-loading, or repository access.
- Each permitted Node process has a 60-second wall-clock ceiling enforced by the Worker orchestration but not exposed inside the program. Timeout is a qualification failure for that revision; never interpret it as a vector result.
- Synthetic outputs never enter the official five manifests and are never Codex evidence.

## Revision and execution ceilings

A **source revision** is one exact canonical extractor-plus-harness byte sequence. Revision 1 counts. At most eight revisions are permitted.

For each revision:

1. canonicalize complete source as UTF-8 without BOM, LF endings, and exactly one final LF;
2. require at most 262,144 canonical bytes;
3. record revision number, byte size, SHA-256, and single-line standard RFC 4648 Base64;
4. require the Base64 to match `^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$`, contain no whitespace, decode to the exact canonical bytes, and re-encode identically;
5. invoke the one permitted Node process and compile once with the fixed `vm.Script` call; and
6. if compilation succeeds, run exactly two complete qualification executions over `V-01` through `V-10` in ascending ID order in that process, emit one structured result, and exit.

A failed compile or qualification execution ends that revision. The Worker may create the next in-memory revision only after recording the exact failed stage/reason; it may not patch a revision in place or exceed eight. A passing revision freezes immediately: no later source, expected-oracle, harness, fixture, or runtime change is permitted. Stop at the first passing revision. If no revision qualifies, return `UNQUALIFIED` and stop; do not choose the closest result.

## Independent oracle and required checks

The qualification harness must contain two distinct paths:

1. **production path** — the exact parser/resolver/classifier/serializer intended for later official execution;
2. **literal oracle path** — hard-coded expected field objects and canonical byte strings for every vector, derived from the reviewed table rather than by calling the production parser, resolver, classifier, row builder, serializer, sorter, or hashing helper.

For each of the two executions, require:

- exactly `V-01` through `V-10`, in order, with no missing or extra vector;
- literal equality for source path, declaration/leaf ordinal or `<NONE>`, line, UTF-8 anchor offset, anchor, target token when applicable, edge/no-edge kind, target class, link family, and resolution/reason code;
- literal equality for every expected canonical `LEXICAL-EDGES`, `EDGE-RESOLUTIONS`, `NO-EDGE-UNRESOLVED`, `NOVEL-PATHS`, and `COVERAGE-STATUS` byte sequence under the vector's empty tree;
- literal equality for the complete-result envelope bytes and independently predeclared SHA-256 values of each expected component and envelope;
- no unexpected row, count, sentinel, duplicate, ordering difference, exception, or diagnostic;
- byte-identical actual outputs and hashes across both executions; and
- unchanged source byte size, SHA-256, Base64, decode/re-encode result, runtime version, fixture literals, and oracle literals before/after both executions.

The oracle's expected bytes and digests must be literal data in the frozen source. Generating expected output or an expected digest with a production-path function is a qualification failure even when actual and expected match.

## Qualification verdict

`QUALIFIED` requires one revision to pass every syntax, source-identity, Base64, ten-vector field, five-manifest, complete-envelope, literal-oracle, and double-execution check above. Anything else is `UNQUALIFIED`.

Qualification means only: this exact source conforms to the reviewed synthetic suite under Node.js `v24.15.0`. It does not prove correct behavior on official Codex source; artifact identity; Rust-language completeness; discovery completeness; path relevance; semantic reachability; lifecycle closure; capability closure; or production suitability.

## Required report

Return these sections:

1. **Start attestation** — task, role/class, requested/actual binding, exact fallback reason, task identity, control/candidate exact heads and clean states, object/blob checks, and `returned-unit independent review N/A`.
2. **Zero-input attestation** — zero network/GitHub/Codex/local-Codex/package/archive/schema/candidate-content/temp/repository/external reads or writes beyond the named local authority files and HEAD/status checks.
3. **Revision ledger** — revisions 1 through the stopping revision; canonical byte size/SHA-256/Base64; compile result; two-run result; exact failure reason; and confirmation that a new revision followed only a failed revision.
4. **Literal oracle** — all hard-coded expected field objects, five canonical manifest byte strings, envelope bytes, and predeclared hashes for `V-01` through `V-10`, plus proof that no production helper generated them.
5. **Qualified source** — only for `QUALIFIED`: exact complete canonical source text, byte size, SHA-256, single-line Base64, Node version, and Base64 decode/re-encode/digest proof. For `UNQUALIFIED`, do not promote a source.
6. **Vector results** — both executions' exact expected-versus-actual fields, rows, counts, component hashes, envelope hash, and no-extra/missing result.
7. **Verdict** — exactly `QUALIFIED` or `UNQUALIFIED`, with the narrow meaning above.
8. **Nonclaims** — zero official Codex request/result/source retention/evidence; no path freeze, semantic trace, candidate change, re-score, `BLK-A2-03` closure, gap inference, Codex/App Server/product-runtime or downloaded-binary probe, A3, DeepSeek, maintenance, implementation, or later-phase authority.
9. **Future Phase-B requirements** — separately persist/review exact source identity; decode/verify immutable bytes; no modification; pre/post suite; wholly fresh official inputs; original ceilings; stop without repair.
10. **Final state** — exact control/candidate heads and clean states immediately before return; no temp or repository change.

If the full report is too large, send ordered coordination chunks. Do not omit or summarize away the canonical source, Base64, literal oracle, or vector results for a `QUALIFIED` verdict.

## Stop boundary

This qualification task is unauthorized until its exact control commit passes both review axes. Even a review-clean `QUALIFIED` report authorizes no official request. Phase B requires a new exact Commander evidence/dispatch unit and fresh independent review.
