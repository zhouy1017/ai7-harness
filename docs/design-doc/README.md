# Design document integration branch

Status: **aggregate Git branch with owner-resolved Windows-and-macOS product scope; documentation only; not canonical `main` authority**

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
| `docs/adr/0027-concentrate-ci-on-e2e-functionality.md` | Accepted minimal-engineering-validation decision: one logical provider-free E2E Functional Gate on both supported platforms |
| `docs/agents/ci-test-boundaries.md` | Concise implementation boundary for scenario admission, synthetic data, launchable subject, platform parity, diagnostics, and excluded gates |
| `docs/adr/0028-support-windows-and-macos-as-one-product.md` | Accepted integration decision: Windows and macOS are one AI7 product |

## Resolved integration decisions

### Platform target

The owner resolved the cross-session conflict on 2026-08-25: AI7 V1 is one Chinese-first Standalone product on Windows and macOS. Both platforms share product identity, domain and authority semantics, workflows, core features, document fidelity, data meaning, and UI/UX outcomes. Explicit native variation is permitted for menus, shortcuts, dialogs, accessibility integration, paths, secret stores, IPC carriers, packages, signing/notarization, and security prompts. Windows zip/NSIS mechanics remain Windows-specific; the exact macOS floor, CPU policy, distribution/update, data-root, Keychain, IPC, and signing/notarization mechanics remain implementation decisions, not a reason to treat macOS as future scope.

### ADR numbering

The source branches independently allocated ADR number 0027 to two decisions. The aggregate resolves the collision without rewriting source-branch history: minimal E2E validation remains ADR 0027 and the platform decision is ADR 0028. The original platform file remains reachable at `docs/1-windows-macos-phase0@9606891:docs/adr/0027-support-windows-and-macos-as-one-product.md`; active links use ADR 0028.

## Remaining authority boundary

### Candidate versus canonical authority

The DSH-first architecture and V2 UI/UX packages are coherent candidate documents, not accepted `main` content. Their merge into `design-doc` grants no dependency installation, implementation, Plugin discovery, Figma/prototype production, testing expansion, release, or migration authority.

### Historical verification material

The repository contains extensive earlier capability-proof and verification design records. ADR 0027 keeps engineering validation minimal: one logical provider-free E2E Functional Gate executes the same complete supported journey IDs and observed-bug regressions on Windows and macOS. Every scenario maps to a supported journey or an observed-bug issue and outcome, uses public synthetic data without network/live providers, and follows the launchable product path. A failure on either platform fails the logical gate.

It creates no separate per-platform certification, unit, integration, contract, property, coverage, lint/type/static-analysis, accessibility, performance/load, security/privacy/compliance, provider/schema/ABI, headless, package, signing/notarization, replay, provenance, reproducibility, release-proof/receipt, same-SHA, exact-head-review, or formal-review gate. The tracer's former prerequisite spike and thirteen-point exit gate — including headless replay, request fingerprints, and portable/package proof — are superseded historical material. Historical proof documents remain evidence of the design process and do not reopen those gates.

## Integration rule

Use this branch for consolidated design reading and review. The platform scope and ADR numbering are resolved here, but no automatic `main` integration follows. Before anything can enter `main`, the owner and Commander must identify the accepted design paths and authorize a normal pull-request integration. Do not implement from the aggregate merely because every design branch is now reachable from one ref.
