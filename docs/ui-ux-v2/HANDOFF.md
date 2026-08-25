# AI7 V2 UI/UX candidate handoff

Status: **61-question base, Issue #5 feature delta, and Windows/macOS scope integration complete; candidate design only**

## Authority

- V2 architecture authority consumed only from exact object `247b7dacb267ba2f4076ca8461c95e5f0508b343` and the paths named in the dispatch.
- Frozen V1 semantics consumed only from exact object `587d6455f6a578d3df8a39f534ec7a057c07a18c`.
- Owner-provided Codex Desktop screenshot is interaction/visual reference evidence only.
- The candidate package is subordinate to architecture and accepted future decisions. It contains no implementation authority.
- ADR 0028 now governs platform scope: one AI7 product on Windows and macOS, with shared outcomes and explicit native adapters. Exact macOS package, data, Keychain, IPC, and signing/notarization mechanics remain deferred.

## Completed package

- [`README.md`](./README.md): accepted directions D-001–D-072 and authority boundary.
- [`CONTEXT.md`](./CONTEXT.md) and [`GLOSSARY.md`](./GLOSSARY.md): candidate presentation language and bilingual index.
- [`requirements.md`](./requirements.md): owner-accepted candidate UI/UX requirements.
- [`information-architecture.md`](./information-architecture.md): Book-anchored workbench and navigation/object relationships.
- [`interaction-spec.md`](./interaction-spec.md): state transitions, exact decisions, Runs, proposals, Effects, recovery, learning, settings and professional-work behavior.
- [`journeys.md`](./journeys.md): retained `J-01`–`J-14` plus new reusable-automation journey `J-15` mapped.
- [`visual-direction.md`](./visual-direction.md): Codex-referential but AI7-owned visual/interaction language.
- [`migration-from-v1.md`](./migration-from-v1.md): retain/reshape/drop boundary for the exact frozen reference.
- [`DECISION-QUEUE.md`](./DECISION-QUEUE.md): closed 61-question base and 9-question feature-delta history with ADR pointers.
- [`adr/`](./adr/): thirteen accepted-candidate ADRs for the hard-to-reverse UI/UX boundaries.

## High-level result

The package defines one Windows-and-macOS Chinese-first professional publishing workbench anchored by Book and Manuscript, with exact long-manuscript navigation/editing, Task Intent/Plan/authorization, fast/default execution, parallel Run controls and Rewind, choice-first clarification, manuscript-anchored independently decidable Proposal cards, diff-merge/Apply/receipt flow, factual evidence work, Milestone and Publication Versions, DOCX-primary local export, recovery/offline/learning/audit, role-first model setup, platform-native professional-work behavior, editable detached manuscript-window transfer and a complete V1 semantic migration.

The Issue #5 delta adds one low-burden reusable-procedure capture flow that classifies prior visible work into exactly one Default Execution Rule, Task Skill Candidate, Workflow Profile Draft or Developer Capability Proposal; strips instance data and authority; preserves type-specific admission/publication/enablement; and manages exact versions, linked deliveries, latest-eligible selection and history-preserving deletion through one Automation Center projection.

Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt, internal Signoff, Milestone Version, Publication Version and Public Release Permission remain distinct. Reference Integrity, Claim Support and Factual Verification remain distinct. Model/Harness completion is never business proof.

## Explicit non-actions

No product code, prototype, Figma file, dependency, test, non-E2E validation, formal review, merge, push, publication or release was created or performed. No old UI geometry/component/prototype/Figma asset was adopted as the V2 baseline. The only Git action for this delivery is a local documentation commit on the issue branch.

## Commander next action

Keep this package as candidate design evidence until the owner explicitly accepts Commander integration into the canonical design line. If requested, push the issue branch and open a pull request under repository dispatch rules; do not merge or begin implementation merely because the local documentation commit exists. Any later feature delta should again identify affected objects, journeys, authority boundaries and documents and create an ADR only when the domain-modeling three-part threshold is met.

## Integration boundary

Commander owns this issue branch and remains the sole integrator and external-action authority. The package is locally committed only; no push, pull request, merge or publication is implied.

Working state at handoff:

- Worktree: `C:\Users\Chooo\.codex\worktrees\aafe\ai7-harness`
- Base: `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
- Branch: `docs/5-ui-ux-v2-delta`
- Intended final Git state: clean after one local documentation commit; no push, pull request or merge.
