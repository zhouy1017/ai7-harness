# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Pull request #180 targets `dev`, is back in Draft, and its unchanged remote head is `c248ebe191c76d5dca09a66a9d1179d95e70a68a`; local correction code commit is `602c63449b79454fa43bdfe627a033ba2c65dc31`.
- The branch retains the bounded P0 repair: `src/main/application.ts` caches a live `webContents.id` before destruction; J-01 proves closing one Book window leaves another usable and uniquely reopenable; J-12 uses the product's public Book route for native focus and has bounded, cleanup-preserving Browser/CDP/service teardown. Setup Node no longer reads an Electron-created credential. No global exception swallowing, OS-dialog automation, raw diagnostic output, timeout expansion, Provider call, or private material was added.
- Changed-head Gate `33680226599` at `c248ebe191c76d5dca09a66a9d1179d95e70a68a` passed routing and both builds, then macOS failed payload-safely at coarse `J-01/review` after about 94 seconds; Windows was cancelled by matrix fail-fast. PR #180 returned to Draft and the failed head was not rerun. Evidence and the bounded inference are recorded at https://github.com/zhouy1017/ai7-harness/issues/178#issuecomment-5516373802 under the existing amendment https://github.com/zhouy1017/ai7-harness/issues/178#issuecomment-5514474122.
- A removed fixed-metadata timing probe showed the coarse location covers eleven default imports; its sixth entry occurs near 63 seconds locally, so both macOS failures near 94/98 seconds most strongly match the existing 30-second completion wait after sequential launches. The remaining liveness gap was that a visibility/readiness transition recorded invalidation but did not cancel a pending animation frame that macOS may stop advancing.
- The corrected renderer keeps presentation and eligibility ownership distinct. A screen or commit transition permanently aborts the obsolete observer. Each two-frame attempt has a separate cancellation signal, so visibility/readiness transition cancels any pending frame, returns to the existing visible-ready wait, and then requires two fresh frames. Hidden/not-ready state cannot acknowledge, and normal asynchronous descendants remain allowed.
- The admitted J-01 regression still uses the existing before-paint root, launch, restart, timeout, and fixed location. It now leaves the stale second frame unreleased, proves that transition cancels it, requires a different retry-frame ID, and retains screen/commit away-and-back termination. It is RED on `c248ebe191c76d5dca09a66a9d1179d95e70a68a` at `J-01/completion-visibility-transition` and GREEN through complete J-01 on `602c63449b79454fa43bdfe627a033ba2c65dc31`. Postconditions found zero matching process, zero current test root, and zero temporary probe.
- A fresh-context, strictly read-only advisory review of `c248ebe191c76d5dca09a66a9d1179d95e70a68a..602c63449b79454fa43bdfe627a033ba2c65dc31` found zero Spec/authorization or material-scope findings, zero Standards code findings, zero Shotgun Surgery, and zero Leaky Abstraction. Reviewer record: T3; requested/actual Codex `gpt-5.6-sol` at `ultra`; class floor met; fresh-context, read-only, non-author independent; no fallback. Review remains advisory rather than a Gate.
- Actions-minute availability is not a development, Ready, Gate, or integration precondition under the Owner's current instruction. The Owner will monitor usage; paired-platform Gate, privacy, lifecycle, Provider/recording, and `main` boundaries are unchanged.

## What's next

- Complete `doctor ->` ordinary `bootstrap -> build -> e2e:all` on this final checkpoint's exact resulting HEAD, then leave the repository unchanged and record that SHA/outcome in Draft PR #180 so the completion evidence and Ready candidate are identical.
- Re-resolve `origin/dev`, update PR #180 while Draft, push the exact validated head, then make the single normal Ready transition for its paired Windows/macOS Gate. Integrate only if the authoritative Gate completes green.
- After #180 integrates, execute its separately scoped documentation lifecycle work, then rebase and fully revalidate Draft PR #177. Record the Issue #176 Actions-usage supersession before that PR's Ready transition and continue toward exact `sample1`'s local human-attended recording handoff.

## Key decisions

- Completion acknowledgement is authority only after the same imported result remains visible and product-ready across two uninterrupted animation frames. A transient eligibility change cancels the current frame attempt and retries that proof with fresh frames; restored identity does not revive an obsolete observer.
- The observed-bug regression remains inside supported Journey J-01 and uses only public, provider-free test material. Actual Provider calls, exact `sample1` recording, raw-material placement, fixture admission, publication, release, and promotion to `main` remain outside autonomous execution.
- Hosted CI remains validation evidence rather than a debugger. A partial or cancelled matrix is not paired Gate evidence, and an unchanged ambiguous failure is not rerun.

## Unresolved matters or blockers

- No authority or local-debugging blocker is known. Final-checkpoint Windows completion is the next bounded action; after it is recorded externally without another repository edit, only the changed-head paired Gate remains outstanding for #180 integration.
- GitHub API reads and writes have intermittently returned EOF; verify any uncertain external mutation before retrying so no duplicate comment, push, or state transition is created.

## Safe Resume Prompt

```text
PR #180 is Draft. Remote head c248ebe191c76d5dca09a66a9d1179d95e70a68a has failed Gate 33680226599 and was not rerun. Local correction 602c63449b79454fa43bdfe627a033ba2c65dc31 cancels an invalidated pending completion frame under Issue #178 amendment 5514474122; the strengthened existing J-01 regression is red on c248ebe and green on the correction, with fresh advisory review reporting no Spec, scope, code, or smell finding. Run fresh Windows doctor/bootstrap/build/e2e:all on this final checkpoint's exact resulting HEAD, make no later repository edit, record exact SHA/outcome in Draft PR #180, then push only while Draft and permit one changed-head paired Gate. If the PR already records a passing completion for the current exact HEAD, do not rerun or edit the repository. Do not autonomously call a Provider, record exact sample1, admit restricted material, publish, release, or promote main.
```
