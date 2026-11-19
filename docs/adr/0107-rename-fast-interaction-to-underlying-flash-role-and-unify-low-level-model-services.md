---
status: accepted
date: 2026-11-19
deciders: Owner
amends: ADR 0080, ADR 0088, ADR 0094 and ADR 0095 (renames Fast Interaction Role to Underlying Flash Role, redraws the responsibility boundary with Main Editorial Role, and replaces the closed fast-role union with an extensible FlashTaskContract registry); ADR 0106 §3 and §10 (standards-table formatting runs on the Underlying Flash Service); ADR 0105 §4, §5 and §7 (retires StubEmbeddingProvider and material_index_vectors in the revision-117 baseline and adds slices R5-F1 and R5-F2); V2-UX-MODEL-002 and V2-UX-KB-009
decides: the renaming and responsibility boundary of the Underlying Flash Role, the unified catalog of low-level Flash tasks, the extensible contract registry, and the replacement of #1027 by #1608
---

# 0107 · Rename Fast Interaction Role to Underlying Flash Role, unify low-level Flash services, and replace local ONNX embeddings (#1608)

## Context

### The Owner's direction (2026-11-19)

> 「我认为关于快速交互模型应当更换一个名字，而且进行明确的职责划分，把偏向底层的，不需要向用户展示的，且在模型能力内的调用统一处理。比如在更新的ADR0106和issue 1152提出的格式转换，这一类任务都应该集中一个flash模型处理，更新一下1027的方案（关闭后新开issue，并且更新相关文档）并进行全局的整理，统一处理哪些任务需要接入这个底层flash服务，并且保留后续新添加的任务灵活接入的空间」

### Why the former name and split were wrong

1. **`Fast Interaction Role` (`快速交互角色`) blurred user-facing editorial work with low-level plumbing.**
   In the existing policy and runtime (`src/service/fast-role/fast-role-execution.ts`, `provider-processing-policy.v35.json`), `Fast Interaction Role` mixed two incompatible classes of work:
   - **User-facing editorial interaction and prose generation:** `editorial-dialogue` (manuscript Q&A), `global-agent-dialogue` / `global-agent-scoped-dialogue` (AI 助手), `editorial-polish` / `scoped-edit` (`润色这段` / `就选中部分让 AI 修改`), and `conflict-regenerate` (`基于当前稿件重新生成建议`). Every one of these produces prose or answers that the editor reads and judges directly. Routing them to a smaller model degrades visible editorial quality.
   - **Low-level structured transformations and indexing:** `material-translation` (`生成来源译文`) and `model-connection-test`, while other low-level tasks such as `learning-curation` (`从完整编辑样例整理待接受的偏好与记忆`) sat on `Main Editorial Role`, and `standards-table-formatting` ([ADR 0106](./0106-keep-standards-tables-as-an-importable-library-and-check-standard-usage-against-it.md) §3, [#1152](https://github.com/zhouy1017/ai7-harness/issues/1152)) had no dedicated low-level role assignment.
2. **Closed 4-kind union blocked clean extension.**
   `FastRoleKindId` was hard-wired to four literals (`EDITORIAL_POLISH_KIND | CONFLICT_REGENERATE_KIND | MATERIAL_TRANSLATION_KIND | CONNECTION_TEST_KIND`). Adding any new low-level task required editing the central union and route table rather than registering a bounded contract.

### Why #1027's local ONNX embedding route is retired

[#1027](https://github.com/zhouy1017/ai7-harness/issues/1027) proposed shipping `onnxruntime-node@1.30.0`, `@huggingface/tokenizers@0.2.0` and `intfloat/multilingual-e5-small` (`model_qint8_avx512_vnni.onnx`) inside the desktop application. The offline validation in [#1147](https://github.com/zhouy1017/ai7-harness/issues/1147) ([dependency provenance](../development/dependency-provenance.md#f08-external-validation--retained-results-and-limits)) established that:

- **Cost is disproportionate:** the 18-package closure and model weights add ~248 MB (including 17 platform binaries such as `DirectML.dll` and `dxcompiler.dll` with unresolved redistribution notice carriers) and ~930–994 MB peak worker RSS.
- **Technical defects are severe for Chinese publishing:**
  - Grouped batch inference failed the `1e-4` coordinate tolerance (`0.0126` maximum difference) due to dynamic activation quantization, forcing sequential single-text native calls (`S1`).
  - Supplementary-plane Han characters (`U+20BB7` 「𠮷」, `U+20000`) tokenize to `<unk>`, losing rare Chinese characters critical to editorial work.
  - Bi-encoder cosine similarity failed on negation counterexamples (`Q09`, ranking a negated distractor above the relevant passage).
  - Force-terminating an in-flight native worker caused fatal process aborts (`Exit 134`).
- **Existing `StubEmbeddingProvider` (`ai7-embedding/stub-1`) is redundant:** hashing Han unigrams and bigrams into 256-dimensional float blobs in `material_index_vectors` duplicates lexical matching while adding SQLite write volume and the `构建相似索引` UI ceremony.

## Decision

### 1 · Rename and responsibility boundary

The two primary operational Model Roles are separated by whether a call produces **user-facing editorial judgement/prose** or **low-level deterministically checked structured data**:

| Model Role | 中文名称 | UI / Settings label | Responsibility boundary |
| --- | --- | --- | --- |
| **Main Editorial Role** | 主编辑角色 | 主编辑模型 | All user-facing editorial intelligence: whole-book and ranged Review Runs, cross-unit review synthesis, Factual Verification, Baseline and Custom Manuscript Analysis, Initial Evaluation, Reader's Report and Evaluation Rewrite, Writing Tasks, **Editorial Dialogue (`editorial-dialogue`), Global Agent Dialogue (`global-agent-dialogue`, `global-agent-scoped-dialogue`), Manuscript Polish / Scoped AI Edit (`editorial-polish`, `scoped-edit`), and Conflict Suggestion Regeneration (`conflict-regenerate`)**. |
| **Underlying Flash Role** | 底层辅助角色 | 底层辅助模型（Flash） / 底层 Flash 服务 | Low-level, non-user-facing (or background/preprocessing) calls whose reasoning process is not shown to the editor, whose task difficulty lies well within a lightweight Flash model's capability, and whose output is structured intermediate data verified by deterministic code before taking effect. |

`Difficult Escalation Role` (`疑难升级角色`) and `Frontier Model Role` (`前沿模型角色`) remain unchanged in the Execution context vocabulary. Historical ledger rows and wire compatibility readers continue to recognize `'Fast Interaction Role'` / `'fast-interaction'` as the predecessor alias of `'Underlying Flash Role'` / `'underlying-flash'`.

### 2 · Unified task catalog on the Underlying Flash Service

All low-level model calls converge on the **Underlying Flash Service** (`Underlying Flash Role`):

| Task kind (`kindId`) | Consumer & purpose | Outbound category | Mandatory deterministic post-check & fallback |
| --- | --- | --- | --- |
| `standards-table-formatting` | **知识库 › 字表与词表** ([ADR 0106](./0106-keep-standards-tables-as-an-importable-library-and-check-standard-usage-against-it.md) §3, [#1152](https://github.com/zhouy1017/ai7-harness/issues/1152) R5-L2): convert unstructured imported table files (text-layer PDF, DOCX prose, TXT, unrecognised spreadsheet) into `ai7.standard-table/1` entries after usage estimate and confirmation | `public-or-synthetic` (dev-live) / `house-knowledge-import-excerpt` or admitted material category (production) | Every returned entry must name its location in the imported file and AI7 verifies that its recommended/discouraged forms occur there (`未识别` with reason if absent); unsure or conflicting rows are held as `待确认`; outcome-unknown parts are never resent automatically ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599)). Regular tables and `ai7.standard-table/1` files convert without any model call. |
| `retrieval-query-expansion` & `retrieval-rerank` | **本地检索与资料查找** ([#1608](https://github.com/zhouy1017/ai7-harness/issues/1608) R5-F2, superseding [#1027](https://github.com/zhouy1017/ai7-harness/issues/1027)): silently expand editor/material search queries into 3–5 synonym/morpheme variants and rerank/filter BM25 Top-K candidate previews (filtering negation counterexamples and distractors) | `frozen-material-reference-excerpt` / bounded query terms | Returned candidate IDs must belong to the caller's pinned, authorized `RetrievalIndex` candidate set; locked-version Exact Fetch still precedes every citation. When the Underlying Flash Service is unconfigured, offline or fails, retrieval falls back seamlessly to the enhanced local lexical ranker (§4). |
| `material-translation` | **资料库 › 生成来源译文** ([#892](https://github.com/zhouy1017/ai7-harness/issues/892), V2-UX-KB-009): translate non-Chinese (`language === 'other'`) 资料库 paragraphs in bounded batches into labelled `来源译文` stored beside the original | `public-or-synthetic` (dev-live) / `frozen-material-reference-excerpt` (production) | Strict paragraph ordinal and segment SHA-256 verification; partial or failed batches stop cleanly while preserving already recorded translations. |
| `learning-curation` | **质量与学习 › 自动归纳审阅偏好** ([ADR 0094](./0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md) §3, [#1408](https://github.com/zhouy1017/ai7-harness/issues/1408)): cluster up to 10 qualified editing examples on the idle lane into at most 3 candidate `审阅偏好` proposals | `qualified-learning-example-bundle` | Moved from `Main Editorial Role` to `Underlying Flash Role`. Strict JSON schema check (`title` ≤ 160 chars, valid `editorialDimension`, `exampleIds` subset of input examples); proposals never activate without editor acceptance. |
| `guideline-clause-formatting` | **知识库 › 审阅规范文件** (extensible import helper): format unnumbered or Word-auto-numbered guideline prose into numbered clauses (`1…N`, ≤ 40 clauses, ≤ 300 graphemes each) when deterministic regex parsing finds no explicit text numbers | `public-or-synthetic` / house guideline text | Same confirm-first and source-trace contract as `standards-table-formatting`: every clause's words must trace to the imported file before entering the existing preview–confirm flow. Files with explicit numbering (`1.` / `第1条`) continue to parse without a model. |
| `model-connection-test` | **设置 › 模型服务**: lightweight channel and credential connectivity check | `public-or-synthetic` | Bounded first-byte/total timeout ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599)) and exact role/model identity check. |

### 3 · Extensible `FlashTaskContract` registry

`src/service/fast-role/` is refactored into the **Underlying Flash Service** (`UnderlyingFlashService`) backed by an open contract registry:

1. **Uniform contract interface (`FlashTaskContract<TInput, TOutput>`):**
   - `kindId`: unique task identifier;
   - `label`: plain Chinese action name used in disclosures and refusal messages;
   - `outboundCategory`: `OutboundDataCategory` enforced by `EgressGate` per operational scope;
   - `systemPrompt` and `promptContractDigest`: immutable prompt contract and SHA-256 digest used by `ProviderResultCache` and provider-free deterministic fixtures;
   - `slice`: `ProviderTestItemSlice` for developer-live ledger accounting;
   - `budget`: per-call input/output token bounds, batching rule, and first-byte/idle streaming deadlines ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599));
   - `validateAndTrace(rawText, sourceContext)`: **mandatory deterministic post-validator**. No Flash task may return free-form unverified prose as authoritative data; every output is parsed and checked against its source text, candidate ID set or schema;
   - `fallback`: deterministic fallback behavior when the service is unavailable or not needed.
2. **Plug-in extensibility for future low-level tasks:**
   Future low-level tasks (such as import heading-candidate disambiguation, bibliographic metadata extraction, or terminology normalization) join the service by defining a standalone `*-contract.ts` module and registering it in the registry, without altering `ModelRequestGovernor`, `CredentialBroker`, `EgressGate`, or the settings flow.
3. **Zero-ceremony default binding in `设置 › 模型服务`:**
   - In ordinary mode, selecting a main model automatically binds the Underlying Flash Role to that channel's recommended Flash model (or reuses the main model binding when no separate Flash model is chosen), requiring zero extra steps from the editor.
   - In advanced / developer settings, the editor may independently select a dedicated Flash model and reasoning effort (defaulting to minimal/non-thinking effort) for `底层辅助角色`.

### 4 · Lightweight hybrid retrieval superseding #1027

[#1027](https://github.com/zhouy1017/ai7-harness/issues/1027) is closed and replaced by [#1608](https://github.com/zhouy1017/ai7-harness/issues/1608), combining a zero-dependency local lexical upgrade with optional Underlying Flash Service assistance:

1. **Enhanced zero-dependency local lexical ranker (`src/service/retrieval/index.ts`):**
   - Tokenization uses `NFKC` normalization (preserving all Unicode supplementary-plane Han characters such as `U+20BB7` that E5 lost to `<unk>`) and combines three weighted feature tiers:
     - full Chinese words from Node v24 built-in `new Intl.Segmenter('zh', { granularity: 'word' })` and Latin/number tokens (weight `1.0`);
     - adjacent Han bigrams (weight `0.6`);
     - stopword-filtered core Han unigram morphemes (weight `0.25`), capturing shared-morpheme synonyms (e.g. `修订 / 修改 / 改动`, `违约 / 毁约`, `首印 / 初印 / 印数`).
   - `searchManuscript(query, 'tokenized')` ranks blocks by BM25 score rather than requiring boolean `tokens.every(...)`.
2. **Automatic entity and alias expansion from pinned baseline records:**
   - `RetrievalIndex` already holds `PinnedLocalToolSources` (`baseline.entities` and `terms`, each carrying `name` and `aliases`). When a query matches an entity or term name/alias, `retrieve()` automatically expands the query with its sibling aliases at zero model cost.
3. **Multi-query `retrieve` tool for Main Editorial Role runs:**
   - The local `retrieve` tool accepts `queries?: readonly string[]` (up to 4 synonym or paraphrase variants generated by the calling Main Editorial Role model inside the same tool call) and fuses the per-query BM25 rankings through the existing `reciprocalRankFusion()`. This adds zero extra network round trips.
4. **Underlying Flash Service query expansion and Top-K candidate rerank:**
   - For editor-initiated searches (`searchReferableMaterials` and library material search), the Underlying Flash Service provides `retrieval-query-expansion` and `retrieval-rerank` over the local BM25 Top-K candidate previews, resolving paraphrase gaps and negation counterexamples (`#1147` Q09) while preserving locked-version Exact Fetch and immediate withdrawal checks. When offline or unconfigured, search uses the enhanced local ranker directly.
5. **Retirement of `StubEmbeddingProvider` and `material_index_vectors`:**
   - `StubEmbeddingProvider` (`ai7-embedding/stub-1`), background FNV-1a vector pumping, the `material_index_vectors` table, and the `构建相似索引` button ceremony are retired in the R5 revision-117 storage baseline ([ADR 0105](./0105-fold-the-storage-baseline-undo-by-editor-step-and-upgrade-in-app.md)). The Material Index retains its authoritative original, metadata, extracted text, sentence/page-anchored segments, and `来源译文` layers.

### 5 · Delivery in R5 (#1608, slices R5-F1 and R5-F2)

Two slices join R5 on `codex/integration-0.8.0` ([development plan](../development/development-plan.md)):

| Slice | What it delivers | Order |
| --- | --- | --- |
| **R5-F1** | Rename `Fast Interaction Role` to `Underlying Flash Role` (`底层辅助角色` / `底层辅助模型（Flash）`); move user-facing dialogue, polish/scoped-edit and conflict regeneration to `Main Editorial Role`; move `learning-curation` to `Underlying Flash Role`; refactor `src/service/fast-role/` into the extensible `FlashTaskContract` registry and expose the `standards-table-formatting` contract seam for R5-L2 ([#1152](https://github.com/zhouy1017/ai7-harness/issues/1152)) | Before or alongside R5-L2; after the R5 train lands |
| **R5-F2** | Upgrade local lexical retrieval (`Intl.Segmenter` + bigrams + weighted unigram morphemes + `NFKC`, baseline entity/alias expansion, multi-query `retrieve(queries[])` with RRF, ranked `searchManuscript`); wire `retrieval-query-expansion` and `retrieval-rerank` on the Underlying Flash Service with lexical fallback; remove `StubEmbeddingProvider` and drop `material_index_vectors` in revision 117 | Schema removal on the R5-2 train; retrieval and Flash wiring before R5-7 |

## Records amended

- **[ADR 0080](0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md), [ADR 0088](0088-carry-the-editorial-dialogue-under-developer-live.md), [ADR 0094](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md) and [ADR 0095](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md):** `Fast Interaction Role` (`快速交互角色`) is renamed to `Underlying Flash Role` (`底层辅助角色`). User-facing dialogue, polish/scoped-edit and conflict regeneration move to `Main Editorial Role`; `learning-curation` moves to `Underlying Flash Role`.
- **[ADR 0106](0106-keep-standards-tables-as-an-importable-library-and-check-standard-usage-against-it.md) §3 and §10:** R5-L2's model formatting of unstructured table files (`standards-table-formatting`) runs on the Underlying Flash Service (`Underlying Flash Role`) through the `FlashTaskContract` registry of R5-F1.
- **[ADR 0105](0105-fold-the-storage-baseline-undo-by-editor-step-and-upgrade-in-app.md) §4, §5 and §7:** revision 117 drops `material_index_vectors` (an expected difference for R5-6's converter and `#1556`'s inventory), and slices R5-F1 and R5-F2 join R5 before R5-7.
- **[Execution CONTEXT](../domain/execution/CONTEXT.md) and [GLOSSARY](../../GLOSSARY.md):** `Underlying Flash Role` (`底层辅助角色`) replaces `Fast Interaction Role` (`快速交互角色`), and `Main Editorial Role` (`主编辑角色`) explicitly covers user-facing dialogue and prose-editing assistance.
- **[UI Requirements](../ui-ux-v2/requirements.md) (V2-UX-MODEL-002, V2-UX-KB-009, V2-UX-KB-011) and [Editor Surfaces](../ui-ux-v2/editor-surfaces.md) (§8.4, §10.4):** role labels use `底层辅助角色` (`底层辅助模型（Flash）`), `相似段落检索` uses enhanced local lexical + Underlying Flash Service retrieval without manual `构建相似索引`, and `字表与词表` formatting names the Underlying Flash Service.
- **[Dependency Provenance](../development/dependency-provenance.md):** closes the F-08 local ONNX product question by recording that `#1027` is closed and superseded by `#1608` / ADR 0107, with no ONNX or tokenizer package admitted.

## Consequences

- User-facing conversations and prose suggestions always use the editor's `Main Editorial Role` model, never a downgraded fast model.
- Behind-the-scenes formatting (`#1152` standards tables, guideline clauses), retrieval query expansion and candidate reranking (`#1608`), source translation (`#892`), background learning curation (`#1408`) and connection probes share one low-latency, low-cost Underlying Flash Service with mandatory deterministic verification.
- Future low-level model tasks plug into the `FlashTaskContract` registry without structural refactoring.
- AI7 avoids ~248 MB of native ONNX/model dependencies, ~1 GB of worker RSS, `<unk>` loss on rare Chinese characters, and third-party DLL notice blockers while gaining negation-aware, alias-aware retrieval.
- Ordinary CI remains 100% provider-free.
