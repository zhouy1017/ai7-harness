# Architecture Review Packet Manifest

Status: **sealed for Worker inputs — containing Commander commit requires exact-head review**
Canonical base: `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
Platform reference: `960689172bcf54eb3f27b57045a4ce4e9f20695d`
UI reference: `587d6455f6a578d3df8a39f534ec7a057c07a18c`

This manifest is the contamination boundary for architecture exploration. Read only the listed Git objects and the Commander-curated files in the commit containing this manifest. Do not substitute a branch tip, working-tree file, task transcript, or later object with the same path.

For any row, verify the object before reading it:

1. `git rev-parse "<commit>:<path>"` must equal the listed blob.
2. `git cat-file -s <blob>` must equal the listed byte count.
3. Read with `git show "<commit>:<path>"`.

The status column describes authority, not review quality. `candidate` and `evidence-only` objects do not become canonical because they passed artifact review.

## Canonical baseline objects

All rows in this section are `accepted` only to the extent recorded at the exact canonical base. Later accepted records may outrank summaries or older ADR statements.

| Status | Commit | Path | Blob | Bytes |
| --- | --- | --- | --- | ---: |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `HANDOFF.md` | `7467edd4e6bdf5e63bf5bc3abc9b461232a05b84` | 7722 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `AGENTS.md` | `5dd33ba9f3cbd08f83e7263f467832e48c8f0f9f` | 28390 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `handoff20260817/PROJECT-OVERVIEW.md` | `2d5c2ade589432f8055a4d473f3645efb71b1221` | 14487 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `kick-in/05-decision-map.md` | `520596740050d04d61087cbb6203653c2c890258` | 21751 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `CONTEXT-MAP.md` | `4aef91642f45b7bf4bda058a5ba2dbfed9d1fc15` | 1611 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `GLOSSARY.md` | `14f33caac515ecb119d5065a10a037dd84b1ea25` | 22919 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0001-versioned-editorial-dimension-configuration.md` | `14d3915b730d8b4297b8cec2d0c7ef73bba8470b` | 735 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md` | `dd60f1c02bd9217dbc0542de65fad8622700b483` | 867 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0003-use-foundation-models-with-governed-editorial-intelligence.md` | `fb3d7dc2b89903cc8b82d000ac944854c2b37985` | 1121 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md` | `a7f9a43ea8d68d7dbdc953fc9bccbca1ae81c70a` | 852 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0005-separate-textual-and-factual-authority.md` | `c284dd07b11ab3e8544bed12219b2b8302c7fa9f` | 791 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0006-preserve-manuscript-native-history-and-recovery.md` | `e52d9169f77df9b6470798ec860b56b08c1362f5` | 866 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0007-separate-decisions-authority-and-effect-proof.md` | `11cf196f625f130cc27f32003dc164e3b810cb7b` | 667 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0008-use-deliverable-owned-workflow-profiles.md` | `d5ec898f3222aa452ddcf6ee26c0db9286930c6f` | 730 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0009-use-authority-bearing-plan-envelopes.md` | `34886c48b0acad637fe6b3adc6f972b6acc516fa` | 671 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0010-separate-task-skill-instruction-implementation-and-authority.md` | `de53c2a807b182309efc98bf48b38de5b61309f5` | 792 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md` | `dcad7c3c8faf4c10e030a6cbd73acf3e7fb4377b` | 804 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0012-exclude-legacy-production-data-migration.md` | `ae8e9b3815af2f06400a28a13f7ff2c03fb5052b` | 745 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0013-ship-standalone-only-v1.md` | `ec519b06cb9de653a01fffab47d7cd9f3ee6760f` | 884 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0014-verify-on-one-windows-gate.md` | `bce652dafa6b52246945729a72b881a835e960a2` | 2191 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0015-provider-neutral-development-dispatch.md` | `92442a946e65d41594365f47375bfac234f17ea6` | 2285 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md` | `3b64106d34f8b5798273c48d7d9056d4e9ed2978` | 2388 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0017-full-engine-narrow-tool-surface.md` | `25cfb5c415669b7c2ee1bf51fa4cf2f4569b87c3` | 2635 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0018-tiered-activation-for-agent-authored-revisions.md` | `dce839d985d857f196620291a88798223d9a3c33` | 2117 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0019-editorial-quality-metrics-and-behavior-evaluation-gate.md` | `3555da3b3404c74977232b9c12b4f42070ada0ab` | 2860 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0020-consume-pinned-harness-package-subset.md` | `e2127cf472768210e56658f5056c65f05f0542d4` | 3141 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0021-single-execution-authority.md` | `1d7e662fe3d3ff8dfa6b360cf251a1d9987348db` | 3042 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0022-typescript-only-runtime.md` | `f1f48697e92f9614db0e00b10cae669e0e6aa923` | 2136 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0023-portable-release-with-self-contained-data-root.md` | `011e10b9a45a9394f742b3e0d299b903f61dec1a` | 3182 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0024-electron-shell-with-isolated-ai7-service.md` | `206b9d93d6e840aefec7ce5672824cc6b866c2bc` | 2269 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md` | `b021e0312743f4c596b7d16beff08951a2693f0a` | 4233 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/adr/0026-manuscript-retrieval-returns-candidates.md` | `b3c49bb5f06ca7ac0131b6e0a29f22537d6d432f` | 3582 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/domain/editorial/CONTEXT.md` | `137b1e96e52ae0736b58fcae628af237c9c37215` | 16496 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/domain/execution/CONTEXT.md` | `0df9826d617aa04e47675f6e0217d3e508feb309` | 22162 |
| accepted | `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | `docs/domain/word-integration/CONTEXT.md` | `0516b06017d8ea4857da4a5a3dc76e51e7ebe63e` | 447 |

## Platform candidate objects

Final head `960689172bcf54eb3f27b57045a4ce4e9f20695d` passed exact-range `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9...960689172bcf54eb3f27b57045a4ce4e9f20695d` review: Standards PASS and Spec PASS, zero findings, no post-review change, clean worktree, `same-provider review — independence reduced`. Phase 0 remains NOT PASSED.

| Status | Commit | Path | Blob | Bytes |
| --- | --- | --- | --- | ---: |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `kick-in/37-v1-platform-freeze-handoff.md` | `60cee768ab01ffa937690b0e44d0e7ca821bb078` | 5347 |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `kick-in/36-phase-0-exit-review.md` | `a04353decb23bbd7fc7a536f395b200e1ccbccb7` | 9333 |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `kick-in/35-windows-macos-product-platform.md` | `010baeb0a1b726cee876857d93afa1d4abf3f09b` | 4491 |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `docs/adr/0027-support-windows-and-macos-as-one-product.md` | `28e09a09a150d249e987aa72977a052d4d2d9102` | 2151 |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `docs/adr/0005-separate-textual-and-factual-authority.md` | `09708b62d1dac32a251ee49adc407b32fd79b06b` | 1284 |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `docs/policies/factual-verification-policy.md` | `28485e33705fa8782a18c14f1244fa6d54ba229f` | 4840 |
| candidate | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | `kick-in/30-upstream-consumption-and-upgrade-contract.md` | `6fb0dafd315d1971534874a18983ff54f0422fc5` | 9891 |

## UI/UX candidate objects

Final head `587d6455f6a578d3df8a39f534ec7a057c07a18c` passed exact-range `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9...587d6455f6a578d3df8a39f534ec7a057c07a18c` review: Standards PASS and Spec PASS, zero findings, no post-review change, clean worktree, one commit above base, `same-provider review — independence reduced`. The requirements, journeys, state tables, and traceability are candidate inputs; raw Figma/prototype material is evidence-only.

| Status | Commit | Path | Blob | Bytes |
| --- | --- | --- | --- | ---: |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/V1-FREEZE-HANDOFF.md` | `727acde5f15550b87b08c888559ca068525cf015` | 9137 |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/requirements.md` | `5c8c3d2b2f5a34c8e6e42b0b47bd1747d7312f33` | 17419 |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/interaction-spec.md` | `79b8f1bdca16f2fd446b65f29de8b9858fac7113` | 61864 |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/traceability.md` | `4c3892e83051e1aedf1fc7816d5d0f5748318538` | 18289 |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/information-architecture.md` | `b2b032078c35464a94713dfa17f3d13458df1da4` | 7513 |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/usability-test-plan.md` | `501bd83da9da39c77c88f72add401f27720b137b` | 16116 |
| candidate | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/visual-system.md` | `9b4addebe44644a9115bd7a439dd0db4fdb97a88` | 40294 |
| evidence-only | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/figma-handoff.md` | `f1711d1fa225872a44c6d0f804831d7aef539d08` | 3770 |
| evidence-only | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | `docs/ui-ux/prototype/README.md` | `63b85ab8f3c3b7c15ea687030fc65810603787e8` | 2263 |

## Commander-curated objects

The commit containing this manifest also pins these noncanonical coordination objects as one reviewed unit:

- `docs/agents/multi-session-design-workflow.md` — binding repository-development runbook after integration;
- `docs/architecture-exploration/CONTROL.md` — current task/freeze state;
- `docs/architecture-exploration/KNOWN-PROBLEMS.md` — investigation inputs;
- `docs/architecture-exploration/REVIEW-PACKET.md` — normalized packet;
- `docs/architecture-exploration/ROUND-1-REVIEW.md` — independent baseline review synopsis; and
- `docs/architecture-exploration/CANDIDATE-DELTA-REVIEW.md` — independent candidate-delta synopsis and A1–A3 briefs.

The Commander must report that containing commit's exact SHA after its own exact-head review. A mutable checkout of these paths is never a substitute. Before commit, all 51 listed rows were re-derived and matched their commit/path blob IDs and byte counts.

## Exclusions

The packet excludes all task/chat transcripts; chronological `PROGRESS.md`; raw and reconstructed design conversations; active worktrees; tool logs; reviewer reasoning traces; failed drafts; unlisted branch files; real manuscripts and derivatives; credentials; private sample Books; and Harness product defaults presented as AI7 requirements.
