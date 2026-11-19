---
status: accepted
date: 2026-11-19
deciders: Owner
amends: ADR 0080, ADR 0088, ADR 0094 and ADR 0095 (replaces the four legacy Model Roles with the 2×2 Foreground/Underlying × Pro/Flash role matrix, splits autonomous learning into Underlying Flash sample tidying plus Underlying Pro rule synthesis, and replaces the closed fast-role union with an extensible FlashTaskContract registry); ADR 0106 §3 and §10 (standards-table formatting runs on the Underlying Flash Service); ADR 0105 §4, §5 and §7 (retires StubEmbeddingProvider and material_index_vectors in the revision-117 baseline and adds slices R5-F1 and R5-F2); V2-UX-MODEL-002 and V2-UX-KB-009
decides: the 2×2 four-role architecture (Foreground Pro, Foreground Flash, Underlying Pro, Underlying Flash), the unified catalog of Underlying Flash tasks, the two-stage autonomous learning split, the extensible contract registry, and the replacement of #1027 by #1608
---

# 0107 · Adopt the 2×2 Model Role matrix (Foreground/Underlying × Pro/Flash), unify Underlying Flash services, and replace local ONNX embeddings (#1608)

## Context

### The Owner's directions (2026-11-19)

1. > 「我认为关于快速交互模型应当更换一个名字，而且进行明确的职责划分，把偏向底层的，不需要向用户展示的，且在模型能力内的调用统一处理。比如在更新的ADR0106和issue 1152提出的格式转换，这一类任务都应该集中一个flash模型处理，更新一下1027的方案（关闭后新开issue，并且更新相关文档）并进行全局的整理，统一处理哪些任务需要接入这个底层flash服务，并且保留后续新添加的任务灵活接入的空间」
2. > 「我认为自主学习部分还是应当可以单独配置一个更强的模型来进行，整理可以交给底层Flash服务，也就是说我们是否应当划分四种模型，前台Pro/Flash，底层Pro/Flash，这里的Flash/Pro只是用来描述模型能力而不是具体到模型名称」

### Why the former four Model Roles were flawed

1. **Two of the four legacy roles were unused placeholders, while the other two conflated layer and capability.**
   Previously, AI7 declared four Model Roles (`Main Editorial Role / 主编辑角色`, `Fast Interaction Role / 快速交互角色`, `Difficult Escalation Role / 疑难升级角色`, `Frontier Model Role / 前沿模型角色`). In every active policy (`v10` through `v35`), `Difficult Escalation Role` and `Frontier Model Role` were named by zero rules, while `Fast Interaction Role` mixed editor-facing interactive prose/dialogue with low-level background translations and connection probes.
2. **Autonomous learning needs both low-level tidying and high-capability reasoning.**
   Editor learning signals (manual revisions, Word tracked changes, finding decisions) require two distinct levels of model work:
   - **Pre-sorting, deduplicating and tidying raw edit diffs (`整理`)** is high-volume, structured, low-difficulty work that belongs on an underlying Flash service.
   - **Synthesizing durable editorial preferences and habits (`自主学习归纳`)** requires deep cross-example induction, boundary reasoning and conflict resolution — where an editor or house may want to configure a model even stronger (or at higher reasoning effort) than daily foreground review.
3. **Closed 4-kind union blocked clean extension of low-level Flash tasks.**
   `FastRoleKindId` in `src/service/fast-role/fast-role-execution.ts` was hard-wired to four literals (`EDITORIAL_POLISH_KIND | CONFLICT_REGENERATE_KIND | MATERIAL_TRANSLATION_KIND | CONNECTION_TEST_KIND`), preventing new low-level tasks from plugging in without editing central unions and route tables.

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

### 1 · The 2×2 Model Role matrix: Foreground / Underlying × Pro / Flash

AI7 replaces the four legacy role labels with an orthogonal 2×2 matrix defined along two axes:
- **Interaction Layer (`前台 Foreground` vs `底层 Underlying`):** whether the model's output is presented directly to the editor as editorial prose, dialogue or reports (`前台`), or runs behind the scenes as system/background processing, autonomous rule synthesis, formatting or retrieval support (`底层`).
- **Capability Tier (`Pro` vs `Flash`):** whether the task requires deep multi-constraint reasoning, cross-sample abstraction and long-form judgement (`Pro`), or low-latency interaction / bounded structured transformation within a lightweight model's capability (`Flash`). **`Pro` and `Flash` describe capability tiers only, never a specific vendor's model branding.**

| Role ID & English name | 中文名称 | UI / Settings label | Responsibility boundary & assigned tasks | Default inheritance (when not separately configured) |
| --- | --- | --- | --- | --- |
| **Foreground Pro Role** (`foreground-pro`; legacy alias `Main Editorial Role` / `main-editorial`) | 前台 Pro 角色 | 前台 Pro（主审校与深度创作） | **Editor-facing deep reasoning and long-form editorial production:**<br>• Whole-book and ranged Review Runs (`editorial-review/*`), cross-unit review synthesis (`#1433`, `#1506`), assurance sampling<br>• Factual Verification (`factual-review`, `factual-recheck`)<br>• Baseline and Custom Manuscript Analysis (`baseline-manuscript-analysis`, `custom-analysis/*`)<br>• Initial Evaluation, Reader's Report and Evaluation Rewrite (`evaluation`, `readers-report`, `evaluation-rewrite`)<br>• Derivative document Writing Tasks (`writing`) | Primary configured model in `设置 › 模型服务` |
| **Foreground Flash Role** (`foreground-flash`) | 前台 Flash 角色 | 前台 Flash（即时对话与局部微调） | **Editor-facing low-latency interactive dialogue and localized text adjustments:**<br>• Manuscript selection Q&A and Editorial Dialogue (`editorial-dialogue`)<br>• Global AI Assistant dialogue (`global-agent-dialogue`, `global-agent-scoped-dialogue`)<br>• Localized passage polish and scoped AI edit (`editorial-polish`, `scoped-edit`)<br>• Single-region conflict suggestion regeneration (`conflict-regenerate`) | Inherits `Foreground Pro Role` (or the channel's selected Flash tier when chosen) |
| **Underlying Pro Role** (`underlying-pro`; replaces unused escalation/frontier slots) | 底层 Pro 角色 | 底层 Pro（自主学习与深度归纳） | **Behind-the-scenes high-capability induction, autonomous learning and knowledge distillation:**<br>• **Autonomous Learning Rule Synthesis (`learning-curation` / `learning-synthesis`)**: inducing durable house/book `审阅偏好` proposals, resolving rule conflicts, and generating the `审阅习惯总结` from pre-tidied editing examples and supervision directives<br>• Future deep background distillation (e.g. procedure rule extraction from completed runs) | Inherits `Foreground Pro Role`; **may be configured to an even stronger reasoning model or higher reasoning effort (`@high` / `@xhigh`)** dedicated to autonomous learning |
| **Underlying Flash Role** (`underlying-flash`; legacy alias `Fast Interaction Role` / `fast-interaction`) | 底层 Flash 角色 | 底层 Flash（底层转换与检索整理） | **Behind-the-scenes structured formatting, sample tidying, retrieval assistance, translation indexing and probes** (all verified by deterministic post-checks; §2) | Automatically binds the channel's recommended Flash model, or falls back `Foreground Flash Role` → `Foreground Pro Role` |

Historical ledger records and wire readers continue to accept `'Main Editorial Role'` / `'main-editorial'` and `'Fast Interaction Role'` / `'fast-interaction'` as aliases for `Foreground Pro Role` and `Underlying Flash Role`.

### 2 · Unified task catalog on the Underlying Flash Service (`Underlying Flash Role`)

All low-level, non-user-facing structured calls converge on the **Underlying Flash Service** (`Underlying Flash Role`), while deep learning induction runs on `Underlying Pro Role`:

| Task kind (`kindId`) | Consumer & purpose | Outbound category | Mandatory deterministic post-check & fallback |
| --- | --- | --- | --- |
| `standards-table-formatting` | **知识库 › 字表与词表** ([ADR 0106](./0106-keep-standards-tables-as-an-importable-library-and-check-standard-usage-against-it.md) §3, [#1152](https://github.com/zhouy1017/ai7-harness/issues/1152) R5-L2): convert unstructured imported table files (text-layer PDF, DOCX prose, TXT, unrecognised spreadsheet) into `ai7.standard-table/1` entries after usage estimate and confirmation | `public-or-synthetic` (dev-live) / admitted house-import category (production) | Every returned entry must name its location in the imported file and AI7 verifies that its recommended/discouraged forms occur there (`未识别` with reason if absent); unsure or conflicting rows are held as `待确认`; outcome-unknown parts are never resent automatically ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599)). Regular tables and `ai7.standard-table/1` files convert without any model call. |
| `learning-sample-tidying` | **质量与学习 › 自主学习样本预整理** ([ADR 0094](./0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md) §3, [#1608](https://github.com/zhouy1017/ai7-harness/issues/1608)): pre-clean, deduplicate, classify by editorial dimension and filter incidental noise from raw editing signals (manual edits, Word tracked changes, proposal decisions) before handing the structured bundle to `Underlying Pro Role` for rule synthesis | `qualified-learning-example-bundle` | Every tidied item must reference an exact input `exampleId` and preserve its original `before` / `after` digest; no new example text or rule is invented at the tidying stage. |
| `retrieval-query-expansion` & `retrieval-rerank` | **本地检索与资料查找** ([#1608](https://github.com/zhouy1017/ai7-harness/issues/1608) R5-F2, superseding [#1027](https://github.com/zhouy1017/ai7-harness/issues/1027)): silently expand editor/material search queries into 3–5 synonym/morpheme variants and rerank/filter BM25 Top-K candidate previews (filtering negation counterexamples and distractors) | `frozen-material-reference-excerpt` / bounded query terms | Returned candidate IDs must belong to the caller's pinned, authorized `RetrievalIndex` candidate set; locked-version Exact Fetch still precedes every citation. When the Underlying Flash Service is unconfigured, offline or fails, retrieval falls back seamlessly to the enhanced local lexical ranker (§4). |
| `material-translation` | **资料库 › 生成来源译文** ([#892](https://github.com/zhouy1017/ai7-harness/issues/892), V2-UX-KB-009): translate non-Chinese (`language === 'other'`) 资料库 paragraphs in bounded batches into labelled `来源译文` stored beside the original | `public-or-synthetic` (dev-live) / `frozen-material-reference-excerpt` (production) | Strict paragraph ordinal and segment SHA-256 verification; partial or failed batches stop cleanly while preserving already recorded translations. |
| `guideline-clause-formatting` | **知识库 › 审阅规范文件** (extensible import helper): format unnumbered or Word-auto-numbered guideline prose into numbered clauses (`1…N`, ≤ 40 clauses, ≤ 300 graphemes each) when deterministic regex parsing finds no explicit text numbers | `public-or-synthetic` / house guideline text | Same confirm-first and source-trace contract as `standards-table-formatting`: every clause's words must trace to the imported file before entering the existing preview–confirm flow. Files with explicit numbering (`1.` / `第1条`) continue to parse without a model. |
| `model-connection-test` | **设置 › 模型服务**: lightweight channel and credential connectivity check | `public-or-synthetic` | Bounded first-byte/total timeout ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599)) and exact role/model identity check. |

### 3 · Extensible `FlashTaskContract` registry

`src/service/fast-role/` is refactored into the **Underlying Flash Service** (`UnderlyingFlashService`) backed by an open contract registry:

1. **Uniform contract interface (`FlashTaskContract<TInput, TOutput>`):**
   - `kindId`: unique task identifier;
   - `label`: plain Chinese action name used in disclosures and refusal messages;
   - `role`: defaults to `'underlying-flash'` (while supporting `'foreground-flash'` for interactive single-turn actions sharing the lightweight single-request transport);
   - `outboundCategory`: `OutboundDataCategory` enforced by `EgressGate` per operational scope;
   - `systemPrompt` and `promptContractDigest`: immutable prompt contract and SHA-256 digest used by `ProviderResultCache` and provider-free deterministic fixtures;
   - `slice`: `ProviderTestItemSlice` for developer-live ledger accounting;
   - `budget`: per-call input/output token bounds, batching rule, and first-byte/idle streaming deadlines ([#1599](https://github.com/zhouy1017/ai7-harness/issues/1599));
   - `validateAndTrace(rawText, sourceContext)`: **mandatory deterministic post-validator**. No Flash task may return free-form unverified prose as authoritative data; every output is parsed and checked against its source text, candidate ID set or schema;
   - `fallback`: deterministic fallback behavior when the service is unavailable or not needed.
2. **Plug-in extensibility for future low-level tasks:**
   Future low-level tasks (such as import heading-candidate disambiguation, bibliographic metadata extraction, or terminology normalization) join the service by defining a standalone `*-contract.ts` module and registering it in the registry, without altering `ModelRequestGovernor`, `CredentialBroker`, `EgressGate`, or the settings flow.
3. **Zero-ceremony cascading configuration in `设置 › 模型服务`:**
   - In ordinary mode, selecting one main model (or a Pro + Flash pair) configures all four roles automatically through the default inheritance table in §1.
   - In advanced / developer settings, the editor may independently bind any of the four roles — **`前台 Pro`**, **`前台 Flash`**, **`底层 Pro`（自主学习）**, and **`底层 Flash`（底层转换与整理）** — to a specific channel, model and reasoning effort.

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
3. **Multi-query `retrieve` tool for Foreground Pro runs:**
   - The local `retrieve` tool accepts `queries?: readonly string[]` (up to 4 synonym or paraphrase variants generated by the calling model inside the same tool call) and fuses the per-query BM25 rankings through the existing `reciprocalRankFusion()`. This adds zero extra network round trips.
4. **Underlying Flash Service query expansion and Top-K candidate rerank:**
   - For editor-initiated searches (`searchReferableMaterials` and library material search), the Underlying Flash Service provides `retrieval-query-expansion` and `retrieval-rerank` over the local BM25 Top-K candidate previews, resolving paraphrase gaps and negation counterexamples (`#1147` Q09) while preserving locked-version Exact Fetch and immediate withdrawal checks. When offline or unconfigured, search uses the enhanced local ranker directly.
5. **Retirement of `StubEmbeddingProvider` and `material_index_vectors`:**
   - `StubEmbeddingProvider` (`ai7-embedding/stub-1`), background FNV-1a vector pumping, the `material_index_vectors` table, and the `构建相似索引` button ceremony are retired in the R5 revision-117 storage baseline ([ADR 0105](./0105-fold-the-storage-baseline-undo-by-editor-step-and-upgrade-in-app.md)). The Material Index retains its authoritative original, metadata, extracted text, sentence/page-anchored segments, and `来源译文` layers.

### 5 · Delivery in R5 (#1608, slices R5-F1 and R5-F2)

Two slices join R5 on `codex/integration-0.8.0` ([development plan](../development/development-plan.md)):

| Slice | What it delivers | Order |
| --- | --- | --- |
| **R5-F1** | Establish the 2×2 four-role bindings (`Foreground Pro / 前台 Pro`, `Foreground Flash / 前台 Flash`, `Underlying Pro / 底层 Pro`, `Underlying Flash / 底层 Flash`) with cascading defaults; split autonomous learning into `Underlying Flash` sample tidying (`learning-sample-tidying`) + `Underlying Pro` rule synthesis (`learning-curation`); refactor `src/service/fast-role/` into the extensible `FlashTaskContract` registry and expose the `standards-table-formatting` contract seam for R5-L2 ([#1152](https://github.com/zhouy1017/ai7-harness/issues/1152)) | Before or alongside R5-L2; after the R5 train lands |
| **R5-F2** | Upgrade local lexical retrieval (`Intl.Segmenter` + bigrams + weighted unigram morphemes + `NFKC`, baseline entity/alias expansion, multi-query `retrieve(queries[])` with RRF, ranked `searchManuscript`); wire `retrieval-query-expansion` and `retrieval-rerank` on the Underlying Flash Service with lexical fallback; remove `StubEmbeddingProvider` and drop `material_index_vectors` in revision 117 | Schema removal on the R5-2 train; retrieval and Flash wiring before R5-7 |

## Records amended

- **[ADR 0080](0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md), [ADR 0088](0088-carry-the-editorial-dialogue-under-developer-live.md), [ADR 0094](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md) and [ADR 0095](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md):** replaces the four legacy role names (`Main Editorial Role`, `Fast Interaction Role`, and the unused `Difficult Escalation Role` and `Frontier Model Role`) with the 2×2 matrix (`Foreground Pro Role / 前台 Pro 角色`, `Foreground Flash Role / 前台 Flash 角色`, `Underlying Pro Role / 底层 Pro 角色`, `Underlying Flash Role / 底层 Flash 角色`). Splits autonomous learning into `Underlying Flash` sample tidying and `Underlying Pro` preference synthesis.
- **[ADR 0106](0106-keep-standards-tables-as-an-importable-library-and-check-standard-usage-against-it.md) §3 and §10:** R5-L2's model formatting of unstructured table files (`standards-table-formatting`) runs on the Underlying Flash Service (`Underlying Flash Role`) through the `FlashTaskContract` registry of R5-F1.
- **[ADR 0105](0105-fold-the-storage-baseline-undo-by-editor-step-and-upgrade-in-app.md) §4, §5 and §7:** revision 117 drops `material_index_vectors` (an expected difference for R5-6's converter and `#1556`'s inventory), and slices R5-F1 and R5-F2 join R5 before R5-7.
- **[Execution CONTEXT](../domain/execution/CONTEXT.md) and [GLOSSARY](../../GLOSSARY.md):** defines the four 2×2 Model Roles (`Foreground Pro Role`, `Foreground Flash Role`, `Underlying Pro Role`, `Underlying Flash Role`) and records their legacy aliases.
- **[UI Requirements](../ui-ux-v2/requirements.md) (V2-UX-MODEL-002, V2-UX-KB-009, V2-UX-KB-011) and [Editor Surfaces](../ui-ux-v2/editor-surfaces.md) (§8.4, §10.4):** role labels use `前台 Pro 角色 · 前台 Flash 角色 · 底层 Pro 角色 · 底层 Flash 角色`, `相似段落检索` uses enhanced local lexical + Underlying Flash Service retrieval without manual `构建相似索引`, and `字表与词表` formatting names the Underlying Flash Service.
- **[Dependency Provenance](../development/dependency-provenance.md):** closes the F-08 local ONNX product question by recording that `#1027` is closed and superseded by `#1608` / ADR 0107, with no ONNX or tokenizer package admitted.

## Consequences

- Every one of the four Model Roles now has an active, orthogonal purpose (`前台/底层 × Pro/Flash`), retiring the two unused escalation/frontier placeholders.
- Autonomous learning can use a dedicated high-reasoning model (`底层 Pro`) to induce house/book editorial rules while delegating noisy raw-diff tidying to `底层 Flash`.
- Behind-the-scenes formatting (`#1152` standards tables, guideline clauses), learning sample tidying, retrieval query expansion and candidate reranking (`#1608`), source translation (`#892`) and connection probes share one low-latency, low-cost Underlying Flash Service with mandatory deterministic verification.
- Future low-level model tasks plug into the `FlashTaskContract` registry without structural refactoring.
- AI7 avoids ~248 MB of native ONNX/model dependencies, ~1 GB of worker RSS, `<unk>` loss on rare Chinese characters, and third-party DLL notice blockers while gaining negation-aware, alias-aware retrieval.
- Ordinary CI remains 100% provider-free.
