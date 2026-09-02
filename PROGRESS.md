# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`; its unchanged remote head is `3d6d8116dd6367b3a62ab9174e2dede9849f79bd`, and local correction code commit is `3fc6d5e0ca92e39a6be809f3d5d331f4a5253835`.
- The branch retains the bounded P0 repair: `src/main/application.ts` caches a live `webContents.id` before destruction; J-01 proves closing one Book window leaves another usable and uniquely reopenable; J-12 uses the product's public Book route for native focus and has bounded, cleanup-preserving Browser/CDP/service teardown. Setup Node no longer reads an Electron-created credential. No global exception swallowing, OS-dialog automation, raw diagnostic output, timeout expansion, Provider call, or private material was added.
- Ready Gate run `33665299637` at remote head `3d6d8116dd6367b3a62ab9174e2dede9849f79bd` passed routing and both builds, then failed payload-safely on macOS at `J-01/review`; Windows was cancelled by matrix fail-fast. PR #180 returned to Draft and the failed head was not rerun.
- Bounded local timing and independent comparison localized that recurrence to completion-paint observation after repeated launches. The Owner-authorized Issue amendment is https://github.com/zhouy1017/ai7-harness/issues/178#issuecomment-5514474122.
- The corrected renderer binds acknowledgement to the exact imported screen and commit element. A visibility or product-ready transition invalidates the current two-frame pair and restarts the existing visible-ready proof; a screen replacement, `data-screen` change, commit-node replacement, or commit-ID change terminates the obsolete observer. Normal asynchronous content inside the same result screen remains allowed.
- The admitted Issue #178 regression now deepens J-01's existing before-paint/restart scenario instead of adding a Journey, root, launch, or timeout. It deterministically proves both hidden-to-visible frame-pair invalidation and screen/commit away-and-back invalidation. On the prior renderer it failed at fixed `J-01/completion-visibility-transition`; on the correction it passed complete J-01. Both runs left zero matching process and zero current test root, and every temporary probe was removed.
- Fresh Windows Local completion passed on clean exact head `d74eaa7bd205471e2195e3e2f62453efaf41655f` with Node 24.18.1, pnpm 11.24.0, and Electron 43.4.1: `doctor ->` ordinary `bootstrap -> build -> e2e:all`; J-01, J-02, J-08, J-12, J-15, and final `LOCAL_COMPLETION/all/pass` all passed. Postconditions found zero matching process, zero current test root created by this validation, and zero temporary probe.
- A fresh-context, strictly read-only advisory two-axis review at `dff08b07a609a239f9448dc045933238cf301124` found zero Spec/authorization or material-scope findings, zero code/structure findings, zero Shotgun Surgery, and zero Leaky Abstraction. Standards found one process item: Windows completion must bind the final checkpoint head rather than its documentation-only parent. This final checkpoint records that remediation; its resulting exact HEAD must receive the full Windows completion with no later repository edit before Ready. Reviewer record: T3; requested/actual Codex `gpt-5.6-sol` at `ultra`; class floor met; fresh-context, read-only, non-author independent; no fallback. Review remains advisory rather than a Gate.
- Actions-minute availability is not a development, Ready, Gate, or integration precondition under the Owner's current instruction. The Owner will monitor usage; paired-platform Gate, privacy, lifecycle, Provider/recording, and `main` boundaries are unchanged.

## What's next

- Complete `doctor ->` ordinary `bootstrap -> build -> e2e:all` on this final checkpoint's exact resulting HEAD, then leave the repository unchanged and record that SHA/outcome in Draft PR #180 so the completion evidence and Ready candidate are identical.
- Re-resolve `origin/dev`, update PR #180 while Draft, push the exact validated head, then make the single normal Ready transition for its paired Windows/macOS Gate. Integrate only if the authoritative Gate completes green.
- After #180 integrates, execute its separately scoped documentation lifecycle work, then rebase and fully revalidate Draft PR #177. Record the Issue #176 Actions-usage supersession before that PR's Ready transition and continue toward exact `sample1`'s local human-attended recording handoff.

## Key decisions

- Completion acknowledgement is authority only after the same imported result remains visible and product-ready across two uninterrupted animation frames. A transient eligibility change retries that proof; restored identity does not revive an obsolete observer.
- The observed-bug regression remains inside supported Journey J-01 and uses only public, provider-free test material. Actual Provider calls, exact `sample1` recording, raw-material placement, fixture admission, publication, release, and promotion to `main` remain outside autonomous execution.
- Hosted CI remains validation evidence rather than a debugger. A partial or cancelled matrix is not paired Gate evidence, and an unchanged ambiguous failure is not rerun.

## Unresolved matters or blockers

- No authority or local-debugging blocker is known. Final-checkpoint Windows completion is the next bounded action; after it is recorded externally without another repository edit, only the changed-head paired Gate remains outstanding for #180 integration.
- GitHub API reads and writes have intermittently returned EOF; verify any uncertain external mutation before retrying so no duplicate comment, push, or state transition is created.

## Safe Resume Prompt

```text
PR #180 remains Draft. Remote head 3d6d8116dd6367b3a62ab9174e2dede9849f79bd has one failed Gate and was not rerun. Correction commit 3fc6d5e0ca92e39a6be809f3d5d331f4a5253835 fixes the completion-paint visibility/identity race under Issue #178 amendment 5514474122; its permanent J-01 regression is red on the prior renderer and green on the correction. A fresh advisory review at dff08b07a609a239f9448dc045933238cf301124 found no code, Spec, scope, or smell issue and one process item: validate this final checkpoint's exact resulting HEAD. Run fresh Windows doctor/bootstrap/build/e2e:all, make no later repository edit, record the exact SHA/outcome in Draft PR #180, then push only while Draft and permit the single changed-head paired Gate. If the PR already records a passing completion for the current exact HEAD, do not rerun or edit the repository. Do not autonomously call a Provider, record exact sample1, admit restricted material, publish, release, or promote main.
```
