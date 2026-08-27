# Progress

## What's done

- Admitted Issue #37 as the sole writable Worker outcome on `feat/37-import-identity`: the worktree was clean, `HEAD` and `origin/dev` were exactly `6b4ef18d2c4b2a212ec34a24ec3a25b3bc3be5b5`, and the Issue remains open with `ready-for-agent`.
- Read the full current Issue #37 REST body and resolved its exact-base authority: root operating rules; the incremental, authority, domain, tracker, Git, dispatch, constraint, and E2E runbooks; Editorial context; ADRs 0043/0044; and the target-qualified J-01/import specifications.
- Confirmed the bounded module may extend only the existing protocol, Store, renderer, optional renderer CSS, J-01 runner, and current progress/handoff truth. It must remain provider-free, network-denied, payload-free, parser/schema/dependency-free, and limited to exact `sample1` plus disposable public-synthetic DOCX inputs.
- Mapped the existing implementation owners and direct consumers. `src/service/docx.ts` already supplies the immutable source, parser, parsed-content, and structure identities plus clean synthetic fidelity. `src/service/store.ts` already persists those identities and prior Book/Source Version/Manuscript Import Record links, but its query is sample1-hard-coded and its review digest is v3. `src/shared/protocol.ts`, `src/renderer/index.ts`, and `e2e/run-j01.mjs` are the existing projection, disclosure, and complete-journey seams.
- Implemented the bounded module in those existing owners. Protocol projections now carry one exact class per identity finding. The Store queries every prior manuscript-import record in required deterministic order, classifies with immutable-original → parsed-content-and-structure → filename-collision precedence, includes the ordered disclosure in `ai7.new-book-import-review/4`, re-derives it immediately before commit, and rejects every non-v4/changed digest.
- Updated renderer disclosure and review binding without adding a target/relationship/duplicate authority or payload surface. Expanded the one J-01 runner to initial `sample1`, exact `sample1`, synthetic A same-name/different-content, and synthetic B parsed-only content identity; A/B are deterministic clean DOCX files generated and removed only inside the disposable external E2E root. Updated current `HANDOFF.md` routing to the active Issue #37 scope.
- Received a read-only same-provider review of `f6ea440386d2dc86912ccb820b2e99acac06d5e4`. It found exactly two E2E assertion defects and no boundary issue: the clean review must include its eighth ordered non-effect, and the degraded review must assert the complete server-derived degradation set before acceptance. The review-fix diff changes only `e2e/run-j01.mjs` to address both.

## What's next

- Create the separate review-fix commit for the staged-ready `PROGRESS.md` and `e2e/run-j01.mjs` diff when the linked worktree's Git administrative directory is writable. Then, in an environment with the already materialized declared Node 24.18.1 toolchain/dependencies, run the existing doctor/build/J-01 surface before integration and re-resolve the moving `dev` target.

## Key decisions

- Implement all three exact classes with the required per-record precedence and deterministic ordering; do not infer duplicate, relationship, target, lineage, or fuzzy authority.
- Preserve the existing `sample1` compatibility path and its current durable import behavior while expanding the one provider-free J-01 sequence.
- Use one classified identity finding per exact prior record: immutable original when the source digest matches; otherwise parsed content-and-structure when parser/content/structure match; otherwise same-name/different-content when the stored display name matches and the identity tuple differs.

## Unresolved matters or blockers

- The review-fix diff passed `git diff --check`. The worktree has neither a `node` executable nor `node_modules`; the no-install instruction prevents bootstrap or dependency materialization, so syntax/type/build and J-01 E2E checks cannot run in this environment. This sandbox also denies creation of `C:/Users/Chooo/Playground/ai7-harness/.git/worktrees/issue-37-import-identity/index.lock`, so the required separate local commit cannot be made here.

## Resume Prompt

Use this Issue #37 branch only. Commit the narrow `PROGRESS.md` and `e2e/run-j01.mjs` reviewer repair after `f6ea440` without amending it, once the linked-worktree Git directory is writable. With a materialized declared Node 24.18.1 toolchain, run the existing doctor/build/J-01 validation surface; otherwise do not install dependencies. Before any Commander integration, re-resolve `origin/dev` and target-qualified authority. Preserve the exact v4 fail-closed identity boundary and disposable synthetic cleanup.
