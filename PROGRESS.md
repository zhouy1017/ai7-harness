# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`.
- The accepted production repair remains the cached-live-`webContents.id` lifecycle change in `src/main/application.ts`. The public J-01 regression names Issue #178, creates two production-shaped Book windows, closes only the secondary target through the public control path, proves the surviving workspace completes public IPC, and reopens the closed Book with unique routing.
- Pushed implementation commit `181ef6af0faa28f2b24718d3d8bde0be93badf0e` contains the production repair, public regression, bounded Browser ownership, and exact product-renderer/CDP carrier lifecycle. It has independent review with zero hard Spec/correctness and zero hard Standards findings. Fresh Windows exact-head `doctor` -> ordinary `bootstrap` -> `build` -> `e2e:all` passed with pinned Node 24.18.1 / pnpm 11.24.0, all five Journeys, clean process/root cleanup, and a clean worktree.
- PR #180 transitioned Ready on checkpoint head `432015585b250ed96ddbd2f35f2b87605537331d`, creating exactly one new Hosted run `33627747930`. Route job `100239413778` passed; macOS J-01 job `100239446716` failed after about 105 seconds with the fixed coarse result `J-01/review`; Windows job `100239446728` was cancelled by matrix fail-fast while still in J-01. The PR was immediately returned to Draft and no push occurred while Ready.
- This reproduces the macOS-only Hosted failure class from attempts `33592150101` and `33606591737`: bootstrap/build pass, J-01 fails after about 95-107 seconds, and the other platform is cancelled. The former launch-42 / `reimport-uncertain-landing` theory is now falsified because current head advances to admitted `landing` before that wait, while the new result remained `review`.
- A local-only fixed timing probe mapped the 113-second Windows J-01 tail to six review groups: continuity, legacy recovery, before-paint recovery, before-commit recovery, after-commit recovery, and uncertain recovery. It emitted only fixed stage/time/scenario names, passed, and was fully removed. Direct J-01 and the exact `e2e:diagnose -- --journey J-01` feedback loop both passed after removal.
- The current uncommitted synchronized diagnostic delta adds only six payload-safe J-01 allowlist locations and lets late `runJourney` callers select their fixed review group. It does not emit an exception, stack, DOM, IPC/SQL/manuscript content, arbitrary child output, screenshot, trace, video, or artifact; it does not change production behavior, timeout values, workflows, Journey identity/order, dependencies, or public interfaces. `git diff --check` passes and no temporary debug marker remains.
- Browser disconnect, renderer-session detach, and CDP timeout remain failure-only. Carrier-stage ordinary CDP response errors retry only inside the same absolute deadline. The tamper branch still accepts only its pre-carrier expected startup refusal; every error after exact product carrier attachment remains fatal. No production `uncaughtException` policy exists.
- The Owner has now explicitly removed Actions-minute availability as a Ready/Gate/integration precondition and will intervene manually if usage is anomalous. Cached `40 / 3000` is historical only and no longer blocks this Issue or downstream authorized work.

## What's next

- Review, commit, and push the six-location payload-safe J-01 diagnostic delta while PR #180 remains Draft; update the PR evidence and refresh exact `origin/dev`.
- Transition Ready once to obtain the next normal paired Gate. If macOS fails, return Draft immediately and use the one fixed late-review group to build the smallest local runner fix; if both platforms pass, inspect the exact jobs and duplicate count, then squash-merge #180.
- After #180 integrates, create the separate scoped #178 documentation-lifecycle Issue/PR to archive this consumed checkpoint and replace root routing without carrying the obsolete usage gate. Only then rebase and revalidate Draft PR #177.

## Key decisions

- Run `33627747930` is blocking failure evidence, not paired-platform Gate evidence. A cancelled Windows job proves nothing about Windows Hosted completion.
- The next Hosted occurrence is a bounded diagnostic continuation after a changed head, not an unchanged rerun. Its only new observation surface is a closed fixed-location vocabulary already authorized by the binding Issue amendment.
- Timeout expansion, OS UI automation, raw exception output, production global exception handling, and Provider/recording work remain out of scope.
- The Owner's latest instruction supersedes the earlier usage-fact gate only; it does not relax paired-platform Gate, privacy, branch/PR, lifecycle, Provider, recording, or `main`-promotion boundaries.

## Unresolved matters or blockers

- The exact macOS late-review group is unknown until the changed head receives one normal paired Gate. There is no remaining Actions-usage blocker.
- PR #177 and downstream product work remain ordered behind #178 integration and lifecycle closure. Provider calls, exact sample1 recording, and restricted fixture admission remain outside Issue #178.

## Safe Resume Prompt

```text
Resume Issue #178 on Draft PR #180. Review and commit the payload-safe late-review diagnostic delta, push only while Draft, refresh origin/dev, and transition Ready once for a changed-head paired Gate. On any failure return Draft immediately and diagnose the exact fixed group; on paired success squash-merge, complete the separate #178 lifecycle Issue/PR, then rebase and fully revalidate Draft PR #177. Actions-minute availability is no longer a gate by Owner instruction; do not make a Provider call or recording.
```
