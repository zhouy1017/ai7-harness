# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`; local and remote head are exact `1f8470af43174ddcf3c5f46fb2ffc18924f53fe5` with a clean worktree.
- The accepted production repair remains the cached-live-`webContents.id` lifecycle change in `src/main/application.ts`. The public J-01 regression names Issue #178, creates two production-shaped Book windows, closes only the secondary target through the public control path, proves the surviving workspace completes public IPC, and reopens the closed Book with unique routing. Browser disconnect, renderer-session detach, and CDP timeout remain failure-only; no production global exception policy or raw diagnostic output was added.
- PR #180 transitioned Ready on checkpoint head `432015585b250ed96ddbd2f35f2b87605537331d`, creating exactly one new Hosted run `33627747930`. Route job `100239413778` passed; macOS J-01 job `100239446716` failed after about 105 seconds with fixed coarse result `J-01/review`; Windows job `100239446728` was cancelled by matrix fail-fast. The PR was immediately returned to Draft and no push occurred while Ready.
- Runs `33592150101`, `33606591737`, and `33627747930` establish a variable late-J-01 macOS-only Hosted failure class (`review` or `renderer-ready`), not paired-platform Gate evidence. A temporary payload-safe local timing probe mapped the roughly 113-second Windows J-01 tail and was fully removed.
- Commit `98363bbea7f1dd2db9aaf108574f12eed5d0583d` adds six closed, payload-safe late-review location labels only. It changes no timeout, behavior, workflow, Journey identity/order, dependency, public interface, or product output.
- Commit `4b0e7de3a3fa64fa9ce41b78712373744d3a1b68` makes the observed-bug regression terminal within J-01 so its deliberate multi-window lifecycle cannot contaminate unrelated import/recovery scenarios. It explicitly closes the reopened secondary, waits for the retained survivor, and proves another public route IPC before bounded product shutdown. Two independent reviews locked the same final blob `88d34645b0e81f983638ebd0b747288ac22005dd` and reported zero hard correctness/Spec/Standards findings.
- Fresh Windows Local completion passed on exact code head `4b0e7de3a3fa64fa9ce41b78712373744d3a1b68` with pinned Node 24.18.1, pnpm 11.24.0, and Electron 43.4.1: `doctor` -> ordinary `bootstrap` -> `build` -> `e2e:all`; J-01, J-02, J-08, J-12, and J-15 all passed. No new `ai7-j01-e2e-*` root and no matching AI7 Electron/Node process remained.
- The single changed-head validation occurrence was run `33634503216`. Route job `100261852241` passed. macOS job `100261910922` passed J-01, J-02, and J-08, then failed after about 64 seconds at fixed `J-12/close-risk-cross-window-focus`; J-15 was skipped. Windows job `100261910640` passed J-01 and was cancelled by matrix fail-fast during J-02. PR #180 returned to Draft immediately and the failed occurrence was not rerun.
- The macOS J-01 pass supports terminal isolation of the deliberate multi-window regression. The later J-12 failure is outside #178's binding path budget: it happens before any window closes, while J-12 relies on CDP `Page.bringToFront` plus a 60-second native-focus wait. Issue #181 now owns the separate harness-only correction to reuse public `openBookWorkbench -> focusOwnedWindow`; its complete Change Brief and binding Owner-authorization application explicitly precede #178 revalidation.
- No temporary diagnostic marker remains; syntax and `git diff --check` pass. The Owner explicitly removed Actions-minute availability as a Ready/Gate/integration precondition and will intervene manually if usage is anomalous.

## What's next

- Keep PR #180 Draft and do not rerun its failed head. Implement Issue #181 from exact current `dev` in its own branch/worktree: deterministic local fault-injection red, public-focus green, deletion of the probe, Windows full Local completion, one normal paired Gate, and integration only if green.
- After #181 integrates, rebase #180 onto the new exact `dev`, re-resolve authority, rerun full Windows Local completion, and allow one changed-head paired Gate. On paired success inspect exact jobs and duplicate count, then squash-merge #180.
- After #180 integrates, create the separate scoped #178 documentation-lifecycle Issue/branch/PR to archive the consumed checkpoint and replace root routing without the obsolete usage gate. After that lifecycle integrates, rebase and fully revalidate Draft PR #177 before its own Ready/Gate/integration path.
- Continue the authorized issue queue toward exact `sample1`'s local, human-attended recording handoff. Do not initiate a Provider call, recording, raw-material placement, or fixture admission under Issue #178.

## Key decisions

- The targeted ordering change tests the smallest remaining cross-scenario lifecycle-contamination hypothesis while preserving the exact public regression and fail-closed cleanup. A green Gate can support that isolation hypothesis but does not alone prove a deeper macOS implementation root cause.
- Run `33634503216` proves the #178 public J-01 regression now passes on macOS, but it is still a failed Gate because J-12 failed and Windows was cancelled. No partial result is integration evidence.
- The J-12 focus failure is a separately authorized harness defect, not a reason to widen #178. Its fix must replace the harness-only focus surrogate without weakening the focus or close-risk assertions and without changing product code.
- Hosted runs are validation evidence, not a debugger. A cancelled matrix leg proves nothing about that platform, and unchanged reruns are not an acceptable investigation loop.
- Timeout expansion, OS UI automation, raw exception/DOM/stack/content output, production global exception handling, and Provider/recording work remain out of scope.
- The Owner's latest instruction supersedes the earlier usage-fact gate only; it does not relax paired-platform Gate, privacy, branch/PR, lifecycle, Provider, recording, or `main`-promotion boundaries.

## Unresolved matters or blockers

- Issue #181 is the explicit predecessor required to unblock #180. No further Hosted iteration on the current #180 head is permitted.
- PR #177 and downstream product work remain ordered behind #178 integration and lifecycle closure. Exact `sample1` recording remains a later human-attended action, not an autonomous agent step.

## Safe Resume Prompt

```text
Keep Issue #178 / PR #180 Draft at exact head 1f8470a and do not rerun failed Gate 33634503216. Complete separately authorized Issue #181 from exact dev: use its bounded local fault-injection red/green, public focus path, full Windows completion, one paired Gate, and integration. Then rebase #180 onto that exact dev, repeat full Windows completion and one changed-head paired Gate; on success squash-merge, complete #178 lifecycle, and rebase/revalidate Draft PR #177. Actions-minute availability is not a gate; do not make a Provider call or recording.
```
