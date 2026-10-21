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
| `.github/workflows/` | Existing hosted Gate/queue, automatic post-nightly packaging and version-tag delivery |
| `e2e/` | Supported Journey runners over the real application topology |
| `tests/unit/`, `tests/service/` | Provider-free checks at pure and persistence boundaries |
| `tests/fixtures/`, `tests/editorial-cases/` | Admitted deterministic inputs and bounded editorial evidence; their READMEs own provenance |
| `docs/`, `kick-in/` | Current documentation and accepted design references; active status and archive routing follow the document lifecycle |
| `SampleBooks/` | Exact Owner-admitted public inputs; its allowlist is not widened by cleanup |

Generated `node_modules/`, `.pnpm-store/`, `.cache/`, `.runtime/`, `dist/`, `release/` and `test-results/` stay ignored and reconstructable. Product data and credentials stay outside the repository. Cleanup never includes unrelated untracked files or another worktree's state.

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

Each extraction needs an Issue, unchanged observable behavior, focused regression coverage and the applicable existing Journey. Track priority in the [development plan](development-plan.md); this map is navigation, not a second backlog.
