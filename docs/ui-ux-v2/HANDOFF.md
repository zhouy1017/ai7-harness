# AI7 V2 UI/UX candidate handoff

Status: **61-question base, Issue #5 feature delta, Windows/macOS scope integration, and all five Issue #8 batches complete; candidate design only**

## Authority

- V2 architecture authority consumed only from exact object `247b7dacb267ba2f4076ca8461c95e5f0508b343` and the paths named in the dispatch.
- Frozen V1 semantics consumed only from exact object `587d6455f6a578d3df8a39f534ec7a057c07a18c`.
- Owner-provided Codex Desktop screenshot is interaction/visual reference evidence only.
- The candidate package is subordinate to architecture and accepted future decisions. It contains no implementation authority.
- ADR 0028 now governs platform scope: one AI7 product on Windows and macOS, with shared outcomes and explicit native adapters. Exact macOS package, data, Keychain, IPC, and signing/notarization mechanics remain deferred.
- Issue #8 work is a completed candidate delta on its own branch. Batches 1–5 resolve Book/import identity, cardinality, matching, reimport/staging, exact journal-newer `Task Input / 任务输入`, budget state/exhaustion, interrupted-Run Resume, explicit Book-targeted Source acquisition, Series Knowledge promotion, immediate Series Retrieval Exclusions, destination-independent Delivery Packages, native export collision handling, and versioned post-designation maintenance.

## Completed package

- [`README.md`](./README.md): accepted directions D-001–D-083 and authority boundary.
- [`CONTEXT.md`](./CONTEXT.md) and [`GLOSSARY.md`](./GLOSSARY.md): candidate presentation language and bilingual index.
- [`requirements.md`](./requirements.md): owner-accepted candidate UI/UX requirements.
- [`information-architecture.md`](./information-architecture.md): Book-anchored workbench and navigation/object relationships.
- [`interaction-spec.md`](./interaction-spec.md): state transitions, exact decisions, Runs, proposals, Effects, recovery, learning, settings and professional-work behavior.
- [`journeys.md`](./journeys.md): retained `J-01`–`J-14` plus new reusable-automation journey `J-15` mapped.
- [`visual-direction.md`](./visual-direction.md): Codex-referential but AI7-owned visual/interaction language.
- [`migration-from-v1.md`](./migration-from-v1.md): retain/reshape/drop boundary for the exact frozen reference.
- [`DECISION-QUEUE.md`](./DECISION-QUEUE.md): closed 61-question base, 9-question feature-delta history, and all five Issue #8 batches with ADR pointers.
- [`MISSING-DESIGN-DECISION-MAP.md`](./MISSING-DESIGN-DECISION-MAP.md): completed Issue #8 dependency map with all 18 decisions resolved.
- [`adr/`](./adr/): thirteen accepted-candidate ADRs for the hard-to-reverse UI/UX boundaries.

## High-level result

The package defines one Windows-and-macOS Chinese-first professional publishing workbench anchored by Book and Manuscript, with exact long-manuscript navigation/editing, Task Intent/Plan/authorization, fast/default execution, parallel Run controls and Rewind, choice-first clarification, manuscript-anchored independently decidable Proposal cards, diff-merge/Apply/receipt flow, factual evidence work, Milestone and Publication Versions, DOCX-primary local export, recovery/offline/learning/audit, role-first model setup, platform-native professional-work behavior, editable detached manuscript-window transfer and a complete V1 semantic migration.

The Issue #5 delta adds one low-burden reusable-procedure capture flow that classifies prior visible work into exactly one Default Execution Rule, Task Skill Candidate, Workflow Profile Draft or Developer Capability Proposal; strips instance data and authority; preserves type-specific admission/publication/enablement; and manages exact versions, linked deliveries, latest-eligible selection and history-preserving deletion through one Automation Center projection.

Issue #8 Batches 1–5 add explicit unselected Book target and existing-Book relationship selection; separate Book Creation Draft consequences; source-labeled title suggestions; zero-or-one primary Manuscript cardinality; lineage-honest restart-safe import/reimport; exact `任务输入` checkpointing; unset Run Budget Ceiling and explicit interrupted-Run `续行`; explicit Book-targeted Source acquisition; provenance-aware Series Knowledge promotion; immediate append-only Series Retrieval Exclusions; destination-/format-independent Delivery Packages with separate exports; native OS alternative-name/cancel/replace conflict handling; and immutable Maintenance Case revisions with internal-only Withdrawal/Archive. Root ADRs 0029–0040 own the hard-to-reverse boundaries.

Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt, internal Signoff, Milestone Version, Publication Version and Public Release Permission remain distinct. Reference Integrity, Claim Support and Factual Verification remain distinct. Model/Harness completion is never business proof.

## Explicit non-actions

No product code, prototype, Figma file, dependency, test, non-E2E validation gate, publication or release was created or performed. No old UI geometry/component/prototype/Figma asset was adopted as the V2 baseline. Issue #8 consists only of candidate documentation and advisory review on its repository branch.

## Commander next action

Integrate the completed Issue #8 candidate documentation through its Commander-owned pull request to `design-doc`. Preserve the settled local-export plus independent manual exact `发稿版本` boundary: no external sending, publisher/platform integration, delivery proof, recall/takedown claim or automatic publication. Keep every result as candidate design evidence until the owner explicitly accepts canonical `main` integration. Do not begin implementation without separate authorization.

## Integration boundary

Commander owns this issue branch and remains the sole integrator and external-action authority. Integration into `design-doc` preserves candidate status; no `main` acceptance, implementation, or publication is implied.

Working state at handoff:

- Recovery source: Codex snapshot `ca55b4255669eefd184a027e83a913e1875bbdc7` over `2932f61f5907558587122c7c4e0b92580951ab58`
- Reconciled target base: `origin/design-doc@7f622ddcfa774477a256a44998d56a2f8cadd326`, retaining the Source Checkout Buildability contract
- Branch: `docs/8-complete-missing-design-audit`
- Current Git state: all five bilingual grill batches and bounded conflict reconciliation are complete; normal commit, pull-request, and Commander integration metadata carry the final exact heads.
