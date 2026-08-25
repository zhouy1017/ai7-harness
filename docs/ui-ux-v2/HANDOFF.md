# AI7 V2 UI/UX candidate handoff

Status: **61-question base, Issue #5 feature delta, Windows/macOS scope integration, all five Issue #8 batches, and the response-presentation delta complete; candidate design only**

## Authority

- V2 architecture authority consumed only from exact object `247b7dacb267ba2f4076ca8461c95e5f0508b343` and the paths named in the dispatch.
- Frozen V1 semantics consumed only from exact object `587d6455f6a578d3df8a39f534ec7a057c07a18c`.
- The owner-provided Codex Desktop screenshot is interaction/visual reference evidence only.
- The candidate package is subordinate to architecture and accepted future decisions. It contains no implementation authority.
- ADR 0028 governs platform scope: one AI7 product on Windows and macOS, with shared outcomes and explicit native adapters. Exact macOS package, data, Keychain, IPC, and signing/notarization mechanics remain deferred.

## Completed package

- [`README.md`](./README.md): accepted directions D-001–D-084 and authority boundary.
- [`CONTEXT.md`](./CONTEXT.md) and [`GLOSSARY.md`](./GLOSSARY.md): candidate presentation language and bilingual index.
- [`requirements.md`](./requirements.md): 851 unique candidate UI/UX requirements.
- [`information-architecture.md`](./information-architecture.md): Book-anchored workbench and navigation/object relationships.
- [`interaction-spec.md`](./interaction-spec.md): state transitions, exact decisions, Runs, proposals, Effects, recovery, learning, settings, response presentation, and professional-work behavior.
- [`journeys.md`](./journeys.md): retained `J-01`–`J-14` plus reusable-automation `J-15` and interactive-dialogue `J-16`.
- [`visual-direction.md`](./visual-direction.md): Codex-referential but AI7-owned visual/interaction language.
- [`migration-from-v1.md`](./migration-from-v1.md): retain/reshape/drop boundary for the exact frozen reference.
- [`DECISION-QUEUE.md`](./DECISION-QUEUE.md): closed 61-question base, 9-question feature delta, all five Issue #8 batches, and 7-question response-presentation delta.
- [`MISSING-DESIGN-DECISION-MAP.md`](./MISSING-DESIGN-DECISION-MAP.md): completed Issue #8 dependency map with all 18 decisions resolved.
- [`adr/`](./adr/): fourteen candidate or accepted-candidate ADRs for hard-to-reverse UI/UX boundaries.

## High-level result

The package defines one Windows-and-macOS Chinese-first professional publishing workbench anchored by Book and Manuscript, with exact long-manuscript navigation/editing, Task Intent/Plan/authorization, fast/default execution, parallel Run controls and Rewind, choice-first clarification, manuscript-anchored independently decidable Proposal cards, diff-merge/Apply/receipt flow, factual evidence work, Milestone and Publication Versions, DOCX-primary local export, recovery/offline/learning/audit, role-first model setup, platform-native professional-work behavior, editable detached manuscript-window transfer, and complete V1 semantic migration.

The Issue #5 delta adds governed reusable-procedure capture and exact version management. Issue #8 Batches 1–5 add explicit Book/import identity and recovery; exact `任务输入` checkpointing; unset Run Budget Ceiling and explicit interrupted-Run `续行`; explicit Source acquisition; provenance-aware Series Knowledge and immediate exclusions; destination-/format-independent Delivery Packages with separate exports; native OS collision handling; and immutable Maintenance Case revisions. Root ADRs 0029–0040 own their hard-to-reverse boundaries.

The response-presentation delta makes Waiting Only the default for Provider-bound work and permits progressive content only for foreground Interactive Editorial Dialogue. It specifies a non-raw Live Reasoning Summary, semantic answer fragments, source-bound citations, quiet background `等待回答`, explicit stop/interruption attempts, recoverable two-ledger joined answer history, and named promotion into separately governed objects without granting factual, manuscript, Proposal, learning, or execution authority. Its integration decision is D-084 and its journey is J-16.

Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt, internal Signoff, Milestone Version, Publication Version, and Public Release Permission remain distinct. Reference Integrity, Claim Support, and Factual Verification remain distinct. Model/Harness completion is never business proof.

## Explicit non-actions

No product code, prototype, Figma file, dependency, test, non-E2E validation gate, publication, or release was created or performed. No old UI geometry, component, prototype, or Figma asset was adopted as the V2 baseline.

## Commander next action

Integrate the completed response-presentation candidate through its Commander-owned Issue #12 pull request to `design-doc`, then preserve the whole package as candidate evidence until the owner separately accepts canonical `main` integration. Do not begin implementation without separate authorization.

## Integration boundary

Commander remains the sole integrator and external-action authority. Issue #8 entered `design-doc` through PR #11 at merge commit `226ccfd1e34665c42af178e54d47f6d0c918138c`. The response-presentation recovery source is commit `43398d769bbc55d7e78e8a4f1892ee8d4e61cb5c`, now reconciled on `docs/12-response-presentation` against that aggregate with the former D-073 collision resolved as D-084. Integration into `design-doc` preserves candidate status; no `main` acceptance, implementation, or publication is implied.
