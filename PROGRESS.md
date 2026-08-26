# Progress

## What's done

- Issue #78 is complete on `feat/78-exact-sample1-match`, based on exact `dev@a955de94abc7dc2ce86e9c9235efde44f335e3c6`; that base descends from immutable checkpoint `4ef62ac1d1de37c2cc644fd17669bd4669ec8441`.
- Exact tracked `SampleBooks/sample1.docx` remains unmodified at 29,550 bytes and SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`.
- The bounded outcome is complete: after a prior exact-sample1 import and product restart, staging separately discloses exact immutable-original and parsed-content-and-structure identity plus the matched Book, Source Version, and Import Record without granting authority; all choices remain initially unselected, the user must explicitly choose `新建图书（作为不同作品）`, and the existing title/degradation/review/atomic commit path reaches the record-backed bounded manuscript window and durable Edit Journal. This is not full J-01.
- Commander and independent T3 review's four findings—explicit choice authority, digest-version compatibility, sample1-only match scope, and checkpoint truth—are closed by exact commit `1d52dea574a1e1aa191275c23b9040e9f832283a`.
- Issue #78 changed only eight authorized paths: `src/shared/protocol.ts`, `src/service/index.ts`, `src/service/store.ts`, `src/renderer/index.ts`, `e2e/run-j01.mjs`, `docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md`, `PROGRESS.md`, and `HANDOFF.md`.
- Final pinned Windows validation passed with Node 24.18.1 / pnpm 11.24.0: `pnpm run doctor`, `pnpm build`, the two-launch provider-free `pnpm e2e -- --journey J-01`, and `git diff --check`.

## What's next

Commander reviews the current branch, pushes it and opens the Issue #78 pull request, obtains the identical provider-free J-01 gate on Windows and macOS through PR CI, and merges only into `dev` if accepted.

## Key decisions made

- The renderer carries the explicitly selected `targetChoiceId` through the existing service ingress; the service validates it against the sole current choice before any review projection or digest, and review returns the same id for degradation acceptance.
- New reviews use `ai7.new-book-import-review/3` and bind the validated explicit choice. Commit accepts the exact legacy `/2` algorithm only while current Exact Import Match findings remain empty; a current match makes legacy review return `REVIEW_CHANGED`.
- Exact Import Match derivation is hard-limited to exact sample1 identity by both 29,550 bytes and the accepted SHA-256; other clean, synthetic, filename-collision, fuzzy, and parsed-only-different-binary cases gain no match behavior.
- The implementation extends existing projections, renderer, service ingress, `EditorialStore`, and J-01 seam only. It adds no schema, dependency, table, parser, command, owner, test surface, Provider/Claude path, Issues #38–#41 behavior, export, recording, full-J-01, or `main` authority.

## Unresolved matters or blockers

- No local blocker. Only the provider-free macOS J-01 result remains for Commander to obtain through PR CI.

## Resume Prompt

Commander: review and push `feat/78-exact-sample1-match`, open the Issue #78 pull request, obtain the identical provider-free J-01 gate on Windows and macOS, and merge only into `dev`; do not expand into Issues #38–#41, Provider, export, recording, full J-01, or `main`.
