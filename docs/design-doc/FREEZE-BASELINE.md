# `design-doc` freeze baseline

Status: **freeze-marker payload; active as the Commander-frozen aggregate starting point only at the dedicated Issue #16 merge commit or its descendants; documentation only; noncanonical relative to `main`; no implementation authorization**

Freeze date: **2026-08-25**

Owner instruction: aggregate every discovered documentation outcome into `design-doc` and establish a design-document freeze starting point

Freeze work item: [Issue #16](https://github.com/zhouy1017/ai7-harness/issues/16)

Freeze pull request: [PR #17](https://github.com/zhouy1017/ai7-harness/pull/17)

Canonical line held unchanged: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`

Exact pre-marker aggregate content head: `design-doc@779db44cb557156f71af17e5b240b03681264ad5`

The freeze marker is the merge commit of [PR #17](https://github.com/zhouy1017/ai7-harness/pull/17) into `design-doc`. Its SHA is resolved from Git and the pull-request record rather than embedded in this commit: a merge commit cannot contain its own identity. The exact content being frozen before this marker is the immutable head above; the six Issue #16 paths — this baseline, the recovery disposition appendix, aggregate README, current control board, handoff, and progress checkpoint — form the marker payload.

## Activation rule

- On `docs/16-freeze-design-doc` before PR #17 merges, this is a validated candidate marker payload and the Commander integration remains outstanding.
- At that pull request's merge commit or any descendant on `design-doc`, this is the active frozen aggregate starting point and the next repository-development event requires a separate owner decision.

This rule keeps the same committed text accurate on both sides of the merge boundary without falsely embedding or preclaiming the merge commit.

## Meaning of this freeze

Aggregate completeness means every discovered documentation outcome has an explicit disposition. It does **not** mean that every contained conclusion is owner-accepted, that candidate packages outrank canonical `main`, or that product implementation may begin.

This baseline provides:

- one reachable Git line for all integrated repository documentation;
- an exact source and recovery manifest;
- resolved aggregate-level collisions needed for coherent reading;
- a bounded list of still-deferred decisions;
- a stable cold-start route for a later owner acceptance or implementation-planning action.

It does not provide dependency, source-copying, implementation, issue-decomposition, release, publication, migration, or `main`-merge authority.

## Integrated source lines

| Outcome | Exact source head | Integration identity | Freeze disposition |
| --- | --- | --- | --- |
| Canonical starting line | `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | common ancestor | Preserved unchanged as the canonical line; not advanced by this freeze |
| Phase-0 and Windows/macOS revision, Issue #1 | `docs/1-windows-macos-phase0@960689172bcf54eb3f27b57045a4ce4e9f20695d` | merge `8b0580b16e58657deb4bc64a1613c9a5fb31bb99` | Integrated as frozen candidate/reference material |
| Complete V1 UI/UX, Issue #2 | `docs/2-ai7-ui-ux@587d6455f6a578d3df8a39f534ec7a057c07a18c` | merge `95b52d6743586f8f24cf21d58b430118621d12de` | Integrated as frozen legacy UI/UX reference |
| V2 Commander exploration, Issue #3 | `docs/3-design-freeze-v2-exploration@b5cb8d3e51cb64552352c7f90335534580bfdb51` | aggregate base plus first-parent history | Integrated as design history and candidate-control evidence; superseded current control is Git-only |
| V2 architecture candidate, Issue #4 | `docs/4-v2-architecture-candidate@247b7dacb267ba2f4076ca8461c95e5f0508b343` | merge `63865fad53f4795497759349799a2def8306cfd5` | Integrated as coherent DSH-first candidate, pending owner acceptance |
| V2 UI/UX and feature delta, Issue #5 | `docs/5-ui-ux-v2-delta@b903bbf515d9e6c23f48ee520911dfca7256b1af` | merge `b2034e284e720a74eac6f5a5a36f1e1fbda35d2e` | Integrated as complete V2 UI/UX candidate |
| CI/development boundary, Issue #6 | `docs/6-ci-test-boundaries@08912db0eeb7b2ef8995988762d19d1ade710d09` | merge `9b3e949ac02ac1bd1b283c1d3c7db958733dda09` | Integrated; one logical provider-free E2E Functional Gate remains the standing CI surface |
| Aggregate review repair, Issue #7 | `docs/7-design-review-repair@66c556f4ef44ebb1f518e86528a3a2055e76755d` | merge `de16a2c3d3ee4a9f417a13c06d70e9f7b94b2bbf`, closure through `2932f61f5907558587122c7c4e0b92580951ab58` | Findings reconciled; advisory review is evidence, not a gate |
| Source-checkout buildability, Issue #9 | `docs/9-source-checkout-buildability@2ba95c60f729317f489e3f40768efa2302b5e46f` | [PR #10](https://github.com/zhouy1017/ai7-harness/pull/10), merge `7f622ddcfa774477a256a44998d56a2f8cadd326` | Integrated as launch-input contract inside the existing E2E boundary |
| Missing-design completion, Issue #8 | `docs/8-complete-missing-design-audit@55a33a2410aa385eb10277359944e7ac8f7d5ff5` | [PR #11](https://github.com/zhouy1017/ai7-harness/pull/11), merge `226ccfd1e34665c42af178e54d47f6d0c918138c` | Integrated: Book/import, Task Input, budget/Resume, Source/Series, Delivery Package/export, and maintenance gaps closed |
| Response presentation, Issue #12 | `docs/12-response-presentation@56cb1d56a9a9a823ef7f0cda8ad3f7832e88fabc` | [PR #13](https://github.com/zhouy1017/ai7-harness/pull/13), merge `4ee5d4bb0967f82c7f8abb01aa2541616052710b` | Integrated: wait-by-default answer delivery, optional progress, answer history, D-084/J-16/UI ADR 0014 |
| Incremental agent guidance, Issue #14 | `docs/14-incremental-agent-guidance@e0d0d1bc7d4af40805b63834e6f12bed0eab7201` | [PR #15](https://github.com/zhouy1017/ai7-harness/pull/15), merge `779db44cb557156f71af17e5b240b03681264ad5` | Integrated: thin router, focused runbooks, Change Brief, incremental-development rules, and indexed historical archive |

All source heads in this table are ancestors of the pre-marker aggregate head, either directly or through their recorded merge commits.

## Recovery and non-branch disposition

| Discovered material | Exact identity | Disposition |
| --- | --- | --- |
| Issue #8 dirty-worktree recovery | `ca55b4255669eefd184a027e83a913e1875bbdc7` from parent `2932f61` | Reconciled on the later aggregate without dropping PR #10; final source `55a33a2`, merged by PR #11 |
| Response-presentation dirty-worktree recovery | `43398d769bbc55d7e78e8a4f1892ee8d4e61cb5c` from parent `2932f61` | Reconciled after Issue #8; final source `56cb1d5`, merged by PR #13 |
| Agent-guidance recovery snapshot | `93c9e406c33cc44019555b92e51e6d10094c938e` from parent `2932f61` | Applied semantically over the later aggregate; final source `e0d0d1b`, merged by PR #15 |
| Integrated source snapshots | `b903bbf515d9e6c23f48ee520911dfca7256b1af`, `247b7dacb267ba2f4076ca8461c95e5f0508b343`, and `2ba95c60f729317f489e3f40768efa2302b5e46f` | Exact duplicates of integrated source heads; no additional merge needed |
| Integrated historical intermediates | `38f47ea762ff93275b5a5474caae7603792c0544`, `a7fc9b4db014cb1a58ce3fe8d48239b4dfae47d8`, and `c383afd2fdb5f08342cde277b7babced6c1207fc` | Already ancestors; the coherent Codex-first candidate was superseded by the DSH-first Issue #4 head, and the other two are historical intermediate states |
| FigJam workflow evidence snapshot | `f15a19c298ca52494736c7a5116ca56a4f6e74cb` | External diagram/evidence only; no repository design authority and no missing file delta to merge |
| Sample-flow and owner-clarification snapshot | `d6aa5b0c00a2c6b57cea763cac20f89a5c37c110` | Book/import and external-delivery conclusions consumed by Issue #8; progress-only snapshot, no separate merge |
| Stash | `a1fc8b782b8a2b4fce9043bd9de79693762b7095` | Stale `PROGRESS.md` observation superseded by Issue #5's integrated proposal and reusable-procedure design; retained as local recovery metadata, not frozen authority |
| Three `refs/codex/turn-diffs/*` bases | `35805aab447ea38053375c9d492569cf7f78e4e0`, `bce0d0fe9d24119c9ec96625161bb07a5d38c0a1`, and `9bcb4e928a6378f5f8fbcfe0c0670c1ed1d20c3e` | Internal recovery metadata only; excluded from design authority and mechanical integration |
| 52 no-ref documentation commits | exact inventory in [`RECOVERY-OBJECT-DISPOSITIONS.md`](./RECOVERY-OBJECT-DISPOSITIONS.md) | Parallel/rebase/amend/retry residue with no selected ref; explicitly excluded rather than merged over later results |
| Two repository-external local artifacts | exact names and SHA-256 values in [`RECOVERY-OBJECT-DISPOSITIONS.md`](./RECOVERY-OBJECT-DISPOSITIONS.md) | Workflow visualization and temporary Commander brief consumed by Issue #8; evidence only, not repository inputs |
| Outgoing pre-freeze current routers | `CONTROL.md`, root `HANDOFF.md`, root `PROGRESS.md`, and the prior aggregate `README.md` state at `779db44cb557156f71af17e5b240b03681264ad5` | Git-only historical record; replaced or extended by the freeze router/checkpoint payload |
| Previous lifecycle archive | [`docs/archive/agent-guidance-baseline-2026-08-25/`](../archive/agent-guidance-baseline-2026-08-25/) | Retained indexed historical package; no second archive payload was needed at this freeze node |

The FigJam evidence URL is <https://www.figma.com/board/KOYMWnCP1UQEtOJDFF4LP2>. It is a convenience view of evidence, not a canonical design source.

Ignored private sample material was not inspected or merged. The documentation freeze does not weaken the repository-wide manuscript exclusion.

**Archive sweep: none.** The existing indexed archive remains sufficient; the four outgoing router states above remain recoverable from the exact Git parent, so duplicating them into another archive payload would add chronology without new retrieval value.

## Repository state at audit

- Remote branches were `main`, `design-doc`, and the already integrated Issue #8, #9, #12, and #14 source branches. There were no additional pull requests, tags, or releases.
- The canonical `main` worktree was tracked-clean at `c8cbe26`; ignored private sample material was deliberately not inspected.
- The retained Issue #8 worktree was clean at selected source head `55a33a2`.
- The local convenience ref `design-doc@2932f61` lagged `origin/design-doc`; it was not used as the freeze base and carries no unmerged result. The active Issue #16 branch starts from exact remote aggregate head `779db44`.
- The dedicated freeze worktree contains only the six documentation paths named by the Issue #16 diff.

Source branches and recovery refs may remain for traceability. Their continued existence does not create active work, competing authority, or a second freeze line.

## Aggregate-level reconciliations

These decisions make the aggregate coherent without claiming owner acceptance of every candidate package:

1. Minimal functional CI remains ADR 0027; the one-product Windows/macOS decision is ADR 0028. The source-branch numbering collision remains visible in history.
2. Issue #8 owns directions D-073 through D-083. Response presentation therefore uses D-084, J-16, and UI ADR 0014.
3. Source Checkout Buildability survived every later snapshot reconciliation and remains setup for, not a second gate beside, the E2E Functional Gate.
4. A Delivery Package binds exactly one Editorial Deliverable Revision, with an optional exact Milestone Version; it does not bind several deliverable revisions.
5. Promoting an answer creates or updates a `Task Intent Draft`; `Task Input` remains a Manuscript Checkpoint purpose and is not reused as a generic prompt record.
6. Dialogue Answer History is a recoverable, non-authoritative joined projection over the two authoritative ledgers through exact Execution Bindings and Harness Execution Spans. It creates neither a third ledger nor a Task Ledger transcript copy.
7. Root agent guidance is a thin current router under the owner's 2026-08-25 supersession. Stable details live in focused runbooks; `PROGRESS.md` is replaced after every sub-task and at most one outgoing snapshot is archived at a lifecycle node.

## Frozen package shape

The pre-marker aggregate contains:

- 40 root ADRs, including ADR 0027 through ADR 0040;
- 851 unique V2 UI/UX requirements;
- D-001 through D-084;
- J-01 through J-16;
- 14 V2 UI ADRs;
- the V1 UI/UX reference, V2 architecture candidate, V2 UI/UX candidate, architecture history, focused agent runbooks, and indexed archive in one reachable history.

The Manuscript Revision remains textual authority, the Book remains source/privacy/mutation authority, AI7 owns business scheduling and authority, Harness owns the generic agent loop, and Windows/macOS remain one product with explicitly native mechanics. This paragraph is a route to already integrated definitions, not a substitute for their owning context or ADR.

## Deliberately deferred after the freeze

These matters do not block the documentation freeze and must not be silently decided by implementation:

- owner selection of which candidate paths, if any, should enter canonical `main`;
- lexical, vector, or hybrid retrieval strategy and the store/index implementation choice;
- a later accepted implementation spike for the medium-confidence ProseMirror windowing assumptions, if still needed;
- calibrated latency and resource budgets for long-manuscript behavior;
- exact macOS minimum version, CPU policy, package/update channel, Agent Data Root location, Keychain adapter, IPC carrier, and signing/notarization mechanics;
- concrete Windows/macOS confinement mechanisms beyond the capability and service facades;
- final owner acceptance or retirement of the V1 and V2 candidate packages as product baselines.

Deferred decisions are bounded follow-on work, not permission to reopen accepted authority semantics, expand CI proof machinery, import manuscripts, or implement product code.

## Freeze validation contract

The Commander freeze must demonstrate, at minimum:

- all listed source heads are ancestors of the pre-marker aggregate head;
- `origin/main` still equals the recorded canonical pin;
- the active Markdown tree has no broken repository-local links or conflict markers;
- root `CLAUDE.md` is exactly `@AGENTS.md`;
- the V2 UI/UX requirement, direction, journey, and UI-ADR identities remain unique and complete;
- root ADR identities remain unique;
- no product source, dependency manifest, manuscript, credential, private sample, or generated build artifact was introduced;
- the freeze branch is merged only into `design-doc` through its dedicated Issue/PR.

The exact results are recorded in the closing `PROGRESS.md`, PR, and Issue #16. These checks establish documentation integrity only; they are not a new product gate.

## Resume Prompt

If this is the pre-merge source branch, complete only the dedicated Issue #16 Commander PR into `design-doc`. If this is the merge commit or a descendant, read `AGENTS.md`, this freeze baseline, `HANDOFF.md`, and the relevant focused runbooks; then obtain a separate owner decision before promoting selected paths to `main` or beginning implementation planning.
