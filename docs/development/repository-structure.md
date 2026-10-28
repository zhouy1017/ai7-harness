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

[store-records.ts](../../src/service/store-records.ts) holds the authority store's record primitives (its errors, assertion, canonical JSON, SHA-256, patterns and typed row reads). [store.ts](../../src/service/store.ts) keeps transactions, schema, authoritative state, error boundaries and one-line public delegates; its operation groups live with their feature owners as functions over a typed store host: 书系 in [series.ts](../../src/service/series.ts), 可复用工序 in [captured-procedures.ts](../../src/service/captured-procedures.ts), 按我的评分重写评语 in [evaluation-rewrites.ts](../../src/service/evaluation-rewrites.ts), 学习监督 and 学习素材/学习整理 in [house-review-preference.ts](../../src/service/house-review-preference.ts), 自定义分析维度 in [custom-analysis-dimensions.ts](../../src/service/custom-analysis-dimensions.ts), 后台分析登记 in [background-analysis-enrollments.ts](../../src/service/background-analysis-enrollments.ts) and 审稿意见 in [readers-reports.ts](../../src/service/readers-reports.ts).

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
