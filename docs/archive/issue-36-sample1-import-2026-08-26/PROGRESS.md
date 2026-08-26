# Progress

## What's done

- Sole writable T3 Worker on `feat/36-import-sample1-degradation` at exact `dev@1249ed8f1b4bc57a30fa95adf36ada1d7e89d9ae`, targeting `dev` only; complete live Issue/authority/skill reading and exact existing-owner mapping are complete.
- Verified immutable `SampleBooks/sample1.docx`: regular file, 29,550 bytes, SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- Replaced the existing J-01 controller's runtime synthetic DOCX generator and clean assertions with exact sample1 selection and payload-free public assertions for source identity, canonical fidelity, initially-unselected complete-set acceptance, linked import record, 32-of-97 window, and durable journal acknowledgement in `e2e/run-j01.mjs`.
- Exact Node 24.18.1/pnpm 11.24.0 `doctor`, `bootstrap`, and `build` passed. Required product-interface RED exited 1 at only `J-01/stage-target`; no payload, DB read, screenshot, trace, video, artifact, or derivative was emitted.
- `src/service/docx.ts` retains exact clean behavior, binds degraded compatibility to exact sample1 identity, accepts only its known terminal body `sectPr` shape, counts one degraded section without creating manuscript text, and centrally validates the complete authoritative eight-row projection including labels/details.
- `src/shared/protocol.ts`, `src/main/service-client.ts`, `src/service/index.ts`, and `src/service/store.ts` now carry protocol v2 source-byte identity and boolean-only acceptance; preview has a null digest/no state advance, finalization binds canonical `ai7.new-book-import-review/2`, and commit recomputes the digest before mutation.
- The existing SQLite owner now creates v2 roots, forward-migrates v1 constrained tables while preserving clean rows, and atomically links the exact fidelity review, canonical degradation decision, and manuscript import record with graph postconditions. Idempotent result hydration validates the persisted graph and normalizes legacy clean result JSON in memory.
- `src/renderer/index.ts` now exposes source identity, all authoritative degradation items, one initially-unselected acceptance, no commit before acceptance, degraded commit wording, and linked decision/review/import truth in the product record. Exact `build` is GREEN after this integrated slice.
- The exact root `J-01` E2E is GREEN through the real renderer/main/separate service/composed dormant provider-free Harness/store/window/journal path, including the initial unchecked acceptance, linked degraded records, 32-of-97 bounded window, and durable journal acknowledgement.
- A disposable diagnostic exercised the actual v1→v2 initializer: all v1 clean review/category/import/legacy-result values and null decision links remained byte-for-byte equal, `user_version=2`, foreign keys restored/on, `foreign_key_check` empty, `integrity_check=ok`, and a new degraded review→decision→import link was admitted. The diagnostic was deleted and is not a standing gate.
- Updated the current source-checkout truth in `README.md` and `docs/development/source-checkout.md`; replaced `HANDOFF.md` with the completed Issue #36 cold-start router. Archive sweep found no consumed working document or disposable diagnostic remaining and no archive move required.
- Pre-review frozen-toolchain validation was GREEN: exact Node 24.18.1/pnpm 11.24.0 `doctor`, `bootstrap`, `build`, and `e2e -- --journey J-01` all exited 0 after source/hash/link hardening.
- The required two-axis advisory review found no scope creep and identified bounded closure gaps. The existing renderer/E2E now keep exact bytes/SHA and degraded action wording on Review Before Import and expose matching fidelity examples/export consequences from the persistent import record. Current routed synthetic-input claims were corrected in `docs/agents/ci-test-boundaries.md`, `docs/architecture-v2/MIGRATION.md`, and `docs/domain/execution/CONTEXT.md`.
- Post-review exact `build` and `e2e -- --journey J-01` both exit 0 with the repaired public projections and assertions.
- Both read-only review axes now confirm the fixes: Spec reports no remaining Issue #36 gap or scope creep; Standards confirms the current-truth docs and ADR 0044 commit rationale, with its sole final checkpoint finding resolved by this replacement. Same-provider review independence remains reduced.
- Commander confirmed the live Issue #36 Change Brief now explicitly allows the minimum current-truth reconciliation in `docs/agents/ci-test-boundaries.md`, `docs/architecture-v2/MIGRATION.md`, and `docs/domain/execution/CONTEXT.md`. Exact reviewed implementation head `2e3ba9b1f733f9dc3e92726fe9d75e0af04a1dff` is carried by PR #75 against `dev`; the Worker performed no push or external action.
- Requested binding `claude-opus-5@high`; actual `gpt-5.6-sol@xhigh`; T3 same-class fallback because the Owner explicitly disabled local Claude.

## What's next

- PR #75's integration lifecycle is tracked on GitHub. If it is unmerged, Commander waits for both platform checks and integrates only if both pass. Once merged, resume only from then-current `dev` under a separately authorized bounded Change Brief; never treat this outcome as full J-01.

## Key decisions made

- `prepareNewBookReview` accepts only `acceptDegradation: boolean`: false returns a server-projected preview with null digest/no state advance; true finalizes the complete server-derived set. No keys/counts cross inbound.
- One central exact ordered fidelity plan validates staged/reloaded projections. Generic clean remains supported; degraded import is admitted only for exact sample1 digest/byte identity and exact two-category plan.
- Digest `ai7.new-book-import-review/2` binds exact source identity, confirmed title, full eight rows and canonical server decision; commit recomputes it before mutation.
- SQLite v2 preserves v1 clean values/IDs/digests/null links, reuses the existing degradation table, and proves degraded or clean graph semantics through exact joined postconditions.

## Unresolved matters or blockers

- No Worker blocker or unresolved implementation matter. PR #75 check/integration state is GitHub-owned; `main`, Provider/fixture/export, Issue #37, and full-J-01 scope remain excluded.

## Resume Prompt

Commander: follow PR #75 on GitHub. If unmerged, wait for both platform checks and integrate into `dev` only when both pass; after merge, resume solely from then-current `dev` under a separately authorized bounded Change Brief, without touching `main`, broadening scope, or claiming full J-01.
