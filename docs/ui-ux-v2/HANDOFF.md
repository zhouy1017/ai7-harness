# AI7 V2 UI/UX baseline handoff

Status: **Owner-accepted implementation-facing UI/UX baseline on `dev`; not implementation or validation evidence**

## Authority and provenance

- Root ADRs, `docs/domain/*/CONTEXT.md`, and root `GLOSSARY.md` own shared architecture, authority, and domain language. This package owns V2 presentation and interaction only.
- The normalized package comes from exact frozen source `design-doc@6895f02d2983865516d267809d8cdda77026f62c` through the Issue #20 allowlist. Git history preserves the earlier Issue #5, #8, and #12 design lineage; those old integration routes are complete and are not current work.
- ADR 0028 governs one AI7 product on Windows and macOS with shared outcomes and explicit native variation. Exact macOS package, data location, Keychain adapter, IPC carrier, CPU policy, and signing/notarization mechanics remain deferred implementation decisions.
- Package acceptance defines the `dev` design baseline. It does not itself grant provider processing, external export, Public Release Permission, release, or promotion to `main`.

## Package map

- [`README.md`](./README.md): accepted directions D-001–D-084 and the presentation boundary.
- [`CONTEXT.md`](./CONTEXT.md) and [`GLOSSARY.md`](./GLOSSARY.md): package-local presentation language and bilingual routing.
- [`requirements.md`](./requirements.md): 851 unique V2 UI/UX requirements.
- [`information-architecture.md`](./information-architecture.md), [`interaction-spec.md`](./interaction-spec.md), and [`visual-direction.md`](./visual-direction.md): the Book-anchored workbench, interaction contract, and AI7-owned visual language.
- [`journeys.md`](./journeys.md): J-01–J-16 design journeys. A journey design is not evidence that its branches are implemented.
- [`migration-from-v1.md`](./migration-from-v1.md): exact retain/reshape/drop provenance; the excluded V1 UI tree is not a baseline.
- [`DECISION-QUEUE.md`](./DECISION-QUEUE.md) and [`MISSING-DESIGN-DECISION-MAP.md`](./MISSING-DESIGN-DECISION-MAP.md): closed interview/delta decisions and resolved omissions.
- [`adr/`](./adr/): fourteen accepted UI/UX ADRs for hard-to-reverse presentation boundaries.

## Retained invariants

The package defines one Chinese-first professional publishing workbench anchored by Book and Manuscript. It covers bounded long-manuscript navigation and editing, Task Intent and Plan review, parallel Run controls, clarification, manuscript-anchored Proposals, Apply/receipt distinction, evidence work, Milestone and Publication Versions, recovery/offline/learning/audit, role-first model setup, platform-native professional-work behavior, detached manuscript-window transfer, and wait-by-default answer delivery.

Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt, Signoff Record, Milestone Version, Publication Version, and Public Release Permission remain distinct. Reference Integrity, Claim Support, and Factual Verification remain distinct. Model, Harness, tool, or Session success is never business proof.

## Current implementation route

After Issue #20 integrates this package, the authorized sequence is: land the minimum Provider Processing and External Export policy baselines in their own Issue, write the implementation-planning Issue and Change Brief, then deliver the bounded provider-free J-01 new-Book happy path.

That first tracer starts from a fresh checkout and public-synthetic DOCX, presents Review Before Import, atomically creates the Book, primary Manuscript, initial Manuscript Revision and import records, opens a bounded manuscript window, and confirms a durable Edit Journal through the production-shaped Electron main, renderer, separate Node service, and composed Harness/domain boundary. It does not claim the restart, ambiguity, reimport, existing-Book, source-only, or other accepted branches and therefore is not full J-01.

## Action boundary

Commander remains the sole integrator and external-action authority. This handoff creates no code, prototype, Figma artifact, dependency, provider call, export Effect, test gate, publication, release, or `main` promotion authority. Use the active Issue and Change Brief for exact action permission.
