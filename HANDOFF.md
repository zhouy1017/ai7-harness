# AI7 Issue #24 handoff

Start with root [`AGENTS.md`](AGENTS.md), inspect the exact branch and worktree, then read current [`PROGRESS.md`](PROGRESS.md) and GitHub Issue #24 including Commander amendments 1–2. This file is a cold-start router, not an authority owner.

## Current implementation

Branch `feat/24-j01-new-book-tracer` starts from exact `dev@b70a0f014829fd92f898d55beb75f8595bfad996` and owns the first provider-free J-01 new-Book happy-path tracer. It is one deep root package and one product subject:

> fresh supported checkout → verified host-native Electron carrier → isolated Electron main/renderer plus separate Node service and dormant DSH → runtime-generated public-synthetic Chinese DOCX → no-preselection import review → one atomic initial Book graph → bounded ProseMirror window → explicit platform save → independently committed durable Edit Journal acknowledgement.

The implementation is not full J-01. Existing-Book/source-only import, cancellation and ambiguity branches, restart/recovery, reimport comparison, retrieval/model work, providers, exports, installers, release mechanics, and private manuscripts remain outside Issue #24.

## Read next

1. [`README.md`](README.md) for the exact supported hosts and commands.
2. [`docs/development/source-checkout.md`](docs/development/source-checkout.md) for closed inputs, lifecycle, readiness, and the pipe-only E2E carrier.
3. [`docs/development/dependency-provenance.md`](docs/development/dependency-provenance.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for package, secondary artifact, lifecycle, digest, and license routing.
4. [`config/dependency-artifacts.json`](config/dependency-artifacts.json), [`package.json`](package.json), [`pnpm-workspace.yaml`](pnpm-workspace.yaml), and [`pnpm-lock.yaml`](pnpm-lock.yaml) for exact machine-readable pins.
5. The Issue's routed architecture, ADR, Editorial, UI/UX, source-checkout, CI, Git, and document-lifecycle authorities before changing scope.

## Exact command surface

```text
pnpm run doctor
pnpm run bootstrap
pnpm run build
pnpm run start-built -- --data-root <absolute-path-outside-the-checkout>
pnpm run e2e -- --journey J-01
```

Only the final command is the one admitted standing scenario. `doctor`, bootstrap, build, and readiness are setup properties of that product subject, not additional gates.

## Boundary traps

- Electron is a SHA-bound secondary zip materialized by fixed canonical OS archive adapters. There is no npm `electron` package or native npm extractor.
- Renderer API is exactly five pathless business methods. Raw paths, DOCX bytes, database paths, whole manuscripts, credentials, and provider state never cross it.
- Product and E2E-controller egress are denied after restoration. Playwright uses inherited `--remote-debugging-pipe`; no debugger port, TCP listener, dev server, inspector, WebSocket endpoint, screenshot, trace, video, or payload log is admitted.
- Harness readiness is infrastructure evidence only. Import completion is the atomic AI7 transaction; edit completion appears only after the separate committed journal acknowledgement.
- Ordinary close is blocked while the editor is dirty, saving, retry-required, or interrupted with unconfirmed text. A service crash preserves the visible buffer but makes no recovery or durability claim.
- Agent Data Root and shell are canonicalized by the shared owner before Electron starts; Chromium's standard early user-data switch and main's observed Electron path must match that shell. SQLite/store, object directories, sidecars, and content objects likewise cannot redirect through a pre-existing symlink or junction.
- Windows Server 2025 is truthfully labelled CI evidence; local Windows evidence is Windows 11. macOS behavior must not be claimed until its exact host run is green.
- Only the Commander may push, open or change a pull request, merge, tag, publish, release, or touch `dev`/`main`.

## Next safe action

Obtain the requested read-only standards/spec review over the clean final SHA, address only in-scope findings, and report only locally proven hosts. The exact command sequence and dependency/notices/archive sweep are green on the local Windows 11 carrier; do not broaden the Change Brief to resolve a failure or imply that macOS/hosted CI already ran.
