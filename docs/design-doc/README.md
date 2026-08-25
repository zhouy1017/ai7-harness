# Design document integration branch

Status: **aggregate Git branch; documentation only; not canonical product authority**

The owner explicitly requested a `design-doc` branch containing the design work produced across the active sessions. This branch is therefore an intentional exception to the normal issue-branch naming rule and to `main` being the only long-lived line. It preserves each source branch as a merge parent and makes its unique artifacts reachable in one working tree. It does not turn candidate, frozen-reference, exploration, or historical material into an accepted design.

## Included design heads

| Design line | Exact merged head | Role in this aggregate |
| --- | --- | --- |
| Canonical freeze baseline | `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | Common base; remains the remote canonical line until a later explicit integration |
| Phase-0/platform revision | `docs/1-windows-macos-phase0@960689172bcf54eb3f27b57045a4ce4e9f20695d` | Frozen candidate/reference plus unique Phase-0 and platform artifacts |
| Frozen V1 UI/UX | `docs/2-ai7-ui-ux@587d6455f6a578d3df8a39f534ec7a057c07a18c` | Legacy UI/UX reference package under `docs/ui-ux/` |
| V2 exploration/Commander line | `docs/3-design-freeze-v2-exploration@b5cb8d3e51cb64552352c7f90335534580bfdb51` | Base of this integration and source of shared project files at the aggregate tip |
| V2 architecture candidate | `docs/4-v2-architecture-candidate@247b7dacb267ba2f4076ca8461c95e5f0508b343` | Coherent DSH-first candidate under `docs/architecture-v2/` |
| V2 UI/UX candidate and feature delta | `docs/5-ui-ux-v2-delta@b903bbf515d9e6c23f48ee520911dfca7256b1af` | Complete candidate package under `docs/ui-ux-v2/` |

Merge commits on this branch are `8b0580b`, `95b52d6`, `63865fa`, and `b2034e2`. Shared project paths were then restored to the exact V2 exploration head so aggregating an older branch could not silently rewrite current operating instructions. Older versions remain fully reachable through the merge parents.

## Working-tree map

| Path | Interpretation |
| --- | --- |
| `docs/architecture-exploration/` | Architecture fork control, evidence history, clarifications, dispatch records, and the later coherent candidate path |
| `docs/architecture-v2/` | Dedicated DSH-first V2 architecture candidate; candidate only |
| `docs/ui-ux/` | Frozen V1 UI/UX reference, including its historical prototype; not the V2 implementation baseline |
| `docs/ui-ux-v2/` | Completed V2 UI/UX candidate plus Proposal-card and reusable-automation delta |
| `kick-in/35-windows-macos-product-platform.md`, `kick-in/36-phase-0-exit-review.md`, `kick-in/37-v1-platform-freeze-handoff.md` | Unique Phase-0/platform candidate artifacts |
| `docs/adr/0027-support-windows-and-macos-as-one-product.md` | Phase-0 platform candidate ADR; qualify it by full path |
| `docs/adr/0027-concentrate-ci-on-e2e-functionality.md` | Later minimal-engineering-validation ADR used by the V2 exploration line; qualify it by full path |

## Unresolved integration conflicts

### Platform target

The Phase-0 line records an owner-accepted Windows-and-macOS target inside a branch explicitly labeled frozen candidate/reference. The later V2 architecture candidate describes V1 as Windows-only and calls the macOS option historical. These statements were produced in separate sessions and were never reconciled by one owner decision. This aggregate preserves both and makes no new platform choice.

### ADR number 0027

Two branches independently allocated ADR number 0027 to different decisions. Neither file is renamed here because exact branch history and existing links must remain inspectable. Never cite unqualified `ADR 0027` on this branch; use its full path and title.

### Candidate versus canonical authority

The DSH-first architecture and V2 UI/UX packages are coherent candidate documents, not accepted `main` content. Their merge into `design-doc` grants no dependency installation, implementation, Plugin discovery, Figma/prototype production, testing expansion, release, or migration authority.

### Historical verification material

The repository contains extensive earlier capability-proof and verification design records. The later project decision in `docs/adr/0027-concentrate-ci-on-e2e-functionality.md` keeps engineering validation minimal: only complete Windows E2E journeys and observed-bug regressions are standing CI. Historical proof documents remain evidence of the design process and do not reopen those gates.

## Integration rule

Use this branch for consolidated design reading and review. Before anything can enter `main`, the owner and Commander must explicitly resolve cross-line conflicts, identify the accepted source paths, and authorize a normal pull-request integration. Do not implement from the aggregate merely because every design branch is now reachable from one ref.
