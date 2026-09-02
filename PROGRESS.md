# Current checkpoint

## What's done

- Issue #178 Worker began in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` at clean `fix/178-electron-main-crash` / `37347d6962984618732ca3aeb251dd100b430009`, exactly matching the authorized `origin/dev` base.
- Read the active Issue body and the Owner's binding amendment, plus the routed lifecycle, E2E-boundary, Electron-shell, and Gate authority required for this observed J-01 bug.
- Added the bounded J-01 Issue #178 regression stage and its existing-controller fixed location. The public seam uses one multi-window CDP manager after attachment, proves both initial routes, closes only the secondary target, checks `2→1`, verifies survivor IPC, and proves both distinct routes again after reopening.
- Confirmed the pinned Windows host/toolchain with `pnpm run doctor` (Node 24.18.1, pnpm 11.24.0, Electron 43.4.1). After transient direct-source failures, one uninterrupted ordinary `pnpm run bootstrap` completed the declared 150 MB Electron acquisition, digest verification, extraction, and runtime checks; the ordinary build then passed. Issue #179 was closed with no implementation because partial-download evidence showed throughput rather than a bootstrap interface defect.
- The first regression run reached the real secondary-window close and exposed the native Electron `Error` window while product source remained untouched. The public CDP manager now bounds every root request at 30 seconds, so the observed modal cannot hold the diagnostic runner indefinitely.
- The minimized public J-01 loop produced the required deterministic nonzero red in 8 seconds: `LOCAL_DIAGNOSTIC_ONLY/J-01/window-close/journey-failure/not-completion`. It returned without any human dismissing the native Error, and the post-run host check found zero Electron processes while product lifecycle code was still untouched.
- Applied only the cached-live-`webContents.id` lifecycle repair in `src/main/application.ts`, rebuilt with the exact Node 24.18.1 / pnpm 11.24.0 toolchain, and obtained the formal green `LOCAL_DIAGNOSTIC_ONLY/J-01/pass/not-completion`; the post-run Electron process count remained zero.
- Removed all temporary `[DEBUG-ISSUE178]` instrumentation and restored the one accidentally displaced baseline `closeProduct()`. A later fresh rerun then exposed a distinct low-probability controller race: Electron had exited and no native dialog remained, but J-01's Node runner could wait forever because the client-side Playwright `browser.close()` Promise can remain pending even after the bounded child close-or-kill path has finished.
- Stabilized that runner defect without a new Journey or gate. A temporary injector first proved the old path stayed alive beyond 30 seconds after Electron closed; J-01 now atomically consumes Browser ownership, shares one active close, bounds a connected close at 10 seconds, always attempts isolated-root cleanup, and exits nonzero after flushing its fixed failure marker whenever close times out or rejects. The timeout injection returned `J-01/window-close` / exit 1 in 11.7 seconds, and the ordinary-rejection injection returned the same fixed failure / exit 1 in 1.84 seconds; both left zero AI7 Electron/Node processes and no new J-01 root. All injectors were deleted.
- Re-ran the unmodified public diagnostics after the final close semantics: J-01 and adjacent J-15 both passed. Syntax, TypeScript, `git diff --check`, and independent lifecycle re-review also pass with no remaining blocker.
- Committed the bounded-close follow-up as `e1f63291c941a82232de7631ebdaeb276cfdb88a`. Fresh Windows Local completion on that exact code-bearing commit passed in order: `pnpm run doctor`, ordinary `pnpm run bootstrap`, `pnpm run build`, and `pnpm run e2e:all`; the orchestrator reported J-01, J-02, J-08, J-12, J-15, and final `LOCAL_COMPLETION/all/pass`. Post-completion checks found zero AI7 Electron/Node processes, no new J-01 root, no remaining injector, and a clean worktree.
- Checked the shared reuse surfaces rather than editing them: `e2e/run-all.mjs` and `.github/workflows/e2e.yml` are unchanged, no temporary issue diagnostic entered the repository, and `git diff --check` passes.
- The original independent T2 review found zero Spec findings and zero hard Standards findings. The first locally complete unit was committed and pushed, and Draft pull request #180 now targets `dev`; it remains Draft. Its pull-request check suite records only skipped Route and matrix jobs with zero steps, not a Hosted Journey execution or paired Gate occurrence.

## What's next

- Push the bounded-close follow-up and this checkpoint to the same Draft PR #180. Then obtain the Owner's contemporaneous account-wide Actions-minute fact; if sufficient, re-resolve the exact target authority, make only PR #180 Ready for its one paired Hosted occurrence, inspect the actual usage delta, and integrate only after both platforms pass.

## Key decisions

- Regression proves two real AI7 BrowserWindows, closes only the secondary public CDP target, verifies `2→1`, public IPC usability of the survivor, and unique-route reopening of the closed Book without recording protected output.
- The product repair caches one live renderer `webContents.id` and uses it for both registry insertion and `closed` cleanup; it does not read `window.webContents` after `closed`.
- J-01 treats every connected Browser close that does not complete successfully as a fixed-class Journey failure. Its 10-second local deadline is intentionally shorter than pinned Playwright's internal 30-second close-or-kill wait so the runner can clean its own root and then use Playwright's synchronous exit cleanup instead of waiting forever on a stale pipe.

## Unresolved matters or blockers

- PR #180 cannot become Ready until the Owner supplies the separately monitored contemporaneous Actions-minute fact. Until #180 integrates, PR #177 cannot rebase onto the repaired `dev`, and no downstream product implementation may stack on either candidate.

## Safe Resume Prompt

```text
Resume Issue #178 with Draft PR #180. Confirm the bounded-close follow-up and checkpoint are pushed, but do not make the PR Ready until the Owner supplies the contemporaneous account-wide Actions-minute fact. If sufficient, re-resolve `dev` authority and run exactly one normal paired Hosted occurrence; integrate only after both platforms pass.
```
