# AI7 documentation

Start with the [product README](../README.md) for audience, capabilities, limitations and first launch. Repository agents start with [AGENTS.md](../AGENTS.md).

## Current work and operation

| Need | Read |
| --- | --- |
| Exact integrated state and evidence limits | [PROGRESS](../PROGRESS.md) |
| Next feature, fix or decision | [Development plan](development/development-plan.md), then its linked Issue |
| Build and open the current source for human inspection | [Quick local inspection](development/local-inspection.md) |
| Build, launch scopes, data roots and diagnosis | [Source checkout](development/source-checkout.md) |
| Native nightly packages and automatic Windows version-tag releases | [Releasing](development/releasing.md) |
| Software version, Data Version, build number and source identity | [Versioning](development/versioning.md) |
| Find code/tool owners and check documentation links | [Repository structure](development/repository-structure.md) |
| Supported product paths and what their tests prove | [E2E journeys](development/e2e-journeys.md) |
| Verification, background guests and existing Gate | [CI and test boundaries](agents/ci-test-boundaries.md) |
| Provider configuration versus executable capability | [Provider support](development/provider-support.md); generated from configuration, not hand-edited |
| Runtime policy selection | [Policy index](policies/README.md); exact launch pins select immutable assets |
| Dependency identity, acquisition and licenses | [Dependency provenance](development/dependency-provenance.md) and [third-party notices](../THIRD_PARTY_NOTICES.md) |
| Development capture conversion | [Fixture conversion](development/manual-model-fixture-recording.md) |
| Repository assignment, review and integration | [Orca dispatch](agents/orca-dispatch.md) and [task-specific router](agents/README.md) |

The Owner's 2026-10-23 direction — procedures as the central object, a governed concurrent harness, evidence on the card, structural editing and less ceremony — is recorded in [ADR 0095](adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md) and [ADR 0096](adr/0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md) and ordered by the [development plan](development/development-plan.md); the [automatic-delivery contract](adr/0093-automate-nightly-packages-and-windows-version-tag-releases.md) keeps its owners. The Owner's 2026-10-24 platform decision is [ADR 0097](adr/0097-defer-the-macos-platform-indefinitely-and-deliver-windows-only.md): Windows is the only delivery platform, and every macOS gate and target is deferred indefinitely. [PROGRESS](../PROGRESS.md) distinguishes integration state from the recorded dev baseline; an accepted design or an implemented workflow is not evidence of a delivered feature or an executed release.

## Design authority

Read only the family relevant to the selected outcome, resolving its status at the intended target under [design authority](agents/design-authority.md).

| Family | Role |
| --- | --- |
| [Context Map](../CONTEXT-MAP.md), [Glossary](../GLOSSARY.md) | Route to canonical domain definitions; glossary labels are an index, not competing definitions |
| [Root ADRs](adr/) | Accepted decisions and explicit supersession |
| [Editor surfaces](ui-ux-v2/editor-surfaces.md) | Current editor-facing execution specification, with clause-level amendments |
| [UI/UX reference](ui-ux-v2/README.md), [architecture reference](architecture-v2/README.md), [PRD](prd/ai7-v2-prd.md) | Frozen design/requirements inputs; not implementation status or launch authorization |
| [Policy documents](policies/README.md) | Versioned authority, schemas, immutable projections and target-qualified selection |
| [Kick-in](../kick-in/README.md) | Frozen migration/interview reasoning; consult a named decision, not the whole room |

## Named evidence and history

- [Initial v1.0.0 Development Milestone](development/milestone-1.0.0-scope.md): scope and exact completion record, with disclosed delivery limits.
- [Editorial-value evidence, 2026-10](development/editorial-evidence-2026-10.md): bounded measured pass, scoring corrections and provider-free replay.
- [Search backend evaluation](development/search-backend-evaluation.md): generated historical measurement supporting selection order; not a current price guarantee.
- [Design normalization provenance](development/design-baseline-allowlist.md): stable retrieval pointer for Issue #20's exact source/disposition accounting.
- [Documentation review, 2026-10](development/documentation-review-2026-10.md): this refresh's family findings, dispositions and unresolved work.

[Document lifecycle](agents/document-lifecycle.md) governs retention. Archives are excluded from ordinary current-state reading; use an exact archived artifact only for its named historical question. Superseded conflicting instructions remain in Git, not new archive copies. No documentation disposition admits private manuscripts, derivatives or credentials.
