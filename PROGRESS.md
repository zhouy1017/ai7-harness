# Current checkpoint

## What's done

- Issue #178 remains isolated in `C:\Users\Chooo\Playground\ai7-harness-worktrees\issue-178-main-crash` on `fix/178-electron-main-crash`, based on exact `dev@37347d6962984618732ca3aeb251dd100b430009`. Draft pull request #180 targets `dev`.
- The accepted product repair remains the cached-live-`webContents.id` lifecycle change in `src/main/application.ts`. The public J-01 observed-bug regression names Issue #178, creates two production-shaped Book windows, closes only the secondary target, proves the surviving workspace completes public IPC, and reopens the closed Book with unique routing.
- Pushed head `b9d41240e5e1dbd246b9c537493af92ff5b925e3` already contains the product repair, the public regression, fixed `window-close` failure classification, bounded Browser close/launch ownership, and prior Windows completion/review evidence.
- PR #180 transitioned Ready exactly once from that head. Hosted run `33606591737` attempt 1 had routing success (`100171881284`), macOS J-01 failure (`100171926813`), and Windows cancellation by matrix fail-fast (`100171926884`). macOS failed after about 106.43 seconds; Windows was making normal J-01 progress when cancelled. PR #180 was immediately returned to Draft and the failed occurrence was not rerun.
- Fixed-only local timing diagnosis locked the macOS failure to launch 42: launch 41 had durably acknowledged the initial import, launch 42 attached, and the 30-second `reimport-uncertain-landing` wait began at the same boundary as the Hosted failure. The prior `renderer-ready` label was stale because target attachment accepted the first single page even when it was still `about:blank`, and later evaluation errors were retried without advancing the admitted location.
- J-01 now admits a renderer only after the CDP target has the exact built product `file:` URL and the renderer exposes both the preload `window.ai7` carrier and `#screen`. The Issue #178 multi-window manager likewise ignores transient blank targets and returns only validated product renderers. A deterministic temporary probe first reproduced the old early blank-target attachment, then passed exact-product attachment and Browser-disconnect rejection; the probe is deleted.
- Browser disconnection, renderer-session detachment, and CDP timeout are failure-only signals. Root CDP acquisition and dispatch share an absolute 30-second bound, pending responses are rejected and removed on detach/timeout, and post-carrier waits do not retry terminal transport failures. Ordinary carrier-stage CDP context replacement remains retriable only inside that same absolute deadline, preventing a correct slow macOS navigation from being rejected immediately without creating a success fallback.
- The existing tampered-reimport expected-rejection branch cannot swallow launch timeout, CDP failure, session failure, or any failure after exact product carrier attachment. It accepts only a pre-carrier startup refusal: either no Browser was acquired or the acquired Browser disconnected before a product carrier existed. This preserves the measured tamper behavior while keeping the earlier, carrier-established Issue #178 two-window close regression strictly fail-closed.
- The exact landing boundary now advances to the already admitted `landing` location before the reimport wait. No raw exception, stack, DOM, IPC/SQL/manuscript content, arbitrary child output, screenshot, trace, video, or artifact is retained or emitted.
- The binding Change Brief amendment explicitly prohibits a new production `uncaughtException` policy. A temporary local exploration of that direction was rejected and fully removed; `src/main/application.ts` has no uncommitted delta beyond the already pushed stable-ID fix, and no new product interface, store, process, dependency, workflow, Journey, or global crash policy exists.
- All issue-specific debug instrumentation and deterministic probes are deleted. `git diff --check`, Node syntax validation, and the pinned build pass. The final controller candidate source hash is `4aef52dd3c0fad38e1dd3bf1aaf95195fe00639c`; repeated complete J-01 runs pass after the transient carrier correction. Independent final review reports zero hard Spec/correctness findings and zero hard Standards findings.
- Fresh Windows pre-commit completion on the final candidate passed in order with pinned Node 24.18.1 / pnpm 11.24.0: `doctor`, ordinary `bootstrap`, `build`, and `e2e:all`. J-01, J-02, J-08, J-12, J-15, and `LOCAL_COMPLETION/all/pass` completed. Post-run checks found no matching AI7 Electron/Node process and no newly retained J-01 root.
- The Owner's latest account-wide Actions usage observation is `40 / 3000` minutes. It records and is consumed by the already completed Ready/Gate occurrence; it is not authorization for another Ready transition.

## What's next

- Commit the reviewed controller repair and this checkpoint, rerun the exact-head Windows completion sequence from a clean worktree, push while PR #180 remains Draft, and update the PR evidence.
- Before any subsequent Ready transition, obtain a new contemporaneous Owner-observed account-wide Actions-minutes fact. Do not rerun Hosted CI unchanged.

## Key decisions

- Run `33606591737` is a blocking macOS Journey failure, not paired-platform Gate evidence. It is never rerun unchanged, and the cancelled Windows job proves nothing about Windows Gate completion.
- The Owner's binding Issue amendment controls the apparent ambiguity in the original brief: Issue #178 fixes and observes the exact normal-window-close defect; it does not add a generic production uncaught-exception handler, crash reporter, telemetry, or OS-dialog automation.
- An initial blank page is a transient launch carrier, not the product renderer. Success requires the exact product URL plus preload and DOM carriers. Disconnect, detach, timeout, or loss after carrier attachment is always failure; no retry changes such a failure into success.
- Carrier-stage CDP response errors may reflect normal navigation context replacement, so they retry only within the original absolute 30-second attach budget. The budget never resets and terminal lifecycle signals remain immediate.
- The tamper scenario's measured pre-carrier Browser disconnect is its expected startup refusal, not a general Browser-success rule. Once the product carrier attaches, the same disconnect is fatal. Generic pre-carrier crash policy remains deliberately out of Issue #178 under the binding amendment.
- Hosted CI remains an integration projection, not an iterative debugger. `40 / 3000` is historical evidence for the consumed occurrence; a new observation is required before Ready.

## Unresolved matters or blockers

- macOS can be resolved only by the next normal paired Gate on the new committed head. That transition is blocked only on a new Owner-observed usage fact after the failed occurrence.
- PR #177 and downstream product implementation remain behind Issue #178 integration and lifecycle closure. Provider calls, sample1 recording, and restricted fixture work remain outside this Issue.

## Safe Resume Prompt

```text
Resume Issue #178 on Draft PR #180. Commit the reviewed J-01 carrier/lifecycle repair, run fresh exact-head Windows doctor -> ordinary bootstrap -> build -> e2e:all, push and update evidence while Draft. Do not make Ready or rerun Hosted CI until the Owner supplies a new contemporaneous account-wide Actions-minutes fact after run 33606591737; 40/3000 is already consumed.
```
