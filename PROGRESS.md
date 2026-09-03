# Current checkpoint

## What's done

- Issue #194's bounded J-01 Gate-runner repair is implemented from exact `dev@6af45d19c8c9fb1ed8ee93d59331638ff2016726` in code commits `69638102711402a81d18d3ef895104fb324e8e0c` and `93ed082d17b3e9bc9bfe35b9c18d7b68a8965ff3`.
- `e2e/run-j01.mjs` now waits without side effects for exactly one enabled `导入稿件` action inside `[data-screen="landing"]`, performs one separately guarded click, assigns only the landing-to-target wait to `landing-target-transition`, gives the manuscript-reimport helper the fixed `reimport-pre-review` location, and returns the module-global location to existing `review` only after that helper's final successful assertion.
- `e2e/controller.mjs` replaces coarse `landing` with only `landing-action-ready`, `landing-target-transition`, and `reimport-pre-review`. `e2e/run.mjs`, `e2e/diagnose.mjs`, `e2e/run-all.mjs`, and `.github/workflows/e2e.yml` remain unchanged.
- Three Issue-bounded temporary mutations independently produced `LOCAL_DIAGNOSTIC_ONLY/J-01/landing-action-ready/journey-failure/not-completion`, `LOCAL_DIAGNOSTIC_ONLY/J-01/landing-target-transition/journey-failure/not-completion`, and `LOCAL_DIAGNOSTIC_ONLY/J-01/reimport-pre-review/journey-failure/not-completion`. Every probe byte was deleted; no diagnostic log or artifact was retained.
- The reimport location was re-exercised with an Issue-bounded helper-internal failure. A separate post-helper mutation reported `reimport-pre-review` before the stage-lifetime fix and `review` after it; both probes were deleted.
- On Windows 11 x64 with pinned Node `24.18.1` and pnpm `11.24.0`, syntax/diff/probe-cleanup checks and the real targeted J-01 passed after the follow-up. Exact head `ed8a991edd761db38922e8a4b6183ca5d010f83d` had previously passed fresh `doctor` → `bootstrap` → `build` → `e2e:all`; the new one-line stage-lifetime commit still requires its post-checkpoint exact-head sequence.

## What's next

- The Worker runs fresh pinned `doctor` → `bootstrap` → `build` → `e2e:all` on the committed post-checkpoint exact head. After it passes, the Commander re-resolves current `dev`, inspects this bounded branch, and owns push, Draft pull request creation/update, Ready transition, the single normal paired Windows/macOS Hosted Gate occurrence, and integration.
- A changing repair after review returns the pull request to Draft and restores fresh local completion before another Ready transition; Hosted CI is not used for diagnosis.

## Key decisions

- Readiness polling is side-effect-free. The exact scoped action is rechecked and clicked once in a separate renderer evaluation; that click evaluation is never retried.
- `landing-target-transition` ends immediately after the target screen appears; the existing `review` location owns subsequent primary pre-review work. The independent reimport helper uses `reimport-pre-review` throughout its own preparation path and restores `review` only after the review contract succeeds.
- The existing 30-second finite wait remains unchanged and no retry was added because deterministic local evidence did not implicate the timeout.
- The repair changes no renderer, Electron main, service, product semantics, Provider/network/credential behavior, dependency, SampleBook, workflow, Journey order, or payload-safe reporting boundary.

## Unresolved matters or blockers

- No code or scope blocker remains inside Issue #194's runner budget. Fresh post-checkpoint exact-head Local completion remains pending; the incident does not establish a separate product-side staging defect, and any future evidence requiring product changes stops outside this brief.
- Paired Hosted Gate evidence remains pending the Commander-owned Ready lifecycle.

## Safe Resume Prompt

```text
Worker: run fresh pinned doctor, bootstrap, build, and e2e:all on Issue #194's committed post-checkpoint exact head. If every current Journey passes, hand back to the Commander for exact-dev re-resolution, push, Draft/Ready lifecycle, and the one normal paired Windows/macOS Hosted Gate occurrence. Preserve the side-effect-free readiness wait, one guarded click, exact stage lifetimes, unchanged timeout/no retry, and payload-safe diagnostics.
```
