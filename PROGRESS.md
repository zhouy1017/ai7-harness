# Progress

## What's done

- Commander integration maintenance rebased the three completed Issue #37 commits onto exact `dev@75a0ece9818bdb1ac83cb79f2d0a3489c9562ba8`. The intervening #98 merge changed only repository Reviewer governance and root checkpoint text; every Issue #37 product/domain/J-01 authority owner is byte-identical to its dispatched `6b4ef18d...` base, so no product semantic or structural-budget drift exists.
- Admitted Issue #37 as the sole writable Worker outcome on `feat/37-import-identity`: the worktree was clean, `HEAD` and `origin/dev` were exactly `6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`, and the Issue remains open with `ready-for-agent`.
- Read the full current Issue #37 REST body and resolved its exact-base authority: root operating rules; the incremental, authority, domain, tracker, Git, dispatch, constraint, and E2E runbooks; Editorial context; ADRs 0043/0044; and the target-qualified J-01/import specifications.
- Confirmed the bounded module may extend only the existing protocol, Store, renderer, optional renderer CSS, J-01 runner, and current progress/handoff truth. It must remain provider-free, network-denied, payload-free, parser/schema/dependency-free, and limited to exact `sample1` plus disposable public-synthetic DOCX inputs.
- Mapped the existing implementation owners and direct consumers. `src/service/docx.ts` already supplies the immutable source, parser, parsed-content, and structure identities plus clean synthetic fidelity. `src/service/store.ts` already persists those identities and prior Book/Source Version/Manuscript Import Record links, but its query is sample1-hard-coded and its review digest is v3. `src/shared/protocol.ts`, `src/renderer/index.ts`, and `e2e/run-j01.mjs` are the existing projection, disclosure, and complete-journey seams.
- Implemented the bounded module in those existing owners. Protocol projections now carry one exact class per identity finding. The Store queries every prior manuscript-import record in required deterministic order, classifies with immutable-original → parsed-content-and-structure → filename-collision precedence, includes the ordered disclosure in `ai7.new-book-import-review/4`, re-derives it immediately before commit, and rejects every non-v4/changed digest.
- Updated renderer disclosure and review binding without adding a target/relationship/duplicate authority or payload surface. Expanded the one J-01 runner to initial `sample1`, exact `sample1`, synthetic A same-name/different-content, and synthetic B parsed-only content identity; A/B are deterministic clean DOCX files generated and removed only inside the disposable external E2E root. Updated current `HANDOFF.md` routing to the active Issue #37 scope.
- Received a read-only same-provider review of `f6ea440386d2dc86912ccb820b2e99acac06d5e4`. It found exactly two E2E assertion defects and no boundary issue: the clean review must include its eighth ordered non-effect, and the degraded review must assert the complete server-derived degradation set before acceptance. Commit `ac66e93e02fbd015f762c192871671b47d64fb45` fixes both in `e2e/run-j01.mjs` and updates this checkpoint; follow-up read-only verification found no regression.

## What's next

- Commander: verify the rebased commit boundary, push the one Issue branch, create its one pull request to `dev`, and use the existing GitHub E2E Functional Gate to run J-01 on Windows and macOS before squash integration.

## Key decisions

- Implement all three exact classes with the required per-record precedence and deterministic ordering; do not infer duplicate, relationship, target, lineage, or fuzzy authority.
- Preserve the existing `sample1` compatibility path and its current durable import behavior while expanding the one provider-free J-01 sequence.
- Use one classified identity finding per exact prior record: immutable original when the source digest matches; otherwise parsed content-and-structure when parser/content/structure match; otherwise same-name/different-content when the stored display name matches and the identity tuple differs.

## Unresolved matters or blockers

- The completed branch passes `git diff --check`; bundled Node 24.19.0 also passes `node --check e2e/run-j01.mjs`. The worktree has neither the declared Node 24.18.1 executable nor `node_modules`; the no-install instruction prevents bootstrap or dependency materialization, so doctor/type/build and full J-01 E2E cannot run in this environment.
- The prior advisory review occurred before Issue #98's Reviewer-report normalization became canonical and did not preserve its exact requested/actual provider-model-effort binding. It remains advisory historical input and is not treated as a PR, CI, exact-head, zero-finding, or iterative re-review gate; no new review is requested for integration.

## Resume Prompt

Resume Commander integration only from the clean rebased `feat/37-import-identity` tip whose exact base is `dev@75a0ece9818bdb1ac83cb79f2d0a3489c9562ba8`. Verify the six-path boundary and existing J-01 controller syntax, then push/create the one PR and merge only after the same J-01 journey passes on Windows and macOS. Preserve the exact v4 fail-closed identity boundary and disposable synthetic cleanup; do not install, call Providers, add protected material, create another gate, release, or touch `main`.
