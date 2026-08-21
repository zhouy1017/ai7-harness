# V2 Architecture Dispatch

Status: **active, A1 only**

This is a repository-development dispatch record, not a product architecture decision. All V2 outputs remain noncanonical until owner acceptance and normal integration.

## Exact authorities

- Canonical baseline: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
- Commander-reviewed control and sealed packet: `c383afd2fdb5f08342cde277b7babced6c1207fc`
- V2 work item: [Issue #4](https://github.com/zhouy1017/ai7-harness/issues/4)
- V2 design branch: `docs/4-v2-architecture-candidate`, created at `c383afd2fdb5f08342cde277b7babced6c1207fc`
- Platform/Q16/Phase-0 frozen candidate: `960689172bcf54eb3f27b57045a4ce4e9f20695d`, noncanonical
- UI/UX frozen candidate: `587d6455f6a578d3df8a39f534ec7a057c07a18c`, noncanonical
- Evidence inventory: [PACKET-MANIFEST.md](./PACKET-MANIFEST.md)

## Design Worker

- App task: `AI7 V2 架构设计（Issue #4）`
- App task ID: `01a022de-f781-7d31-9a77-c3ce9ee1ce50`
- Repository role: Worker with Chief Architect responsibilities
- Worktree: `worktrees/1649`
- Write boundary: its Issue #4 branch only

The first turn is limited to A1 one-product consistency and UI parity. It must map the 79 requirements and fourteen journeys, define shared semantics versus bounded native variation, expose support/parity/accessibility/Policy-visibility options, and stop where an owner choice is required. It may not select implementation mechanisms. A2 is blocked on stable A1 invariants and the owner choice; A3 is blocked on A1 and A2.

The Worker reads `PROGRESS.md` only for operational status. Architecture evidence is limited to the sealed packet and exact objects in its manifest. It never consumes another task's transcript or active worktree.

## Hostile Reviewer

- App task: `AI7 V2 反方审查（只读）`
- App task ID: `01a022df-0d69-7173-ab31-679038c1f446`
- Repository role: independent Reviewer
- Worktree: `worktrees/1be4`, derived from `c383afd2fdb5f08342cde277b7babced6c1207fc`
- Write boundary: none

The first turn produces only a challenge charter: candidate admission criteria, attack matrix, falsification questions, severity/evidence protocol, and a `WAITING_FOR_CANDIDATE` stop. It must not inspect the design task or issue a V2 verdict before receiving an exact Commander review brief.

The future brief must name the exact base, candidate head, diff, evidence manifest, ADR disposition, trade-offs, migration direction, risks, owner choices, and validation evidence. A same-provider review must disclose `same-provider review — independence reduced`.

## Phase gates

1. A1 local candidate and exact-head handoff.
2. Commander review and owner platform-consistency choice.
3. A2 exact Harness `0.1.0-rc.6` composition/seam closure.
4. A3 truthful OS isolation/local authority.
5. Coherent V2 candidate with ADR disposition, trade-offs, migration direction, risks, and evidence.
6. Independent hostile review against the exact candidate head.
7. Owner architecture decision.
8. Separate implementation authorization, if granted.

No earlier gate implies a later one.
