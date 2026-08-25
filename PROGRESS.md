# Progress

## What's done

- Verified the sole writable worktree, branch, and exact base before edits: `C:\Users\Chooo\.codex\worktrees\issue24\ai7-harness`, `feat/24-j01-new-book-tracer`, and `b70a0f014829fd92f898d55beb75f8595bfad996`.
- Read Issue #24 and every routed authority named by its Change Brief. No unrelated archive or predecessor implementation was admitted.
- Proved the critical SQLite stop condition in the real Electron Node-mode path using the exact official Windows artifacts: Electron `43.4.1` reports embedded Node `24.18.1`, modules ABI `148`, SQLite `3.53.1`, and FTS5 available.
- Created the first root-package/toolchain checkpoint in [`.node-version`](.node-version), [`.npmrc`](.npmrc), [`package.json`](package.json), [`pnpm-workspace.yaml`](pnpm-workspace.yaml), [`pnpm-lock.yaml`](pnpm-lock.yaml), [`.gitignore`](.gitignore), and [`config/dependency-artifacts.json`](config/dependency-artifacts.json). Direct versions, the package-manager SRI, platform artifact digests, auto-peer denial, engine/peer/store strictness, exact DSH/framework convergence overrides, and the two exact lifecycle approvals are recorded.
- Added a closed-input host/toolchain checker and frozen bootstrap in [`tools/doctor.mjs`](tools/doctor.mjs) and [`tools/bootstrap.mjs`]. Bootstrap uses checkout-local package/Electron caches, verifies the manifest-selected Electron archive before extraction, and re-probes `node:sqlite` through the extracted Electron binary.
- Confirmed the exact 20-package provider-free DSH runtime closure and a real dormant six-service composition under Node `24.18.1`: zero agents, sessions, providers, configurable providers, tools, and rendered prompt; excluded package owners and Cordis optional CLI peers are absent. The Cordis CLI and unused optional services remain uninvoked/unmounted.
- Regenerated the lock with exact pnpm `11.24.0`; supply-chain verification passes and the lock records official tarball URLs, `autoInstallPeers: false`, and one exact ProseMirror version.
- Commander Change Brief amendment 1 at `#issuecomment-5414827311` resolves pnpm 11's reserved `doctor` collision by superseding only the five command spellings with explicit `pnpm run doctor|bootstrap|build|start-built|e2e`; all roles, semantics, scope, and stop conditions are unchanged.
- The amended Windows checkpoint is green: `pnpm run doctor` reports the closed pinned input set, and `pnpm run bootstrap` completes the frozen restore, verifies Electron archive SHA-256 `c2ef9a5f...2160e13a`, and reports embedded Node `24.18.1`, ABI `148`, SQLite `3.53.1`, and FTS5.
- Added the typed private service/renderer contracts in [`src/shared/protocol.ts`](src/shared/protocol.ts), including the bounded 32-block projection, explicit no-preselection flow, grapheme-bounded journal command, expected journal sequence, and named renderer API with no raw-path or whole-manuscript method.
- Added bounded provider-free DOCX parsing in [`src/service/docx.ts`](src/service/docx.ts) with streaming ZIP/XML bounds, active/embedded-content rejection, stable ordered block extraction, all eight fidelity categories, and an explicit unsupported/no-guarantee round-trip row that does not manufacture a degradation decision.
- Added the deep SQLite authority boundary in [`src/service/store.ts`](src/service/store.ts): content-addressed local source staging, digest-bound Review Before Import, one atomic exact new-Book/dimension/source/fidelity/primary-Manuscript/branch/r1/block/workflow/import-record graph, a signed maximum-32-block cursor window, and a separate committed journal transaction with exact idempotent acknowledgment binding.
- Replaced provisional dimensions with the accepted Q8 baseline set under stable IDs and an implementation-owned `1.0.0` profile/digest; equal values are explicitly labeled neutral starting weights, not an exhaustive scoring rubric. The seven accepted workflow phases remain pinned to a separate versioned/digested Manuscript profile.
- Exact Node `24.18.1` type-check is green. A public-synthetic 40-block DOCX runtime diagnostic exercised stage/review/atomic commit, verified a `32 of 40` first window, and verified sequence-1 journal durability/idempotency; it also found and fixed Windows `fsync` requiring a read/write temporary-object handle.
- Added the service guard/composition in [`src/service/runtime.ts`](src/service/runtime.ts). It denies default and synchronized ESM named HTTP(S), HTTP/2, TCP/TLS, UDP, DNS, fetch, WebSocket, and EventSource paths before dynamically importing DSH; then it awaits six Cordis plugin start barriers and proves the provider-free graph has zero configured/live agents, Sessions, providers, configurable providers, tools, assembled tools, prompt, and runtime context while excluded services remain absent.
- Added the private service executable in [`src/service/index.ts`](src/service/index.ts). It requires exact Electron `43.4.1` Node mode (`24.18.1`, ABI `148`), opens SQLite before reporting readiness, validates a four-byte/maximum-512-KiB framed protocol, processes requests serially, emits payload-bounded responses, and tears down the whole Cordis fiber plus both database connections on explicit shutdown, parent EOF, signals, or parent-lease loss.
- Aligned per-block and edit code-unit/grapheme bounds across [`src/shared/protocol.ts`](src/shared/protocol.ts), [`src/service/docx.ts`](src/service/docx.ts), and [`src/service/store.ts`](src/service/store.ts) so every maximum-32-block projection fits the framed carrier. An exact Electron Node-mode boundary probe produced a 203,397-byte commit response for 32 maximum 2,048-grapheme synthetic blocks against the 524,288-byte limit.
- Exact Electron service diagnostics are green: 51 public-synthetic blocks staged and atomically committed, 32 of 51 projected, sequence-1 journal ack returned, explicit shutdown and parent EOF exited cleanly, and parent lease loss terminated the service while its inherited stdin pipe was still held open. Network probes covered pre-import default functions, post-sync named functions, and callable/constructable ClientRequest paths without emitting URLs or payloads.

## What's next

- Implement the Electron main/preload supervision and context-isolated renderer/editor projection, then bundle the single built subject and drive the one admitted UI journey through it.

## Unresolved matters or blockers

- Audit nuance, not a stop condition: otherwise-required DSH package APIs contain unused replay/fork, test-fixture, and Code Mode symbols, but no excluded package/service is installed, mounted, or invoked and the actual dormant graph is clean. Dependency provenance must state this boundary without claiming byte-level absence.
- Bootstrap hardening remains required: child acquisition processes must receive an explicit registry/cache/proxy environment boundary so ambient npm/pnpm/Electron mirror or custom-directory selectors cannot alter selected inputs.
- Main-process and Chromium renderer outbound denial, exact service environment allowlisting, and the built-bundle post-guard inspection remain to be completed with the Electron integration slice.
- macOS host execution and Windows/macOS E2E remain unproven; no claim is made for them.

## Key decisions made

- pnpm 11 project settings live in `pnpm-workspace.yaml`; `.npmrc` contains only the official registry/auth posture. Omitting `packages` intentionally keeps exactly the one root package.
- `verifyDepsBeforeRun: false` prevents pnpm's new automatic pre-script install from bypassing the controlled frozen bootstrap on a fresh checkout.
- Electron `43.4.1` no longer declares an npm lifecycle script, so bootstrap explicitly seeds the exact `@electron/get` task-local cache with the independently verified archive and invokes the package's exact installer after the frozen dependency restore.
- DSH is composed in process from concrete public packages only; no aggregate/CLI, source subpath, provider, Session, approval, attachment, code runtime, persistence, settings, or Typert service is activated.
- The main-owned picker passes its selected path only over the private main-to-service request; the service alone parses and content-addresses the source. The renderer-facing picker method remains argument-free and never receives a path, bytes, database location, or whole manuscript.
- `round-trip-export` is truthfully `unsupported` because this tracer has no export behavior. The shared clean-tracer predicate requires the other seven categories to be preserved, records `clean-import-no-round-trip`, and leaves Import Degradation Decision absent.
- Service readiness is available only after both SQLite authority and the fully awaited Cordis composition exist. It proves infrastructure state only; import completion and journal durability continue to come solely from their committed domain transactions.
- The service binds to its spawning main-process PID as well as inherited stdin, so a lost supervisor cannot leave an orphan holding the business store. Explicit shutdown writes its bounded response before whole-graph disposal.

## Resume Prompt

Resume Issue #24 by implementing the Electron main-owned picker/service supervisor and the context-isolated Chinese Review Before Import plus bounded ProseMirror editor renderer over the completed framed service.
