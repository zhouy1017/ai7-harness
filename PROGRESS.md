# Progress

## What's done

- Issue #78 is active on clean `feat/78-exact-sample1-match` from exact `dev@a955de94abc7dc2ce86e9c9235efde44f335e3c6`; the base descends from immutable checkpoint `4ef62ac1d1de37c2cc644fd17669bd4669ec8441`.
- The complete Issue #78 Change Brief and its routed current authorities have been read; no archive material was opened.
- Exact tracked `SampleBooks/sample1.docx` was verified at 29,550 bytes and SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- The existing import/J-01 owners and direct consumers were inspected. `staged_import_snapshots` and `source_versions` already retain source/content/structure digests, while the existing commit graph retains the matched Book, Source Version, and Manuscript Import Record.
- TDD RED observed through the built product: the existing complete import finished, the product relaunched against the same isolated Agent Data Root, and the second staging view failed exactly at `J-01/exact-original-identity-disclosed` because no `精确原始文件身份` disclosure exists yet.
- First GREEN completed: the existing store derives the immutable-original match from durable Source Version/import records, the staging projection renders the matched Book/Source Version/Import Record plus negative authority, and the full two-launch J-01 variation passes locally on Windows.
- Second RED→GREEN completed: `J-01/exact-parsed-content-structure-disclosed` failed first, then the same immutable-original matched Source Version gained a separately rendered parsed-content-and-structure class only after its persisted content and structure digests both matched.
- Third RED→GREEN completed: `J-01/exact-match-records-and-distinct-work-unselected` failed first, then the existing staged target projection supplied an initially-unselected `新建图书（作为不同作品）` choice while the match surface named the durable records and exact negative authority.
- Fourth RED→GREEN completed: `J-01/review-binds-exact-match-and-distinct-work` failed first, then the existing review digest/projection bound the two exact identity classes and `distinct-intended-work`; the editor-edited source-labelled title, exact sample1 degradation, atomic commit, bounded manuscript window, and durable journal all completed in the same Windows J-01 run.
- ADR 0044's three stale current-truth statements now reflect the integrated Issue #36 sample1 tracer while preserving the accepted decision and deferred recording boundary.
- Final scope audit found only the seven authorized paths below, no untracked file, no SampleBook change, and no new dependency, table, parser, command, IPC authority, provider path, or Issues #38–#41 behavior: `src/shared/protocol.ts`, `src/service/store.ts`, `src/renderer/index.ts`, `e2e/run-j01.mjs`, `docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md`, `PROGRESS.md`, and `HANDOFF.md`.
- Final Windows validation passed with the repository-pinned Node 24.18.1 / pnpm 11.24.0 toolchain: `pnpm run doctor`, `pnpm build`, `pnpm e2e -- --journey J-01`, and `git diff --check`. The J-01 gate completed both launches, both atomic imports, both bounded manuscript windows, and both durable Edit Journal acknowledgements without a hung product process.

## What's next

Commit the reviewed Issue #78 diff with the required Conventional Commit and Codex co-author trailer, then hand the clean branch to Commander for independent review and the required Windows/macOS PR E2E gate.

## Key decisions made

- Extend the existing deep import module and public J-01 seam; no new owner, dependency, command, store, parser, Harness path, or test surface is authorized.
- Existing durable records are sufficient, so no schema or staged-snapshot persistence change is currently needed. Exact findings can be derived in `EditorialStore`, carried by the existing staged/review projections, and included in the existing review digest.
- The first test is public and user-visible: it observes only the rendered staging surface after a real product relaunch, never SQLite or an internal service interface.
- The exact-match projection is one small interface carrying durable matched identities and a list of disclosed identity classes; the store implementation owns the matching query and the renderer remains a projection consumer.
- Parsed-content-and-structure disclosure is currently bounded to the same immutable-original Source Version, so parsed-only-different-binary matching remains deferred exactly as required.
- The initial generic path keeps `新建图书`; only a staged exact match changes the explicit target wording to `新建图书（作为不同作品）`.
- Review binding uses the existing digest and projection; no new command or authority surface was added. The exact match remains disclosure and the commit still creates a separate complete new-Book graph through the existing atomic owner.
- The exact match is disclosure only. Target/action remain initially unselected, and the only executable continuation in this Issue is `新建图书（作为不同作品）` followed by the already-owned exact sample1 degradation/review/atomic commit path.
- Claude, Provider, credentials, export, recording, filename-collision, fuzzy, parsed-only-different-binary, general-fidelity, and Issues #38–#41 behavior remain excluded.

## Unresolved matters or blockers

- No local implementation blocker. macOS was not run locally; the required provider-free macOS result remains for Commander to obtain through PR CI.

## Resume Prompt

Commander: review the clean Issue #78 branch against its exact Change Brief, obtain the identical provider-free J-01 gate on Windows and macOS through PR CI, and integrate only into `dev`; do not claim full J-01 or add Issues #38–#41, Provider, export, recording, or `main` authority.
