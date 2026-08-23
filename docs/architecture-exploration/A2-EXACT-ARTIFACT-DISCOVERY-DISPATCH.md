# A2 exact Codex artifact discovery dispatch

Status: **authorized; read-only T2 evidence Worker next; candidate writing and A3 remain stopped**

Recorded: **2026-08-23**

This is a repository-development evidence brief. It does not select a dependency, admit new candidate evidence by itself, authorize a behavioral probe or artifact download, rescore A2, enter A3, or authorize implementation.

## Role and binding

- Repository role / task class: **Worker / T2**, bounded factual artifact and provenance discovery.
- Task name: `/root/a2_exact_artifact_t2`.
- Requested binding: Claude Code / `claude-sonnet-5` / medium.
- Actual binding: GPT-5.6 Terra / high, same-class fallback. The real post-reset Claude Opus session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` returned API HTTP 429 before inference at `$0`; no later reset or availability evidence exists, and the dispatch rules forbid repeated attempts inside that known exhausted quota window.
- Write boundary: **none**. Return a structured report to the Commander; do not edit, stage, commit, or create repository or temporary project files.

## Exact admitted repository objects

Read these with `git show <commit>:<path>` rather than consuming a task transcript or browsing an active foreign worktree:

1. Owner U2 resolution:
   - `2e1aab9ca2a8fc46c24a23b19c3a38677ea106c3:docs/architecture-exploration/clarifications/0003-accept-bounded-unsupported-codex-risk.md`
   - blob `921983e817668b1a51f4799c4942e265ba4280a5`, 5661 bytes.
2. Commander X2 decision:
   - `2e1aab9ca2a8fc46c24a23b19c3a38677ea106c3:docs/architecture-exploration/A2-CLOSURE-SUBJECT-DECISION.md`
   - blob `054040e9d7dfbf406fc640ef90c58548cd8831e4`, 2875 bytes.
3. Codex-first direction and source boundary:
   - `2e1aab9ca2a8fc46c24a23b19c3a38677ea106c3:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`
   - blob `886a68cda297becb44ba85fc2cb4880ad7252b13`, 12448 bytes.
4. Review-clean candidate decision/evidence context at exact head `f1d212c5ebc5287dbc2b97a716de14b8195e2c3c`:
   - `docs/architecture-v2/DECISION-QUEUE.md`, blob `f53c6f3dbffe43ebe25616b5edde3d2f1a2191c7`, 55078 bytes;
   - `docs/architecture-v2/A2-EVIDENCE-REGISTER.md`, blob `c713f89592affd34022caf3fc13083d33ece6afc`, 13603 bytes; and
   - `docs/architecture-v2/A2-CAPABILITY-CLOSURE.md`, blob `179aa72edc41237e2aee56e056e654a831ff5b10`, 40685 bytes.

No other candidate object is admitted. `f1d212c5` stays read-only and noncanonical.

## Source order and boundary

Use the `openai-docs` skill. Its first substantive action must search and open the exact official App Server/release topic. Then use only:

1. current official OpenAI documentation on `developers.openai.com`, `learn.chatgpt.com`, or `platform.openai.com`;
2. immutable metadata and source objects from the official `openai/codex` GitHub repository, including exact releases, tags, commits, paths, and release assets; and
3. read-only official npm registry metadata for `@openai/codex` and the exact platform package(s) it declares.

Do not use search snippets as evidence, community posts, third-party articles, mirrors, package aggregators, or moving repository content without resolving an exact commit. Record retrieval time, exact URL or command, immutable identity, claim supported, and any missing official mapping.

The Commander already observed from current official documentation that:

- App Server is the deep product-integration surface and its source lives in `openai/codex`;
- `codex app-server generate-ts` and `generate-json-schema` produce output specific to the Codex version that ran them; and
- the App Server command and WebSocket transport are described as experimental and unsupported for production workloads, while stdio is the default transport.

Re-verify rather than merely repeat those statements.

## Exact questions

Return one evidence table that answers:

1. What is the newest exact published `@openai/codex` version available at retrieval time, and what immutable npm integrity/tarball metadata identifies it?
2. Which official platform packages provide Windows x64 and Windows arm64 binaries for that exact version, and are their versions locked coherently?
3. Is there an exact official GitHub release/tag for that version? What commit does the tag resolve to, and is it annotated or lightweight?
4. Do the npm package metadata, release/tag, native binaries, and source commit form one provable artifact chain? Identify every missing or ambiguous link.
5. Does that exact artifact include `codex app-server`, and what official evidence establishes this without running or downloading it?
6. Is a pre-generated App Server TypeScript/JSON schema published for the exact artifact? If not, does official documentation establish a reproducible version-bound generation command, and what remains to be fingerprinted later?
7. Which exact LICENSE and NOTICE objects apply to the artifact, and do official package/release metadata include them or only source links?
8. What current support/maturity warning applies, and has it changed materially from the research snapshot or candidate evidence?
9. How does the exact artifact compare with research commit `44e95c857f37f81a5731eab72c32a3d334d0e2c4` and locally observed `codex-cli 0.147.0`? Do not infer equivalence without exact mapping.
10. Does the evidence identify one coherent X2 closure subject now? Answer **identified**, **not identified**, or **identified with exact missing links**, then name the safe next evidence action.

## Prohibited actions

Do not edit any file; install, pack, download, extract, or execute a package/binary; clone or fetch a repository into the workspace; generate a schema; run App Server; call a model/provider; inspect DeepSeek; run a behavioral probe; rescore a matrix row; declare Proven, Gap, closure, production selection, or A3 readiness; choose adapter/patch/fork maintenance; or take any external write/action.

Read-only `npm view`, official HTTP/API GETs, `git ls-remote` against the exact official repository, and `git show` of the admitted local objects are permitted. If an exact link cannot be established without a prohibited action, report the missing link rather than crossing the boundary.

## Exit report

Return:

- requested and actual binding, task class, fallback reason, and confirmation of no writes;
- retrieval timestamp and exact source inventory;
- the ten-question evidence table with direct official URLs/commands and immutable identities;
- a proposed exact X2 artifact identity, if supported;
- explicit missing links and the smallest next evidence/probe needed; and
- a boundary statement confirming no candidate edit, artifact execution/download, re-score, closure/gap claim, A3, DeepSeek, maintenance-form, implementation, or external write occurred.

Stop after the report. The Commander alone decides whether to admit it and whether a later candidate-writing brief exists.
