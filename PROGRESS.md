# Current checkpoint

## What's done

- Issue #178 Worker began in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` at clean `fix/178-electron-main-crash` / `37347d6962984618732ca3aeb251dd100b430009`, exactly matching the authorized `origin/dev` base.
- Read the active Issue body and the Owner's binding amendment, plus the routed lifecycle, E2E-boundary, Electron-shell, and Gate authority required for this observed J-01 bug.
- Added the bounded J-01 Issue #178 regression stage and its existing-controller fixed location. The public seam uses one multi-window CDP manager after attachment, proves both initial routes, closes only the secondary target, checks `2→1`, verifies survivor IPC, and proves both distinct routes again after reopening.
- Confirmed the pinned Windows host/toolchain with `pnpm run doctor` (Node 24.18.1, pnpm 11.24.0, Electron 43.4.1). After transient direct-source failures, one uninterrupted ordinary `pnpm run bootstrap` completed the declared 150 MB Electron acquisition, digest verification, extraction, and runtime checks; the ordinary build then passed. Issue #179 was closed with no implementation because partial-download evidence showed throughput rather than a bootstrap interface defect.
- The first regression run reached the real secondary-window close and exposed the native Electron `Error` window while product source remained untouched. The public CDP manager now bounds every root request at 30 seconds, so the observed modal cannot hold the diagnostic runner indefinitely.
- The minimized public J-01 loop produced the required deterministic nonzero red in 8 seconds: `LOCAL_DIAGNOSTIC_ONLY/J-01/window-close/journey-failure/not-completion`. It returned without any human dismissing the native Error, and the post-run host check found zero Electron processes while product lifecycle code was still untouched.
- Applied only the cached-live-`webContents.id` lifecycle repair in `src/main/application.ts`, rebuilt with the exact Node 24.18.1 / pnpm 11.24.0 toolchain, and obtained the formal green `LOCAL_DIAGNOSTIC_ONLY/J-01/pass/not-completion`; the post-run Electron process count remained zero.
- Removed all temporary `[DEBUG-ISSUE178]` instrumentation, restored the one accidentally displaced baseline `closeProduct()`, and completed independent regression/spec re-review with no remaining blocker. The review withdrew its cleanup concern after verifying pinned Playwright 1.62.1's 30-second close-or-kill path and Windows process-tree kill behavior against the observed zero-residual runs.
- The adjacent unchanged J-15 diagnostic passed. Fresh Windows Local completion then passed in exact order: `pnpm run doctor`, ordinary `pnpm run bootstrap`, `pnpm run build`, and `pnpm run e2e:all`; the orchestrator reported J-01, J-02, J-08, J-12, J-15, and final `LOCAL_COMPLETION/all/pass`. The post-completion Electron process count remained zero.
- Checked the shared reuse surfaces rather than editing them: `e2e/run-all.mjs` and `.github/workflows/e2e.yml` are unchanged, all temporary issue diagnostics are absent, and `git diff --check` passes.

## What's next

- Complete final independent diff review, commit the locally complete Issue #178 unit, and let the Commander push/open its Draft pull request without making it Ready or triggering Hosted Gate.

## Key decisions

- Regression proves two real AI7 BrowserWindows, closes only the secondary public CDP target, verifies `2→1`, public IPC usability of the survivor, and unique-route reopening of the closed Book without recording protected output.
- The product repair caches one live renderer `webContents.id` and uses it for both registry insertion and `closed` cleanup; it does not read `window.webContents` after `closed`.

## Unresolved matters or blockers

- No external blocker remains for the bounded product repair. Hosted Gate evidence and integration still require the Owner's separately monitored Actions-minute fact before a Draft pull request may become Ready.

## Safe Resume Prompt

```text
Continue Issue #178 only in the isolated issue-178 worktree from completed Windows Local completion and zero-process cleanup. Resolve any blocking final-review finding, commit and open the Draft pull request, but do not make it Ready or trigger Hosted Gate until the Owner supplies the separately monitored Actions-minute fact.
```
