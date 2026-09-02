# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`.
- The accepted product repair remains the cached-live-`webContents.id` lifecycle change in `src/main/application.ts`. The public J-01 observed-bug regression creates two real Book windows, closes only the secondary target, proves the surviving workspace remains usable, and reopens the closed Book with unique routing.
- The first integration-ready head `58de35514519ee57c3dfa36fed7d73098dd28487` passed fresh Windows Local completion and independent review before Ready. Owner then reported account usage `3 / 3000` minutes, and the Commander made PR #180 Ready exactly once.
- Hosted E2E Functional Gate run `33592150101` was not green: routing and macOS checkout/toolchain/bootstrap/build passed, but macOS J-01 returned the payload-safe fixed classification `J-01/review` after about 94.94 seconds. Matrix fail-fast cancelled Windows during J-01, so neither a Windows result nor paired evidence exists. No rerun was requested; PR #180 was immediately returned to Draft.
- Read-only diagnosis established that the Issue #178 two-window stage itself had passed on macOS because that stage retains the `window-close` location. The strongest supported cause was the new outer 10-second `browser.close()` deadline expiring before pinned Playwright 1.62.1's own 30-second close-or-kill boundary, while `closeProduct()` inherited a stale preceding `review` location.
- Rejected the first 35-second repair during independent review because it crossed Playwright's silent 30-second force-kill boundary and could turn a real graceful-shutdown hang into a pass. A second candidate that treated public `Browser.disconnected` as success was also rejected because the event covers crashes and transport loss as well as normal exits. The final J-01 repair therefore keeps a 25-second outer deadline and accepts only successful completion of `browser.close()`; a timeout or rejection remains fail-closed. A failed still-connected close restores Browser ownership so the existing final cleanup can retry it, and `closeProduct()` marks the already-admitted fixed `window-close` location before shutdown.
- Deterministic local probes were temporary and are deleted. A one-time 20-second delayed close completed the full J-01, proving that the new budget admits a normal close that the old 10-second bound rejected. A one-time permanently pending close returned `LOCAL_DIAGNOSTIC_ONLY/J-01/window-close/journey-failure/not-completion` / exit 1 in about 27 seconds, and a one-time ordinary rejection returned the same fixed class / exit 1 in about 2 seconds; final cleanup then used the restored ownership. Both failure probes left zero matching AI7 Electron/Node processes and no new J-01 root.
- The first fresh Local completion attempt at committed head `48b8de9c4c8c74b72606842bf474f73fe1b37b46` passed `doctor`, ordinary `bootstrap`, and `build`, then exposed a second real unattended-runner hang in J-01: Electron had exited after the expected tampered-reimport startup, but `chromium.launch()` never settled, the root stopped changing, and only the Node controller remained. The run was interrupted and is a local failure, not completion; the exact abandoned root was safety-checked and removed.
- J-01 now retains Playwright's 30-second launch timeout and adds a 35-second client-side acquisition bound so Playwright gets its own failure cleanup window while an independently stale Promise cannot wait forever. Both the outer timeout and Playwright's exported `TimeoutError` mark lifecycle cleanup as incomplete, cannot be swallowed by the scenario that expects a real tamper startup rejection, and force a fixed nonzero runner exit after outer cleanup.
- An exact tamper-stage injector reproduced a real Electron launch/exit with a permanently pending client acquisition; it now returned `LOCAL_DIAGNOSTIC_ONLY/J-01/launch/journey-failure/not-completion` / exit 1 in about 77 seconds, with zero matching processes and no new root. A separate typed Playwright-timeout injector produced the same fixed nonzero class instead of satisfying the expected-rejection scenario. With all injectors deleted, ordinary J-01 and adjacent J-15 pass again. Syntax and `git diff --check` pass, no temporary probe marker remains, and all exact roots created during this diagnosis were removed. Product code, workflow projection, Journey set, dependencies, interfaces, and Provider boundaries are unchanged from the pushed Issue #178 head.
- Final independent review of the stable source and checkpoint reports zero hard Spec findings, zero hard Standards findings, and zero smell judgement calls.
- Fresh Windows Local completion on the final reviewed head passes in order with the pinned toolchain: `doctor`, ordinary `bootstrap`, `build`, and `e2e:all`; J-01, J-02, J-08, J-12, J-15, and final `LOCAL_COMPLETION/all/pass` all completed. Post-run checks found zero matching AI7 Electron/Node processes, no new J-01 root, and a clean worktree.

## What's next

- Push the final reviewed and locally complete head while PR #180 remains Draft, update the pull-request evidence with failed Hosted run `33592150101` and the revised-head local repair evidence, then obtain a new contemporaneous account-wide Actions-minute fact before another Ready transition.

## Key decisions

- Run `33592150101` is a blocking Journey failure, not a GitHub runner/network transient and not paired-platform evidence; it is never rerun unchanged.
- The outer deadline must remain finite and before pinned Playwright's 30-second force-kill boundary. Neither elapsed time nor `Browser.disconnected` is introduced as a new success proof; only the existing close contract completing successfully inside 25 seconds is accepted. Timeout, rejection, or unknown shutdown state remains a blocking Journey failure.
- A failed still-connected close returns ownership to the existing final cleanup instead of orphaning the product. A permanently stale client Promise can still make the Journey fail, but it cannot block unattended development or silently pass a crash.
- Launch and close have different boundaries: the 35-second launch wrapper sits after Playwright's failure-producing 30-second launch timeout and never creates a success path, while the 25-second close wrapper sits before Playwright's success-hiding 30-second force-kill path. A launch client timeout is lifecycle failure even inside a scenario that expects a product startup rejection.
- Shutdown failures use the existing payload-safe `window-close` stage. No raw exception, DOM, manuscript content, screenshot, trace, video, or artifact is added to diagnostics.

## Unresolved matters or blockers

- macOS can be resolved only by the next normal paired Gate on the repaired, locally complete head. That transition requires a new Owner-observed account usage fact after the failed occurrence; Hosted CI will not be used as an iterative debugger.
- PR #177 and all downstream product implementation remain behind Issue #178 integration and lifecycle closure.

## Safe Resume Prompt

```text
Resume Issue #178 on Draft PR #180 at the final reviewed and Windows-locally-complete head. Push or confirm the head and update its evidence while Draft. Do not make Ready again until the Owner supplies a new contemporaneous account-wide Actions-minute fact after failed run 33592150101.
```
