# Repository structure

Start with the [product README](../../README.md) for what AI7 does, [source checkout](source-checkout.md) for running it, and [AGENTS](../../AGENTS.md) for repository work. Domain ownership comes from the [context map](../../CONTEXT-MAP.md); the directory layout does not introduce new domain authorities.

## Where changes belong

| Path | Responsibility |
| --- | --- |
| `src/main/` | Electron application lifecycle, native integration and sandboxed preload boundary |
| `src/renderer/` | Chinese-first editor surfaces and view state |
| `src/service/` | Authoritative application services, persistence and domain operations; the existing feature directories hold analysis, review, writing, evaluation, retrieval and provider adapters |
| `src/shared/` | Typed wire contracts, shared values and validation consumed across process boundaries |
| `config/` | Pinned dependency inputs, provider declarations, native assets and generated metadata |
| `tools/*.mjs` | Stable developer command entry points and generation/build owners |
| `tools/ci/` | Internal GitHub queue orchestration and Orca merge-authority checks |
| `.github/workflows/` | Existing hosted Gate/queue and delivery workflows; #1009 owns native post-nightly packaging and Windows version-tag delivery |
| `e2e/` | Supported Journey runners over the real application topology |
| `tests/unit/`, `tests/service/` | Provider-free checks at pure and persistence boundaries |
| `tests/fixtures/`, `tests/editorial-cases/` | Admitted deterministic inputs and bounded editorial evidence; their READMEs own provenance |
| `docs/`, `kick-in/` | Current documentation and accepted design references; active status and archive routing follow the document lifecycle |
| `SampleBooks/` | Exact Owner-admitted public inputs; its allowlist is not widened by cleanup |

Generated `node_modules/`, `.pnpm-store/`, `.cache/`, `.runtime/`, `dist/`, `release/` and `test-results/` stay ignored and reconstructable. Product data and credentials stay outside the repository. Cleanup never includes unrelated untracked files or another worktree's state.

[manuscript-screen.ts](../../src/renderer/manuscript-screen.ts) owns the existing Manuscript and Production Document editor rendering, screen-local coordination and destruction. [index.ts](../../src/renderer/index.ts) retains shell composition, routing, shared authorities and one semantic handle to the Manuscript screen on display. [baseline-analysis-card.ts](../../src/renderer/baseline-analysis-card.ts) holds ②A's baseline-analysis card and [import-review.ts](../../src/renderer/import-review.ts) the review before an import; the shell lends each its routes through one factory.

[data-storage.ts](../../src/renderer/data-storage.ts) holds 数据与存储; the shell supplies its existing helpers and routes through one factory.

[knowledge-base.ts](../../src/renderer/knowledge-base.ts) holds 知识库 and 质量与学习; the shell supplies its existing helpers and routes through one factory.

[model-service-settings.ts](../../src/renderer/model-service-settings.ts) holds 模型服务; the shell supplies its existing helpers and routes through one factory.

[store-records.ts](../../src/service/store-records.ts) holds the authority store's record primitives (its errors, assertion, canonical JSON, SHA-256, patterns and typed row reads). [model-service-connections.ts](../../src/service/model-service-connections.ts) owns `model_service_connections`: every text the relation has had and the rebuilds between them. [store.ts](../../src/service/store.ts) keeps transactions, authoritative state, error boundaries and public delegates; its operation groups live with their feature owners as functions over a typed store host: 书系 in [series.ts](../../src/service/series.ts), 可复用工序 in [captured-procedures.ts](../../src/service/captured-procedures.ts), 按我的评分重写评语 in [evaluation-rewrites.ts](../../src/service/evaluation-rewrites.ts), 学习监督 and 学习素材/学习整理 in [house-review-preference.ts](../../src/service/house-review-preference.ts), 自定义分析维度 in [custom-analysis-dimensions.ts](../../src/service/custom-analysis-dimensions.ts), 后台分析登记 in [background-analysis-enrollments.ts](../../src/service/background-analysis-enrollments.ts) and 审稿意见 in [readers-reports.ts](../../src/service/readers-reports.ts).

Wave 23's remaining store groups use the same host pattern. Private callbacks stay bound to the store; public callbacks are looked up when called so overrides and test spies retain their behavior.

| Module | Responsibility |
| --- | --- |
| [store-schema.ts](../../src/service/store-schema.ts) | Existing core, intake, model and search schema initialization and forward migrations |
| [store-operation-support.ts](../../src/service/store-operation-support.ts) | Shared operation types, labels and record readers used by the extracted groups |
| [model-search-settings.ts](../../src/service/model-search-settings.ts) | Persistent model connections, role choices, model discovery cache and search settings |
| [material-index-operations.ts](../../src/service/material-index-operations.ts) | Material indexing, vector building/search and translation scheduling |
| [global-agent-operations.ts](../../src/service/global-agent-operations.ts) | Global scope pins, governance, history and dialogue dispatch |
| [writing-task-operations.ts](../../src/service/writing-task-operations.ts) | Writing preparation, materials, exemplars, quick start and draft creation |
| [factual-verification-operations.ts](../../src/service/factual-verification-operations.ts) | Research evidence, factual rechecks, verification views and correction proposals |
| [initial-evaluation-operations.ts](../../src/service/initial-evaluation-operations.ts) | Evaluation profiles, initial-evaluation preparation, scope and ledger selection |

[baseline-analysis-store.ts](../../src/service/analysis/baseline-analysis-store.ts) retains analysis composition, preparation, execution binding and revision persistence. Its existing exported names remain compatible.

| Module | Responsibility |
| --- | --- |
| [baseline-analysis-types.ts](../../src/service/analysis/baseline-analysis-types.ts) | Analysis ledger records, launch bindings and host-facing types |
| [run-state.ts](../../src/service/analysis/run-state.ts) | Run labels, state readings, ceiling and launch projections |
| [request-admissions.ts](../../src/service/analysis/request-admissions.ts) | Immutable request-admission reading and validation, also consumed directly by task authorization |
| [request-admission-operations.ts](../../src/service/analysis/request-admission-operations.ts) | Request admission writes, evidence checkpoints and reconciliation |
| [run-checkpoint-operations.ts](../../src/service/analysis/run-checkpoint-operations.ts) | Unit checkpoints and carried usage, using the existing checkpoint contract |
| [clarification-operations.ts](../../src/service/analysis/clarification-operations.ts) | Clarification request/answer persistence, expiry and claims, using the existing clarification contract |
| [curation-runs.ts](../../src/service/analysis/curation-runs.ts) | Learning-curation budget, authorization, binding and settlement |

[protocol.ts](../../src/shared/protocol.ts) remains the compatible entry point for wire contracts and versions. Feature definitions and their validators live below it; cross-feature references use type imports.

| Module under `src/shared/protocol/` | Responsibility |
| --- | --- |
| [analysis.ts](../../src/shared/protocol/analysis.ts) | Coverage, wire pages, run reports, synthesis and assurance |
| [task-kinds.ts](../../src/shared/protocol/task-kinds.ts) | Analysis kind constants, goals, modes and custom-dimension validation |
| [analysis-plan.ts](../../src/shared/protocol/analysis-plan.ts) | Analysis plans, reuse, execution binding, updates and history |
| [factual-verification.ts](../../src/shared/protocol/factual-verification.ts) | Factual findings, evidence assurance, research and correction contracts |
| [review-runs.ts](../../src/shared/protocol/review-runs.ts) | Category reviews, review runs, reports and house preferences; evidence primitives remain in `review.ts` |
| [evaluation.ts](../../src/shared/protocol/evaluation.ts) | Initial evaluation, reader reports, rewrite and evaluation workspace contracts |
| [writing.ts](../../src/shared/protocol/writing.ts) | Writing results, tasks and drafts |
| [task-plan.ts](../../src/shared/protocol/task-plan.ts) | Task drawer, run controls, clarification, default rules and enrollment |
| [knowledge-base.ts](../../src/shared/protocol/knowledge-base.ts) | Guidelines, exemplars, imported skills and procedure recommendations |
| [captured-procedures.ts](../../src/shared/protocol/captured-procedures.ts) | Captured procedures and developer proposals |
| [library-materials.ts](../../src/shared/protocol/library-materials.ts) | Library attribution, eligibility, indexing, vectors and translations |

[application.ts](../../src/main/application.ts) retains Electron lifecycle, owned-window routing and shared authority. Handler groups register in the existing order and use its existing disposer.

| Module under `src/main/` | Responsibility |
| --- | --- |
| [launch-arguments.ts](../../src/main/launch-arguments.ts) | Launch parsing and runtime validation |
| [application-types.ts](../../src/main/application-types.ts) | Owned windows and renderer capabilities |
| [handler-guards.ts](../../src/main/handler-guards.ts) | Desktop assertion and typed result envelope |
| [file-pickers.ts](../../src/main/file-pickers.ts) | Native open/save/folder choices and one-shot injected paths |
| [knowledge-base-handlers.ts](../../src/main/knowledge-base-handlers.ts) | Guidelines, exemplars, skills, procedures, dimensions and developer proposals |
| [evaluation-handlers.ts](../../src/main/evaluation-handlers.ts) | Evaluation, reader-report, rewrite and writing IPC |
| [library-learning-handlers.ts](../../src/main/library-learning-handlers.ts) | Library, research, factual, learning, global-agent and calibration IPC |
| [series-handlers.ts](../../src/main/series-handlers.ts) | Series membership, knowledge and exclusions |
| [data-storage-handlers.ts](../../src/main/data-storage-handlers.ts) | Database export/import/replacement/merge, backups, usage and quit |
| [review-handlers.ts](../../src/main/review-handlers.ts) | Review workspace, execution, findings and reports |
| [deliverables-handlers.ts](../../src/main/deliverables-handlers.ts) | Deliverables, maintenance, production documents and delivery packages |

[bounded-schema-sql.ts](../../src/service/manuscript/bounded-schema-sql.ts) holds the bounded manuscript store's existing schema SQL, expected historical shapes and foreign-key signatures; [bounded-manuscript.ts](../../src/service/bounded-manuscript.ts) re-exports its public SQL constants.

[bounded-schema-check.ts](../../src/service/manuscript/bounded-schema-check.ts) holds the same store's exact table, index, trigger and search-schema checks, including its existing column-signature cache; initialization, migrations and the store class remain in the hub.

## Tooling ownership

The existing commands `node tools/nightly-queue.mjs …` and imports from `tools/orca-release.mjs` remain compatible. Their implementations live in [queue.mjs](../../tools/ci/queue.mjs) and [release-authority.mjs](../../tools/ci/release-authority.mjs). The latter authorizes repository merges; it is distinct from creating a product release. Keeping the entry paths stable also preserves trusted control checkouts used by existing workflow runs.

[check.mjs](../../tools/check.mjs) owns local static verification. [check-docs.mjs](../../tools/check-docs.mjs) checks local file/directory destinations in tracked active Markdown and the root `CLAUDE.md` wrapper. It reads no archive contents or SampleBook payloads (only `SampleBooks/README.md` is documentation), refuses symlinks and redirected parent directories, and makes no network requests. Stage new documents before running it:

```text
pnpm run docs:check
pnpm run check
```

This checks inline links, image links, reference definitions and HTML destinations, with exact path case. External URLs and heading fragments require review; the command does not certify semantic accuracy or implement a complete Markdown renderer. The existing L0 includes this check; there is no additional hosted Gate.

## Boundaries for later cleanup

The review at `dev@f3199a2d` found concentrated ownership in `src/service/store.ts`, `src/shared/protocol.ts`, `src/renderer/index.ts` and `src/main/application.ts`. Size alone does not justify a replacement. Future work should extract one existing responsibility with its direct callers and tests:

- Move feature-specific wire types and validators behind `protocol.ts` re-exports, preserving wire versions and consumers.
- Extract one cohesive service-store operation group into its existing feature owner while leaving transactions, schema and authoritative state in their present owner.
- Extract one renderer screen's rendering and event wiring without introducing another view-state store.
- Separate one native application integration from shell lifecycle while preserving startup and close ordering.
- Split one manuscript-store or analysis-store responsibility out of `src/service/bounded-manuscript.ts` or `src/service/analysis/baseline-analysis-store.ts` behind its existing owner interface.

Each extraction needs an Issue, unchanged observable behavior, focused regression coverage and the applicable existing Journey. The [development plan](development-plan.md) tracks priority and the measured size ceilings (F-25); this map is navigation, not a second backlog.
