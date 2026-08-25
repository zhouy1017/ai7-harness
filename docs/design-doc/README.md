# Design document integration branch

Status: **freeze-marker aggregate router; active at the dedicated Issue #16 merge commit or its descendants; every discovered documentation outcome has an explicit disposition; documentation only; not canonical `main` authority**

The owner explicitly requested a `design-doc` branch containing the design work produced across the active sessions and then directed the Commander to freeze the complete aggregate as a starting point. This branch is therefore an intentional exception to the normal issue-branch naming rule and to `main` being the only long-lived line. It preserves each integrated source branch as ancestry and records an explicit disposition for recovery and evidence-only material. It does not turn candidate, frozen-reference, exploration, or historical material into an accepted design.

Start with the [`design-doc` freeze baseline](./FREEZE-BASELINE.md). It is the authoritative source/disposition manifest for this aggregate, but it is not a substitute for the owning ADRs, Policy Documents, or context definitions.

On the Issue #16 source branch before PR #17 merges, the freeze documents are a validated marker payload. At PR #17's merge commit or any descendant, they are the active frozen starting point.

## Included design heads

| Design line | Exact merged head | Role in this aggregate |
| --- | --- | --- |
| Canonical freeze baseline | `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | Common base; remains the remote canonical line until a later explicit integration |
| Phase-0/platform revision | `docs/1-windows-macos-phase0@960689172bcf54eb3f27b57045a4ce4e9f20695d` | Frozen candidate/reference plus unique Phase-0 and platform artifacts |
| Frozen V1 UI/UX | `docs/2-ai7-ui-ux@587d6455f6a578d3df8a39f534ec7a057c07a18c` | Legacy UI/UX reference package under `docs/ui-ux/` |
| V2 exploration/Commander line | `docs/3-design-freeze-v2-exploration@b5cb8d3e51cb64552352c7f90335534580bfdb51` | Base of this integration and source of shared project files at the aggregate tip |
| V2 architecture candidate | `docs/4-v2-architecture-candidate@247b7dacb267ba2f4076ca8461c95e5f0508b343` | Coherent DSH-first candidate under `docs/architecture-v2/` |
| V2 UI/UX candidate and feature delta | `docs/5-ui-ux-v2-delta@b903bbf515d9e6c23f48ee520911dfca7256b1af` | Complete candidate package under `docs/ui-ux-v2/` |

The initial aggregate merge commits are `8b0580b`, `95b52d6`, `63865fa`, and `b2034e2`; later Commander task integrations remain visible in branch history. Shared project paths were then restored to the exact V2 exploration head so aggregating an older branch could not silently rewrite current operating instructions. Older versions remain fully reachable through the merge parents.

## Later Commander integrations

| Work item | Exact source head | Pull request / aggregate merge |
| --- | --- | --- |
| Issue #6 CI/development boundaries | `08912db0eeb7b2ef8995988762d19d1ade710d09` | merge `9b3e949ac02ac1bd1b283c1d3c7db958733dda09` |
| Issue #7 aggregate review repair | `66c556f4ef44ebb1f518e86528a3a2055e76755d` | merge `de16a2c3d3ee4a9f417a13c06d70e9f7b94b2bbf`, closure through `2932f61f5907558587122c7c4e0b92580951ab58` |
| Issue #9 Source Checkout Buildability | `2ba95c60f729317f489e3f40768efa2302b5e46f` | [PR #10](https://github.com/zhouy1017/ai7-harness/pull/10), merge `7f622ddcfa774477a256a44998d56a2f8cadd326` |
| Issue #8 missing-design completion | `55a33a2410aa385eb10277359944e7ac8f7d5ff5` | [PR #11](https://github.com/zhouy1017/ai7-harness/pull/11), merge `226ccfd1e34665c42af178e54d47f6d0c918138c` |
| Issue #12 response presentation | `56cb1d56a9a9a823ef7f0cda8ad3f7832e88fabc` | [PR #13](https://github.com/zhouy1017/ai7-harness/pull/13), merge `4ee5d4bb0967f82c7f8abb01aa2541616052710b` |
| Issue #14 incremental agent guidance | `e0d0d1bc7d4af40805b63834e6f12bed0eab7201` | [PR #15](https://github.com/zhouy1017/ai7-harness/pull/15), merge `779db44cb557156f71af17e5b240b03681264ad5` |

[PR #17](https://github.com/zhouy1017/ai7-harness/pull/17)'s merge commit is the freeze marker. Git and PR #17 provide its exact SHA; `779db44cb557156f71af17e5b240b03681264ad5` is the immutable aggregate content head immediately before the marker payload.

## Working-tree map

| Path | Interpretation |
| --- | --- |
| [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) | Root router to the canonical bounded-context definition owners and cross-context Policy Documents |
| [`GLOSSARY.md`](../../GLOSSARY.md) and [`UBIQUITOUS_LANGUAGE.md`](../../UBIQUITOUS_LANGUAGE.md) | Bilingual term index and ambiguity-sensitive reading guide; neither replaces canonical context definitions |
| [`docs/domain/`](../domain/) | Canonical Editorial, Execution, and deferred Word-integration context definitions |
| [`docs/policies/`](../policies/) | Versioned factual-verification and learning-eligibility authority policies |
| [`docs/design-doc/FREEZE-BASELINE.md`](./FREEZE-BASELINE.md) | Exact source, recovery, evidence, supersession, reconciliation, validation, and deferred-decision manifest for the freeze |
| [`docs/design-doc/RECOVERY-OBJECT-DISPOSITIONS.md`](./RECOVERY-OBJECT-DISPOSITIONS.md) | Exact grouped disposition of no-ref commits and repository-external evidence found by the freeze audit |
| `docs/architecture-exploration/` | Architecture fork control, evidence history, clarifications, dispatch records, and the later coherent candidate path |
| `docs/architecture-v2/` | Dedicated DSH-first V2 architecture candidate; candidate only |
| `docs/ui-ux/` | Frozen V1 UI/UX reference, including its historical prototype; not the V2 implementation baseline |
| `docs/ui-ux-v2/` | Completed V2 UI/UX candidate with 851 unique requirements, D-001–D-084, J-01–J-16, and 14 UI ADRs, including Proposal-card, reusable-automation, Issue #8 missing-design, and wait-versus-stream response-presentation deltas |
| [`docs/design-doc/REVIEW.md`](./REVIEW.md) | Owner-requested two-axis advisory review and Commander dispositions; not a formal gate or `main` acceptance |
| `docs/agents/` | Current focused repository-agent routing, authority, detailed constraints, incremental-development, Change Brief, document-lifecycle, Git, domain, dispatch-link, buildability, and CI runbooks |
| [`docs/archive/`](../archive/README.md) | Node-indexed consumed working documents whose activation is atomic with their integrating Issue/PR; historical only and excluded from ordinary agent search/reading |
| [`kick-in/`](../../kick-in/README.md) | Design-interview, inheritance, provenance, and decision-history route; read one relevant topic cluster at a time, not as current work discovery |
| `kick-in/35-windows-macos-product-platform.md`, `kick-in/36-phase-0-exit-review.md`, `kick-in/37-v1-platform-freeze-handoff.md` | Unique Phase-0/platform candidate artifacts |
| `docs/adr/0027-concentrate-ci-on-e2e-functionality.md` | Accepted minimal-engineering-validation decision: one logical provider-free E2E Functional Gate on both supported platforms |
| `docs/agents/ci-test-boundaries.md` | Concise implementation boundary for scenario admission, synthetic data, launchable subject, platform parity, diagnostics, and excluded gates |
| `docs/agents/source-checkout-buildability.md` | Owner-accepted fresh-checkout build/launch contract; candidate here until normal `main` integration and not implementation authority |
| `docs/adr/0028-support-windows-and-macos-as-one-product.md` | Accepted integration decision: Windows and macOS are one AI7 product |
| `docs/adr/0029-*` through `docs/adr/0040-*` | Issue #8 candidate decisions for Book/import, Task Input, budget/Resume, Source/Series, Delivery Package/export, and maintenance boundaries |

## Resolved integration decisions

### Platform target

The owner resolved the cross-session conflict on 2026-08-25: AI7 V1 is one Chinese-first Standalone product on Windows and macOS. Both platforms share product identity, domain and authority semantics, workflows, core features, document fidelity, data meaning, and UI/UX outcomes. Explicit native variation is permitted for menus, shortcuts, dialogs, accessibility integration, paths, secret stores, IPC carriers, packages, signing/notarization, and security prompts. Windows zip/NSIS mechanics remain Windows-specific; the exact macOS floor, CPU policy, distribution/update, data-root, Keychain, IPC, and signing/notarization mechanics remain implementation decisions, not a reason to treat macOS as future scope.

### ADR numbering

The source branches independently allocated ADR number 0027 to two decisions. The aggregate resolves the collision without rewriting source-branch history: minimal E2E validation remains ADR 0027 and the platform decision is ADR 0028. The original platform file remains reachable at `docs/1-windows-macos-phase0@9606891:docs/adr/0027-support-windows-and-macos-as-one-product.md`; active links use ADR 0028.

## Remaining authority boundary

### Candidate versus canonical authority

The DSH-first architecture and V2 UI/UX packages are coherent candidate documents, not accepted `main` content. Their merge into `design-doc` grants no dependency installation, implementation, Plugin discovery, Figma/prototype production, testing expansion, release, or migration authority.

### Historical verification material

The repository contains extensive earlier capability-proof and verification design records. ADR 0027 keeps engineering validation minimal: one logical provider-free E2E Functional Gate executes the same complete supported journey IDs and observed-bug regressions on Windows and macOS. Every scenario maps to a supported journey or an observed-bug issue and outcome, uses public synthetic data, and follows the launchable product path. Declared dependency restoration may use approved package registries and immutable artifact sources first; the ensuing product execution interval has no outbound network or live provider. A failure on either platform fails the logical gate.

It creates no separate per-platform certification, unit, integration, contract, property, coverage, lint/type/static-analysis, accessibility, performance/load, security/privacy/compliance, provider/schema/ABI, headless, package, signing/notarization, replay, provenance, reproducibility, release-proof/receipt, same-SHA, exact-head-review, or formal-review gate. The tracer's former prerequisite spike and thirteen-point exit gate — including headless replay, request fingerprints, and portable/package proof — are superseded historical material. Historical proof documents remain evidence of the design process and do not reopen those gates.

## Advisory review and historical metadata

The bounded aggregate findings and their dispositions are recorded in [`REVIEW.md`](./REVIEW.md). Historical commits `0bcc784a704c4169e930dff33cea09a37633023e`, `ec26b70ad9a60cdfb046ca57ef441a38962e73ee`, and `7ecb8add6351764644aefc981dadcdfaef999746` lack the required model co-author trailer. They remain unchanged because they are shared aggregate ancestors and rewriting them would mutate preserved source history and invalidate exact references. Future agent-authored commits must follow the trailer convention.

## Integration rule

Use the Issue #16 marker as the stable starting point for consolidated design reading and later owner selection. The platform scope and ADR numbering are resolved in the aggregate, but no automatic `main` integration follows. Before anything can enter `main`, the owner must identify the accepted design paths and authorize a separate Commander pull-request integration with an exact path allowlist. Do not plan or implement the product merely because every discovered documentation outcome now has a disposition.
