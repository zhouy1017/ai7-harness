# Progress

## What's done

- Replaced the current routing checkpoint for Issue #71 at [`PROGRESS.md`](PROGRESS.md) and [`HANDOFF.md`](HANDOFF.md) only; no product, domain, implementation, dependency, workflow, or authority change was made.
- Routed the second bounded Issue #36 stop: open enhancement-only work whose current body explicitly requires a new Owner decision; labels remain `enhancement` only. Blocker comment: [#issuecomment-5421713884](https://github.com/zhouy1017/ai7-harness/issues/36#issuecomment-5421713884).
- Preserved exact input identity for regular [`SampleBooks/sample1.docx`](SampleBooks/sample1.docx): 29,550 bytes; SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- Preserved payload-free structural evidence: exactly one body-level terminal `sectPr` with attributes `rsidR`/`rsidRPr` and children `pgSz`/`pgMar`/`cols`/`docGrid`; 266 non-empty `rPr` nodes with `rFonts`/`sz`/`szCs`.
- Preserved current [`src/service/docx.ts`](src/service/docx.ts) behavior: every non-empty `rPr` is classified as `inline-styles`, so accepting the terminal section exposes both `sections` and `inline-styles` degradation. No RED/GREEN, doctor/bootstrap/build/E2E, migration, runtime derivative, artifact, provider/export, dependency, or code/doc implementation diff occurred.
- Archive sweep: none. The Worker's direct Issue #36 live read hit GitHub GraphQL EOF after Issue #71; the Commander-supplied complete current API snapshot and comments were used for this checkpoint.

## What's next

- The Owner must choose exactly one path before any implementation dispatch: (1) revise Issue #36 to admit this same sample's exact `inline-styles` degradation, bind both exact degradation items to explicit initially-unselected editor intent and one atomic Import Degradation Decision, and reconcile exact overlap with Issue #37; or (2) retain the one-category terminal-section boundary and designate another exact admitted DOCX.
- After that choice is recorded against the intended target, the Commander may revise the Change Brief and re-dispatch only within its resulting authority. Keep Issue #36 blocked pending that new decision.

## Key decisions made

- This Issue #71 task is routing only and targets `dev` from exact base `3ec35180693867bfb499ce3fd8babd452923a548`; `main` is not an integration target.
- Issue #71 T1 Worker binding: requested `claude-haiku-4-5-20251001@low`; actual `gpt-5.6-luna@medium`; fallback because the Owner explicitly reported local Claude disabled.
- Worker binding record: requested `claude-opus-5@high`; actual `gpt-5.6-sol@xhigh`; T3; fallback because the Owner explicitly reported local Claude disabled.
- The bounded tracer is not full J-01. Issue #37 retains all ungranted fidelity/identity/relationship scope; no other fidelity class, provider processing, external export, dependency, release, push, merge, publication, or `main` authority is granted.

## Unresolved matters or blockers

- Owner choice between the exact inline-styles revision with editor-intent/atomic-decision and #37 reconciliation, or another admitted DOCX, remains unresolved.
- No product gate is applicable: validation is limited to exact two-path scope, links/path checks, and `git diff --check`.

## Resume Prompt

As Commander, record the Owner's exact choice for Issue #36's second degradation stop against the intended `dev` target, then revise/re-dispatch only the resulting bounded authority while preserving the not-full-J01, #37, provider/export, dependency, release, and `main` boundaries.
