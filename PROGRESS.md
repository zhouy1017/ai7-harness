# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`; its remote head is still `432015585b250ed96ddbd2f35f2b87605537331d` while the validated local branch is two commits ahead.
- The accepted production repair remains the cached-live-`webContents.id` lifecycle change in `src/main/application.ts`. The public J-01 regression names Issue #178, creates two production-shaped Book windows, closes only the secondary target through the public control path, proves the surviving workspace completes public IPC, and reopens the closed Book with unique routing. Browser disconnect, renderer-session detach, and CDP timeout remain failure-only; no production global exception policy or raw diagnostic output was added.
- PR #180 transitioned Ready on checkpoint head `432015585b250ed96ddbd2f35f2b87605537331d`, creating exactly one new Hosted run `33627747930`. Route job `100239413778` passed; macOS J-01 job `100239446716` failed after about 105 seconds with fixed coarse result `J-01/review`; Windows job `100239446728` was cancelled by matrix fail-fast. The PR was immediately returned to Draft and no push occurred while Ready.
- Runs `33592150101`, `33606591737`, and `33627747930` establish a variable late-J-01 macOS-only Hosted failure class (`review` or `renderer-ready`), not paired-platform Gate evidence. A temporary payload-safe local timing probe mapped the roughly 113-second Windows J-01 tail and was fully removed.
- Commit `98363bbea7f1dd2db9aaf108574f12eed5d0583d` adds six closed, payload-safe late-review location labels only. It changes no timeout, behavior, workflow, Journey identity/order, dependency, public interface, or product output.
- Commit `4b0e7de3a3fa64fa9ce41b78712373744d3a1b68` makes the observed-bug regression terminal within J-01 so its deliberate multi-window lifecycle cannot contaminate unrelated import/recovery scenarios. It explicitly closes the reopened secondary, waits for the retained survivor, and proves another public route IPC before bounded product shutdown. Two independent reviews locked the same final blob `88d34645b0e81f983638ebd0b747288ac22005dd` and reported zero hard correctness/Spec/Standards findings.
- Fresh Windows Local completion passed on exact code head `4b0e7de3a3fa64fa9ce41b78712373744d3a1b68` with pinned Node 24.18.1, pnpm 11.24.0, and Electron 43.4.1: `doctor` -> ordinary `bootstrap` -> `build` -> `e2e:all`; J-01, J-02, J-08, J-12, and J-15 all passed. No new `ai7-j01-e2e-*` root and no matching AI7 Electron/Node process remained.
- No temporary diagnostic marker remains; syntax and `git diff --check` pass. The Owner explicitly removed Actions-minute availability as a Ready/Gate/integration precondition and will intervene manually if usage is anomalous.

## What's next

- Commit this checkpoint, push both local commits only while PR #180 remains Draft, update the PR evidence, and re-confirm exact `origin/dev`.
- Transition Ready once for one normal changed-head paired-platform Gate. This occurrence validates the locally completed fix; it is not a Hosted debugging loop. On any failure, immediately return Draft and stop further Ready/Gate iterations until the affected-platform loop is available or an exact authorized exception changes the route. On paired success, inspect exact jobs and duplicate count, then squash-merge #180.
- After #180 integrates, create the separate scoped #178 documentation-lifecycle Issue/branch/PR to archive the consumed checkpoint and replace root routing without the obsolete usage gate. After that lifecycle integrates, rebase and fully revalidate Draft PR #177 before its own Ready/Gate/integration path.
- Continue the authorized issue queue toward exact `sample1`'s local, human-attended recording handoff. Do not initiate a Provider call, recording, raw-material placement, or fixture admission under Issue #178.

## Key decisions

- The targeted ordering change tests the smallest remaining cross-scenario lifecycle-contamination hypothesis while preserving the exact public regression and fail-closed cleanup. A green Gate can support that isolation hypothesis but does not alone prove a deeper macOS implementation root cause.
- Hosted runs are validation evidence, not a debugger. A cancelled matrix leg proves nothing about that platform, and unchanged reruns are not an acceptable investigation loop.
- Timeout expansion, OS UI automation, raw exception/DOM/stack/content output, production global exception handling, and Provider/recording work remain out of scope.
- The Owner's latest instruction supersedes the earlier usage-fact gate only; it does not relax paired-platform Gate, privacy, branch/PR, lifecycle, Provider, recording, or `main`-promotion boundaries.

## Unresolved matters or blockers

- No local blocker remains. The exact changed-head Windows/macOS Hosted Gate result is pending.
- PR #177 and downstream product work remain ordered behind #178 integration and lifecycle closure. Exact `sample1` recording remains a later human-attended action, not an autonomous agent step.

## Safe Resume Prompt

```text
Resume Issue #178 on Draft PR #180. Push validated local commits 98363bb and 4b0e7de plus this checkpoint only while Draft, update PR evidence, refresh origin/dev, and transition Ready once for one normal paired-platform validation Gate. On any failure return Draft immediately and stop Hosted iterations until an affected-platform loop or exact authorized exception exists; on paired success squash-merge, complete the separate #178 lifecycle Issue/PR, then rebase and fully revalidate Draft PR #177. Actions-minute availability is not a gate by Owner instruction; do not make a Provider call or recording.
```
