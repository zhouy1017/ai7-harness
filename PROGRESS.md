# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`; exact code/checkpoint head `c77f6b3402e21d7a86e3d75895deb1bf13469dec` is pushed, and this local result checkpoint is the only pending delta.
- The production repair in `src/main/application.ts` caches the live `webContents.id` before window destruction and uses that stable identity for registry insertion and closed cleanup. The public J-01 regression creates two production-shaped Book windows, closes only the secondary through the public control path, proves the survivor still completes public IPC, uniquely reopens the closed Book, then closes the secondary and re-proves the survivor before bounded shutdown. No global exception swallowing, OS-dialog automation, raw output, timeout expansion, or private material was added.
- Exact code head `4b0e7de3a3fa64fa9ce41b78712373744d3a1b68` passed fresh Windows Local completion with pinned Node 24.18.1, pnpm 11.24.0, and Electron 43.4.1: `doctor -> bootstrap -> build -> e2e:all`; J-01, J-02, J-08, J-12, and J-15 all passed, with no new test root or matching residual process.
- Changed-head Gate run `33634503216` passed Route and macOS J-01/J-02/J-08, then failed at unchanged `J-12/close-risk-cross-window-focus`; Windows passed J-01 and was cancelled by fail-fast during J-02. PR #180 returned to Draft immediately, and that failed occurrence was not rerun.
- Issue #181 isolated the J-12 harness defect: CDP `Page.bringToFront` was being treated as a native-window focus contract. A tagged temporary fault injection made the old setup fail closed; replacing it with Book B's existing public `openBookWorkbench` self-route passed complete J-12 locally while preserving B-focused/A-unfocused and all close-risk assertions. Every temporary marker was removed. Two independent reviews reported zero hard findings and locked final file blob `11fd6c18a95f364f9306eb66c66ebd868bb0a410`.
- Full Windows completion on the independent #181 branch reproduced Issue #178's native Electron `Error` dialog in J-01 and blocked unattended progress. The dialog was not clicked or swallowed: the owning controller was interrupted, returned fixed `J-01/interrupted`, and all matching processes were recovered. Because the Hosted workflow runs only for PRs targeting `dev`, #180 needed #181 while #181 needed #178, and neither a stacked feature-base PR nor a Gate waiver could resolve the cycle.
- The Owner's binding #178 amendment at https://github.com/zhouy1017/ai7-harness/issues/178#issuecomment-5510957394 resolves that exact cycle: #180 remains the sole dev-facing PR, only the reviewed seven-line `e2e/run-j12.mjs` hunk is absorbed under #178 authority, and #181 is superseded without PR, push, or integration. Commit `918c0d2` reapplies the hunk directly rather than merging or cherry-picking #181; the resulting file hash is the locked `11fd6c18a95f364f9306eb66c66ebd868bb0a410`.
- The supersession was recorded at https://github.com/zhouy1017/ai7-harness/issues/181#issuecomment-5511080274 and Issue #181 was closed as not planned. Its local branch and commits remain unpushed, non-canonical evidence.
- Fresh Windows Local completion passed on exact combined head `c77f6b3402e21d7a86e3d75895deb1bf13469dec` with the pinned toolchain: `doctor ->` ordinary `bootstrap -> build -> e2e:all`; J-01, J-02, J-08, J-12, and J-15 all passed. Postconditions found zero new `ai7-j01-e2e-*` roots and zero matching AI7 Electron/Node processes.
- Actions-minute availability is no longer a development, Ready, Gate, or integration precondition. The Owner will monitor usage and intervene only if needed; paired-platform Gate, privacy, lifecycle, Provider/recording, and `main` boundaries are unchanged.

## What's next

- Commit and Draft-push this result checkpoint, then update PR #180's closure delta with the exact Local completion evidence.
- Transition #180 Ready exactly once and monitor the one changed-head paired-platform Gate. Any Journey/platform failure returns the PR to Draft with no unchanged rerun; exact Windows and macOS success permits squash integration.
- After #180 integration, execute its separately scoped documentation lifecycle Issue/PR, then rebase and fully revalidate Draft PR #177. Continue the authorized queue toward exact `sample1`'s local, human-attended recording handoff.

## Key decisions

- J-12 now asks the product's public Book route to focus its requesting native window instead of asking CDP to activate a renderer target. This changes no product focus behavior and weakens none of the existing focus or close-risk assertions.
- The #181 branch and its commits are diagnostic evidence only. Canonical implementation is the independently applied exact hunk in #178 under the binding amendment.
- Hosted CI remains validation evidence, never a debugger. A partial/cancelled matrix and an unchanged rerun provide no integration authority, and no usage reading can substitute for paired-platform Gate success.
- Actual Provider calls, sample1 recording, raw-material placement, fixture admission, release, and promotion to `main` remain outside autonomous execution.

## Unresolved matters or blockers

- No design, implementation, or local-validation blocker remains. The one changed-head paired Gate is still required before #180 may integrate.
- GitHub API reads/writes have intermittently returned EOF; continue verifying any uncertain external write before retrying so no duplicate comment or state transition is created.

## Safe Resume Prompt

```text
Fresh Windows completion passed on exact #180 combined head c77f6b3. Commit and Draft-push this result checkpoint, update the PR closure delta, then make #180 Ready once and require one all-green paired-platform Gate before squash merge. On any failure return Draft and do not rerun unchanged. Then complete #178 lifecycle, rebase/revalidate PR #177, and continue toward the human-attended sample1 recording handoff. Actions minutes are not a gate; do not autonomously call a Provider or record.
```
