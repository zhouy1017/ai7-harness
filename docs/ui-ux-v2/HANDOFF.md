# AI7 V2 UI/UX baseline handoff

Status: **Owner-approved Issue #86 implementation-facing successor; repository-current only in an exact integrated `dev` commit containing this revision; accepted-but-unintegrated elsewhere; not implementation or validation evidence**

## Authority and provenance

- Root ADRs, `docs/domain/*/CONTEXT.md`, and root `GLOSSARY.md` own shared architecture, authority, and domain language. This package owns V2 presentation and interaction only.
- The normalized package comes from exact frozen source `design-doc@6895f02d2983865516d267809d8cdda77026f62c` through the Issue #20 allowlist. Git history preserves the earlier Issue #5, #8, and #12 design lineage; those old integration routes are complete and are not current work.
- ADR 0028 governs one AI7 product on Windows and macOS with shared outcomes and explicit native variation. Exact macOS package, data location, Keychain adapter, IPC carrier, CPU policy, and signing/notarization mechanics remain deferred implementation decisions.
- Issue #86 normalization preserves the target baseline and records successor presentation for native DSH artifacts, Agent Workspace, covered analysis, Enrollment and Apply. It does not itself grant provider processing, external export, Public Release Permission, implementation, release, or promotion to `main`.

## Package map

- [`README.md`](./README.md): accepted directions D-001–D-087 and the target-qualified presentation boundary.
- [`CONTEXT.md`](./CONTEXT.md) and [`GLOSSARY.md`](./GLOSSARY.md): package-local presentation language and bilingual routing.
- [`requirements.md`](./requirements.md): 888 unique V2 UI/UX requirements.
- [`information-architecture.md`](./information-architecture.md), [`interaction-spec.md`](./interaction-spec.md), and [`visual-direction.md`](./visual-direction.md): the Book-anchored workbench, interaction contract, and AI7-owned visual language.
- [`journeys.md`](./journeys.md): J-01–J-16 design journeys. A journey design is not evidence that its branches are implemented.
- [`migration-from-v1.md`](./migration-from-v1.md): exact retain/reshape/drop provenance; the excluded V1 UI tree is not a baseline.
- [`DECISION-QUEUE.md`](./DECISION-QUEUE.md) and [`MISSING-DESIGN-DECISION-MAP.md`](./MISSING-DESIGN-DECISION-MAP.md): closed interview/delta decisions and resolved omissions.
- [`adr/`](./adr/): seventeen accepted UI/UX ADRs for hard-to-reverse presentation boundaries; ADRs 0015–0017 are the Issue #86 successor set.

## Retained invariants

The package defines one Chinese-first professional publishing workbench anchored by Book and Manuscript. It covers bounded long-manuscript navigation/editing, an explicitly Book-bound DSH-composed Agent Workspace, native artifact acquisition/validation/scoped enablement/update/rollback, Task/Plan review, foreground/default-rule/background-Enrollment authority, targeted retrieval and coverage-aware Result Sets, parallel Run controls, clarification, manuscript-anchored Proposals, exact single-use AI7 Apply/receipt, evidence work, Milestone/Publication Versions, recovery/offline/learning/audit, role-first Model Service setup, platform-native work, detached manuscript-window transfer and wait-by-default answer delivery.

Artifact discovery/acquisition/validation/install/scoped enablement, Artifact Update Rule, Default Execution Rule, Background Analysis Enrollment, Run Authorization, Proposal Decision, Review Decision, Effect Approval/Receipt, AI7 Apply, Signoff Record, Milestone Version, Publication Version and Public Release Permission remain distinct. Retrieval candidates, Coverage Manifest/Result Set, Reference Integrity, Claim Support and Factual Verification remain distinct. Model, Harness, tool, Session, feedback or metric success is never business proof.

## Current implementation route

The Issue #86 policy successor preserves Provider Processing v1 and v2 byte-for-byte and maps trusted operational scopes as development/CI → v1, exact fixture recording → v2, and ordinary production → new v3; External Export remains pinned to unchanged v1. This is a selection/policy contract only. It provides no trusted launch-selector implementation, credential, endpoint, live Provider call, runtime enforcement, external export, policy activation or cross-scope fallback authority.

Current target implementation remains only the bounded provider-free J-01 new-Book happy-path tracer: zero Providers, Agents and Sessions; atomic sample import to initial revision; one bounded 32-block window; and durable Edit Journal acknowledgement through the Electron/main/renderer/service boundary. It is not full J-01 and implements no native artifact lifecycle, Provider/credential/egress path, retrieval/Exact Fetch, covered analysis/Result Sets, Default Execution Rule execution, Background Analysis Enrollment, metrics, Proposal/Effect or AI7 Apply. Issue #86 changes documentation only and makes no source/schema/protocol/E2E/dependency change.

## Action boundary

Commander remains the sole integrator and external-action authority. This handoff creates no code, prototype, Figma artifact, dependency, provider call, export Effect, test gate, publication, release, or `main` promotion authority. Use the active Issue and Change Brief for exact action permission.
