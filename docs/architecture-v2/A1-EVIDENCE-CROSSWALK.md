# A1 evidence crosswalk

Status: **historical noncanonical reference; non-gating under ADR 0027 and Clarification 0004**

> This crosswalk preserves useful requirement and journey semantics. Its counts, exact-object mapping, evidence gaps, macOS discussion, and validation language are not V2 acceptance criteria, proof requests, CI inputs, or owner blockers. ADR 0028 now accepts Windows and macOS as one product; statements below about missing macOS evidence describe the historical packet only. Current decisions live in [README](./README.md), [Architecture](./ARCHITECTURE.md), and [Decision Queue](./DECISION-QUEUE.md).

> Issue #8 Batch 5 later supersedes the candidate package fields in `UX-WF-006`: destination, format, approval, and receipts belong to separate local exports, not Delivery Package identity. The pinned candidate wording remains historical evidence; current disposition follows [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md), [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md), and [ADR 0040](../adr/0040-preserve-post-designation-maintenance-as-versioned-cases.md).

This crosswalk replaces the UI candidate's broad source aliases with exact, manifest-admitted Git objects. It covers all **79/79** numbered candidate requirements and all **14/14** candidate journeys. A row says which accepted record owns the semantic claim; it does not accept the candidate screen, geometry, mechanism, state enum, or validation status.

## Source registry

All links below are immutable commit permalinks. The 51 row-mapped objects are enumerated in the [packet manifest at `c383afd`](https://github.com/zhouy1017/ai7-harness/blob/c383afd2fdb5f08342cde277b7babced6c1207fc/docs/architecture-exploration/PACKET-MANIFEST.md); `K-R` and `K-D` belong to that manifest's Commander-curated list and are pinned by the same containing commit. `C-DM` is a manifest `accepted` row re-derived like every other object; it is admitted evidence, not a new source class.

| Key | Exact packet object |
| --- | --- |
| [C-A](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/AGENTS.md) | Accepted `c8cbe26:AGENTS.md`. |
| [C-G](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/GLOSSARY.md) | Accepted bilingual index `c8cbe26:GLOSSARY.md`; definitions still belong to the contexts. |
| [C-ED](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/domain/editorial/CONTEXT.md) | Accepted Editorial context and exact term owners. |
| [C-EX](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/domain/execution/CONTEXT.md) | Accepted Execution context and exact term owners. |
| [C-DM](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/kick-in/05-decision-map.md) | Accepted design-interview decision map `c8cbe26:kick-in/05-decision-map.md`; blob `520596740050d04d61087cbb6203653c2c890258`; 21751 bytes. It records each question's accepted outcome, not a UI contract. |
| [C-01](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0001-versioned-editorial-dimension-configuration.md) | ADR 0001 — Editorial Dimension configuration. |
| [C-02](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md) | ADR 0002 — Book, Series, Cross-project, and House scopes. |
| [C-03](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0003-use-foundation-models-with-governed-editorial-intelligence.md) | ADR 0003 — governed editorial intelligence, no LLM training. |
| [C-04](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md) | ADR 0004 — Learning Eligibility Policy governance. |
| [C-05](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0005-separate-textual-and-factual-authority.md) | ADR 0005 — textual versus factual authority. |
| [C-06](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0006-preserve-manuscript-native-history-and-recovery.md) | ADR 0006 — manuscript history, proposals, atomic apply, and recovery. |
| [C-07](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0007-separate-decisions-authority-and-effect-proof.md) | ADR 0007 — named decisions, authority, Effect proof. |
| [C-08](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0008-use-deliverable-owned-workflow-profiles.md) | ADR 0008 — deliverable-owned workflow. |
| [C-09](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0009-use-authority-bearing-plan-envelopes.md) | ADR 0009 — Task Intent, Plan Envelope, adaptation, and revision. |
| [C-10](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0010-separate-task-skill-instruction-implementation-and-authority.md) | ADR 0010 — Task Skill, capability, activation, and scope. |
| [C-11](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md) | ADR 0011 — accepted Task Ledger/Harness Session Ledger split and continuation meanings at the canonical baseline. |
| [C-13](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0013-ship-standalone-only-v1.md) | ADR 0013 — Standalone-only V1, editing sufficiency, Word exclusion. |
| [C-16](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md) | ADR 0016 — manuscript persistence/publication and provider processing. |
| [C-17](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0017-full-engine-narrow-tool-surface.md) | ADR 0017 — domain capabilities, retrievability, Agent Data Root intent. |
| [C-18](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0018-tiered-activation-for-agent-authored-revisions.md) | ADR 0018 — developer-reviewed Policy Documents and hidden assets. |
| [C-19](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0019-editorial-quality-metrics-and-behavior-evaluation-gate.md) | ADR 0019 — Quality Signals, workload displacement, feedback, zero data. |
| [C-21](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0021-single-execution-authority.md) | ADR 0021 — parallel Runs, AI7 business scheduling, and one Harness loop implementation at the canonical baseline. |
| [C-23](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0023-portable-release-with-self-contained-data-root.md) | ADR 0023 — canonical Windows channel/data-location behavior at the base. |
| [C-25](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md) | ADR 0025 — accepted scale and whole-manuscript outcomes; its mechanisms are outside A1. |
| [C-26](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0026-manuscript-retrieval-returns-candidates.md) | ADR 0026 — Exact Fetch, candidates-not-truth, projection freshness. |
| [U-R](https://github.com/zhouy1017/ai7-harness/blob/587d6455f6a578d3df8a39f534ec7a057c07a18c/docs/ui-ux/requirements.md) | UI candidate requirements, 79 exact IDs. |
| [U-T](https://github.com/zhouy1017/ai7-harness/blob/587d6455f6a578d3df8a39f534ec7a057c07a18c/docs/ui-ux/traceability.md) | UI candidate 79-row trace and its candidate flags. |
| [U-I](https://github.com/zhouy1017/ai7-harness/blob/587d6455f6a578d3df8a39f534ec7a057c07a18c/docs/ui-ux/interaction-spec.md) | UI candidate interaction contract and J-01–J-14. |
| [U-A](https://github.com/zhouy1017/ai7-harness/blob/587d6455f6a578d3df8a39f534ec7a057c07a18c/docs/ui-ux/information-architecture.md) | UI candidate information architecture. |
| [U-U](https://github.com/zhouy1017/ai7-harness/blob/587d6455f6a578d3df8a39f534ec7a057c07a18c/docs/ui-ux/usability-test-plan.md) | UI candidate usability plan; no sessions run. |
| [U-V](https://github.com/zhouy1017/ai7-harness/blob/587d6455f6a578d3df8a39f534ec7a057c07a18c/docs/ui-ux/visual-system.md) | UI candidate visual/accessibility reference; geometry and Windows mechanics remain candidate-only. |
| [P-H](https://github.com/zhouy1017/ai7-harness/blob/960689172bcf54eb3f27b57045a4ce4e9f20695d/kick-in/37-v1-platform-freeze-handoff.md) | Platform candidate freeze handoff. |
| [P-W](https://github.com/zhouy1017/ai7-harness/blob/960689172bcf54eb3f27b57045a4ce4e9f20695d/kick-in/35-windows-macos-product-platform.md) | Platform candidate consistency recommendation and open mechanics. |
| [P-27](https://github.com/zhouy1017/ai7-harness/blob/960689172bcf54eb3f27b57045a4ce4e9f20695d/docs/adr/0027-support-windows-and-macos-as-one-product.md) | Historical source-branch platform ADR 0027; integrated as current ADR 0028 after resolving the aggregate numbering collision. |
| [P-F](https://github.com/zhouy1017/ai7-harness/blob/960689172bcf54eb3f27b57045a4ce4e9f20695d/docs/policies/factual-verification-policy.md) | Candidate Q16 five-rule policy wording. |
| [K-R](https://github.com/zhouy1017/ai7-harness/blob/c383afd2fdb5f08342cde277b7babced6c1207fc/docs/architecture-exploration/REVIEW-PACKET.md) | Commander-curated evidence/status packet at `c383afd`. |
| [K-D](https://github.com/zhouy1017/ai7-harness/blob/c383afd2fdb5f08342cde277b7babced6c1207fc/docs/architecture-exploration/CANDIDATE-DELTA-REVIEW.md) | Independent candidate-delta synopsis and A1 brief at `c383afd`. |

## Disposition legend and totals

The primary disposition is exclusive so the matrix is countable:

| Code | Meaning | Count |
| --- | --- | ---: |
| `S` | Shared semantic: an accepted record owns the meaning, while presentation may still vary. | 60 |
| `N` | Native variation: the shared outcome is constrained, but the OS interaction/facility cannot be copied. | 5 |
| `H` | Candidate-only hypothesis: useful for revalidation, but no accepted record makes this UI/product choice mandatory. | 10 |
| `E` | Evidence/schema gap: desired behavior is plausible but the sealed accepted records do not define or prove the complete claim. | 4 |
|  | **Total** | **79** |

`S` never means pixel identity. `H` never means rejected. `E` never authorizes a mechanism or implementation spike in A1.

## 79 numbered requirements

### Shell, navigation, and work queue

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-IA-001`; [U-T](#source-registry) same row | [C-A](#source-registry) Book authority; [C-02](#source-registry) | S | Book authority is shared. Book-first navigation remains a product hypothesis, not a folder-derived authority. |
| [U-R](#source-registry) `UX-IA-002`; [U-T](#source-registry) same row | [C-EX](#source-registry) `Clarification Request` / `Task Outcome`; [C-21](#source-registry) | H | Durable attention records and parallel Runs are accepted; one global queue and its exact categories are not. |
| [U-R](#source-registry) `UX-IA-003`; [U-T](#source-registry) same row | [C-EX](#source-registry) `Event Projection` / `Task Ledger`; [C-11](#source-registry) | S | If a queue exists, it is a projection and must navigate to the authoritative record. |
| [U-R](#source-registry) `UX-IA-004`; [U-T](#source-registry) same row | [C-ED](#source-registry) `Manuscript Pin` / `Edit Journal` / `Manuscript Checkpoint` / `Recovery Snapshot` | H | Exact context must be available; a persistent header with this exact field set and placement is candidate UI. |
| [U-R](#source-registry) `UX-IA-005`; [U-T](#source-registry) same row | No accepted record | H | Independent side-panel collapse and “no fourth panel” are geometry, expressly not A1 architecture. |
| [U-R](#source-registry) `UX-IA-006`; [U-T](#source-registry) same row | [C-EX](#source-registry) `Run Source Scope`; [C-02](#source-registry); [C-17](#source-registry) | S | Scope visibility and no ambient whole-library authority are shared; the search control is not. |
| [U-R](#source-registry) `UX-IA-007`; [U-T](#source-registry) same row | [C-ED](#source-registry) `Editorial Review` / `Review Article`; [C-G](#source-registry) | S | Preferred terms remain distinct on every supported product surface. |

### Book, Series, and deliverables

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-BOOK-001`; [U-T](#source-registry) | [C-ED](#source-registry) `Editorial Deliverable`; [C-08](#source-registry) | S | Manuscript and three related deliverables have independent workflow state. |
| [U-R](#source-registry) `UX-BOOK-002`; [U-T](#source-registry) | [C-ED](#source-registry) `Series` / `Series Corpus`; [C-02](#source-registry) | S | Series is explicit/versioned, never an inferred folder. |
| [U-R](#source-registry) `UX-BOOK-003`; [U-T](#source-registry) | [C-EX](#source-registry) `Run Source Scope`; [C-02](#source-registry) | S | Cross-project sources are selected per task, not a standing workspace. |
| [U-R](#source-registry) `UX-BOOK-004`; [U-T](#source-registry) | [C-17](#source-registry); [C-ED](#source-registry) `Source Version` / `Editorial Deliverable` / `Delivery Package` | S | Reachability, provenance, and version identity are shared; exact navigation/export UI is open. |
| [U-R](#source-registry) `UX-BOOK-005`; [U-T](#source-registry) | [C-A](#source-registry) Book authority; [C-02](#source-registry) | S | Recent/pinned views may aid navigation but never change authority. |

### Import and fidelity

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-IMP-001`; [U-T](#source-registry) | [C-17](#source-registry) | N | Bounded user-chosen import is shared; picker, permission, bookmark/token, and path treatment are native. |
| [U-R](#source-registry) `UX-IMP-002`; [U-T](#source-registry) | [C-A](#source-registry) professional editing sufficiency; [C-13](#source-registry) | S | Preserve / degrade with disclosure / reject applies to every named document class. |
| [U-R](#source-registry) `UX-IMP-003`; [U-T](#source-registry) | [C-A](#source-registry) no silent loss; [C-13](#source-registry) | S | Silent loss blocks. The exact acknowledgment interaction remains a candidate. |
| [U-R](#source-registry) `UX-IMP-004`; [U-T](#source-registry) | [C-ED](#source-registry) `Source Version` / `Manuscript Revision` | E | Identity/version/provenance exist, but the complete import-time/format/detected-structure schema is not accepted. |
| [U-R](#source-registry) `UX-IMP-005`; [U-T](#source-registry) | [C-ED](#source-registry) `Manuscript Block` / `Manuscript Revision`; [C-06](#source-registry) | E | Stable structural lineage exists; reimport matching and ambiguity resolution do not yet have a sealed contract. |

### Long-manuscript editing

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-ED-001`; [U-T](#source-registry) | [C-A](#source-registry) scale outcomes; [C-25](#source-registry) | H | Mixed clause: scale is accepted, while centered geometry, line length, window/store language, and visual continuity are not A1 invariants. |
| [U-R](#source-registry) `UX-ED-002`; [U-T](#source-registry) | [C-25](#source-registry) | H | This disclosure is coupled to the current renderer mechanism; A1 preserves boundedness outcomes, not the wording. |
| [U-R](#source-registry) `UX-ED-003`; [U-T](#source-registry) | [C-A](#source-registry) whole-manuscript index-time requirement; [C-25](#source-registry) | S | Outline/find/replace/jump operate over the whole manuscript on every supported target. |
| [U-R](#source-registry) `UX-ED-004`; [U-T](#source-registry) | [C-ED](#source-registry) `Manuscript Block` / `Manuscript Pin` / `Correction Proposal`; [C-06](#source-registry); [C-09](#source-registry) | E | Exact pins are accepted; full Unicode/IME/clipboard/comment/finding/Effect interoperability is unproven. |
| [U-R](#source-registry) `UX-ED-005`; [U-T](#source-registry) | [C-ED](#source-registry) `Edit Journal` / `Manuscript Checkpoint` / `Recovery Snapshot`; [C-06](#source-registry) | S | Durable editing and recovery semantics are shared; undo presentation may vary. |
| [U-R](#source-registry) `UX-ED-006`; [U-T](#source-registry) | [C-ED](#source-registry) `Edit Journal` / `Manuscript Checkpoint`; [C-G](#source-registry) | S | Journal persistence acknowledgment never means a Manuscript Checkpoint. |
| [U-R](#source-registry) `UX-ED-007`; [U-T](#source-registry) | [C-ED](#source-registry) `Manuscript Revision` / `Recovery Snapshot`; [C-06](#source-registry) | S | Recovery identifies the source record and creates a descendant rather than rewriting history. |
| [U-R](#source-registry) `UX-ED-008`; [U-T](#source-registry) | [C-A](#source-registry) scale; [C-21](#source-registry); [C-25](#source-registry) | S | Whole-manuscript work reports progress/cancellation and does not block ordinary editing; mechanism is outside A1. |
| [U-R](#source-registry) `UX-ED-009`; [U-T](#source-registry) | [C-A](#source-registry) whole-manuscript navigation; [C-25](#source-registry) | H | Whole-manuscript navigation is accepted; a global-position model, position rail, and scroll-thumb realization are candidate-only. |

### Task capture, preflight, and authorization

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-TASK-001`; [U-T](#source-registry) | [C-EX](#source-registry) `Task Intent` | H | Task capture is required; bottom entry/right inspector geometry is not. |
| [U-R](#source-registry) `UX-TASK-002`; [U-T](#source-registry) | [C-EX](#source-registry) `Task Intent` / `Task Skill`; [C-10](#source-registry) | H | Task Skill binding is shared; the natural-language-plus-template interaction is a hypothesis. |
| [U-R](#source-registry) `UX-TASK-003`; [U-T](#source-registry) | [C-EX](#source-registry) `Task Intent` / `Provider Preflight` / `Plan Envelope` / `Outbound Data Category`; [C-ED](#source-registry) `Task Editorial Dimension Snapshot`; [C-09](#source-registry); [C-10](#source-registry) | S | Preflight exposes exact target, scope, dimensions, provider/data, budget, outcome, capabilities, and Effect classes. |
| [U-R](#source-registry) `UX-TASK-004`; [U-T](#source-registry) | [C-EX](#source-registry) `Plan Preview` / `Run Authorization`; [C-09](#source-registry) | S | Plan Preview is reachable and carries no authority. |
| [U-R](#source-registry) `UX-TASK-005`; [U-T](#source-registry) | [C-EX](#source-registry) `Run Authorization` / `Effect Approval`; [C-ED](#source-registry) `Proposal Decision` / `Review Decision` / `Public Release Permission`; [C-07](#source-registry); [C-09](#source-registry) | S | Run Authorization grants none of the other named decisions or outcome proof. |
| [U-R](#source-registry) `UX-TASK-006`; [U-T](#source-registry) | [C-EX](#source-registry) `Plan Revision` / `Plan Envelope`; [C-09](#source-registry); [C-10](#source-registry) | S | Material drift suspends and requires a versioned revision plus renewed authorization. |
| [U-R](#source-registry) `UX-TASK-007`; [U-T](#source-registry) | [C-EX](#source-registry) `Plan Adaptation` / `Task Outcome`; [C-09](#source-registry) | S | In-envelope adaptation remains inspectable as actual versus planned work. |

### Running work and continuation

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-RUN-001`; [U-T](#source-registry) | [C-EX](#source-registry) `Run Record` / `Clarification Request` / `Task Outcome`; [C-11](#source-registry) | S | Users see AI7 business state; technical execution records or events never replace it. Exact rendering is open. |
| [U-R](#source-registry) `UX-RUN-002`; [U-T](#source-registry) | [C-21](#source-registry) | S | Independent Runs continue while the editor edits or changes Books. |
| [U-R](#source-registry) `UX-RUN-003`; [U-T](#source-registry) | [C-07](#source-registry); [C-21](#source-registry); [C-EX](#source-registry) `Effect Receipt` | S | Pause and cancellation differ; cancellation never claims to undo committed Effects. |
| [U-R](#source-registry) `UX-RUN-004`; [U-T](#source-registry) | [C-EX](#source-registry) `Clarification Request` / `Run Record` | S | Clarification is durable and bound to the exact ambiguity/state. |
| [U-R](#source-registry) `UX-RUN-005`; [U-T](#source-registry) | [C-EX](#source-registry) `Resume` / `Retry` / `Redo` / `Replay`; [C-G](#source-registry) | S | Identity and execution consequences remain distinct. |
| [U-R](#source-registry) `UX-RUN-006`; [U-T](#source-registry) | [C-EX](#source-registry) `Ambiguous External Outcome` / `Manual Outcome Resolution` / `Retry`; [C-07](#source-registry) | S | Ambiguity disables automatic retry/fallback until evidence establishes safety. |
| [U-R](#source-registry) `UX-RUN-007`; [U-T](#source-registry) | [C-EX](#source-registry) `Protected Secret Store`; [C-11](#source-registry); [C-16](#source-registry); [C-19](#source-registry) | H | Secrets/transcripts must not leak, but an absolute ban on all local excerpt projection in queue/notifications is not accepted. |

### Evidence, review, and factual verification

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-EVD-001`; [U-T](#source-registry) | [C-ED](#source-registry) `Textual Source of Record` / `Source Version` / `Manuscript Pin` / `Manuscript Retrieval Chunk`; [C-05](#source-registry); [C-26](#source-registry) | S | Evidence resolves to an exact immutable revision/range; opening/highlighting is an interaction choice. |
| [U-R](#source-registry) `UX-EVD-002`; [U-T](#source-registry) | [C-ED](#source-registry) `Source Version` / `Factual Verification Policy Document` / `Manuscript Retrieval Chunk`; [C-05](#source-registry); [C-26](#source-registry) | S | Identity, version, role, range, provenance, freshness, and Exact Fetch status remain available. |
| [U-R](#source-registry) `UX-EVD-003`; [U-T](#source-registry) | [C-A](#source-registry) factual-verification rule; [C-05](#source-registry) | S | Reference Integrity, Claim Support, and Factual Verification never collapse. |
| [U-R](#source-registry) `UX-EVD-004`; [U-T](#source-registry) | [C-ED](#source-registry) `Factual Verification`; [C-05](#source-registry); candidate extension [P-F](#source-registry) | E | The canonical base does not define all five first-class outcomes; the exact five-state set appears only in candidate evidence. |
| [U-R](#source-registry) `UX-EVD-005`; [U-T](#source-registry) | [C-ED](#source-registry) `Factual Verification`; [C-05](#source-registry) | S | Foundation Model knowledge is a research lead, never factual evidence. |
| [U-R](#source-registry) `UX-EVD-006`; [U-T](#source-registry) | [C-ED](#source-registry) `Editorial Review` / `Review Decision`; [C-05](#source-registry); [C-19](#source-registry); candidate Q16 [P-F](#source-registry) | S | Judgment remains labeled as judgment; required rationale/passages presentation is candidate detail. |
| [U-R](#source-registry) `UX-EVD-007`; [U-T](#source-registry) | [C-ED](#source-registry) `Editorial Error Finding` / `Correction Proposal`; [C-05](#source-registry) | S | A finding may remain unresolved or become a query/proposal; no rewrite is forced. |

### Proposals, application, and conflicts

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-PROP-001`; [U-T](#source-registry) | [C-ED](#source-registry) `Proposal Branch` / `Correction Proposal`; [C-06](#source-registry) | S | Generated manuscript change begins on a Proposal Branch. |
| [U-R](#source-registry) `UX-PROP-002`; [U-T](#source-registry) | [C-ED](#source-registry) `Proposal Decision`; [C-06](#source-registry) | H | Inline versus comparison layout and the small/large threshold are not accepted product semantics. |
| [U-R](#source-registry) `UX-PROP-003`; [U-T](#source-registry) | [C-ED](#source-registry) `Proposal Decision` / `Review Decision` | S | Accept/modify/selective/alternative/redo/reject are canonical; `defer` must be qualified or formally added rather than borrowed from Review Decision. |
| [U-R](#source-registry) `UX-PROP-004`; [U-T](#source-registry) | [C-ED](#source-registry) `Proposal Decision`; [C-EX](#source-registry) `Effect Approval` / `Effect Receipt`; [C-07](#source-registry) | S | Proposal disposition and application/outcome remain separate even in one compact interaction. |
| [U-R](#source-registry) `UX-PROP-005`; [U-T](#source-registry) | [C-EX](#source-registry) `Effect Receipt` / `Ambiguous External Outcome` / `Manual Outcome Resolution`; [C-07](#source-registry) | S | Application success requires exact receipt or classified outcome evidence. |
| [U-R](#source-registry) `UX-PROP-006`; [U-T](#source-registry) | [C-ED](#source-registry) `Manuscript Pin`; [C-EX](#source-registry) `Effect Approval`; [C-07](#source-registry) | S | Pin and drift invalidation are shared; exact display is open. |
| [U-R](#source-registry) `UX-PROP-007`; [U-T](#source-registry) | [C-ED](#source-registry) `Manuscript Conflict`; [C-06](#source-registry) | S | Interacting conflicts require explicit, atomic resolution. |
| [U-R](#source-registry) `UX-PROP-008`; [U-T](#source-registry) | [C-ED](#source-registry) `Proposal Branch` / `Manuscript Conflict`; [C-06](#source-registry) | S | A model-composed conflict resolution remains a proposal. |

### Deliverable workflow and delivery

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-WF-001`; [U-T](#source-registry) | [C-ED](#source-registry) `Workflow Profile` / `Workflow Instance`; [C-08](#source-registry) | S | Each deliverable exposes its pinned profile version and independent instance. |
| [U-R](#source-registry) `UX-WF-002`; [U-T](#source-registry) | [C-ED](#source-registry) `Workflow Phase`; [C-08](#source-registry); [C-A](#source-registry) | S | Phase status supports wait/skip/reopen and never becomes one Book percentage. |
| [U-R](#source-registry) `UX-WF-003`; [U-T](#source-registry) | [C-ED](#source-registry) `Workflow Gate` / `Review Decision` / `Signoff Record`; [C-08](#source-registry) | S | Gate evidence, Review Decision, and Signoff Record remain distinct; the candidate drift marker and presentation are not promoted. |
| [U-R](#source-registry) `UX-WF-004`; [U-T](#source-registry) | [C-ED](#source-registry) `Editorial Artifact`; [C-07](#source-registry); [C-08](#source-registry) | S | Typed, versioned, provenance-bearing artifact identity is shared; candidate pin/decision/receipt fields require links to their separate records and are not implied artifact fields. |
| [U-R](#source-registry) `UX-WF-005`; [U-T](#source-registry) | [C-ED](#source-registry) `Signoff Record` / `Public Release Permission`; [C-EX](#source-registry) `External Export Policy`; [C-07](#source-registry); [C-08](#source-registry) | S | Signoff, non-provider export, and public release are separate interactions and authorities. |
| [U-R](#source-registry) `UX-WF-006`; [U-T](#source-registry) | Current [Editorial context](../domain/editorial/CONTEXT.md) `Editorial Deliverable Revision` / `Delivery Package`; current [Execution context](../domain/execution/CONTEXT.md) `Local Export Preparation`; [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md); [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md) | S | Exact revision, package purpose, required artifacts, Signoff references, exclusions and limitations belong to one destination/format-independent package version. The candidate row's destination, permissions and final receipts as package fields are superseded: format, path, fidelity, approval and per-file receipt belong to a separate local export and never become package-owned authority. |
| [U-R](#source-registry) `UX-WF-007`; [U-T](#source-registry) | [C-ED](#source-registry) `Signoff Record` / `Public Release Permission`; [C-05](#source-registry); [C-07](#source-registry); [C-08](#source-registry); [C-19](#source-registry) | S | Completion/signoff grants no factual, legal, learning, Effect, or release authority. |

### Feedback, quality, learning, and audit

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-LEARN-001`; [U-T](#source-registry) | [C-19](#source-registry) | S | Result feedback is optional and non-blocking. |
| [U-R](#source-registry) `UX-LEARN-002`; [U-T](#source-registry) | [C-19](#source-registry) | S | Offer several unselected reasons and distinguish accepting a guess from correcting it. |
| [U-R](#source-registry) `UX-LEARN-003`; [U-T](#source-registry) | [C-ED](#source-registry) `Quality Signal` / `Learning Material` / `Learning Eligibility Decision` / `Learning Audit Log`; [C-EX](#source-registry) `Policy Document` | S | Decisions remain separate; `Memory Candidate` lacks an accepted exact term and must be normalized. |
| [U-R](#source-registry) `UX-LEARN-004`; [U-T](#source-registry) | [C-ED](#source-registry) `Learning Material` / `Learning Eligibility Decision` / `Learning Lineage`; [C-04](#source-registry) | S | Material identity, scope, explicit eligibility override, and lineage are shared; the candidate's immediate/future-influence field presentation is not promoted. |
| [U-R](#source-registry) `UX-LEARN-005`; [U-T](#source-registry) | [C-ED](#source-registry) `Learning Lineage` / `Learning Audit Log`; [C-04](#source-registry) | S | Lineage is traceable forward and backward. |
| [U-R](#source-registry) `UX-LEARN-006`; [U-T](#source-registry) | [C-DM](#source-registry) row 13 (`Accepted with audit requirement`); [C-ED](#source-registry) `Learning Eligibility Decision` / `Learning Lineage`; [C-04](#source-registry) | S | Split clause. Accepted: user rollback, forgetting, and version-snapshot semantics, and the rule that forgetting never deletes the original editorial evidence. Still candidate: the preview interaction and presentation, and the exact affected-running-task detail the row displays. The accepted record settles the semantics, not the candidate UI preview contract. |
| [U-R](#source-registry) `UX-LEARN-007`; [U-T](#source-registry) | [C-ED](#source-registry) `Delivery Quality Metric`; [C-19](#source-registry) | S | Delivery quality and workload displacement are paired. |
| [U-R](#source-registry) `UX-LEARN-008`; [U-T](#source-registry) | [C-19](#source-registry) | S | Per-task time tracking remains excluded. |
| [U-R](#source-registry) `UX-LEARN-009`; [U-T](#source-registry) C01 | [C-18](#source-registry); [C-A](#source-registry) later Policy rule; [C-EX](#source-registry) `Policy Document` / `Editorial Capability Profile` | S | Current baseline precedence requires hidden, developer-reviewed Policy assets, so the candidate's `BLOCKED-C01` flag is stale. Any future editorial visibility/activation is an explicit supersession option, not an unresolved sealed-baseline actor. |

### Settings and onboarding

| ID and exact candidate source | Canonical record owner | Primary disposition | A1 mapping |
| --- | --- | --- | --- |
| [U-R](#source-registry) `UX-SET-001`; [U-T](#source-registry) | [C-17](#source-registry); [C-23](#source-registry); [C-EX](#source-registry) `Agent Data Root` | N | Explain channel/data location without path literacy; paths, relocations, and channel behavior are native. |
| [U-R](#source-registry) `UX-SET-002`; [U-T](#source-registry) | [C-23](#source-registry) | N | `%LOCALAPPDATA%\AI7` is a Windows rule, not a cross-platform invariant. |
| [U-R](#source-registry) `UX-SET-003`; [U-T](#source-registry) | [C-16](#source-registry); [C-23](#source-registry) | N | Non-blocking unpublished-material warning is shared; known-root detection/remediation are native. |
| [U-R](#source-registry) `UX-SET-004`; [U-T](#source-registry) | [C-EX](#source-registry) `Credential Reference` / `Credential Broker` / `Protected Secret Store`; [C-17](#source-registry); [C-23](#source-registry) | N | Secret-isolation outcome is shared; secure-store and permission UI are native. |
| [U-R](#source-registry) `UX-SET-005`; [U-T](#source-registry) | [C-EX](#source-registry) `Provider Processing Policy` / `Outbound Data Category`; [C-ED](#source-registry) `Public Release Permission`; [C-16](#source-registry) | S | Model processing, external export, and public release stay separate. |
| [U-R](#source-registry) `UX-SET-006`; [U-T](#source-registry) | [C-ED](#source-registry) `Editorial Dimension` / `Editorial Profile` / `Archived Editorial Dimension`; [C-01](#source-registry) | S | Stable identity, versioning, prospective change, and archive-not-delete are shared. |
| [U-R](#source-registry) `UX-SET-007`; [U-T](#source-registry) | [C-ED](#source-registry) `Workflow Profile` / `Workflow Instance`; [C-08](#source-registry) | S | Reusable profile and active instance remain different records. |
| [U-R](#source-registry) `UX-SET-008`; [U-T](#source-registry) | [C-EX](#source-registry) `Editorial Capability Profile` / `Developer Capability Profile`; [C-17](#source-registry) | S | The shipped UI exposes no developer-profile escalation or generic security-level toggle. |

## Fourteen journeys

The exact journey definitions are [U-I §18](#source-registry); validation intent and the explicit “not run/not verified” boundary are [U-U §§6–10](#source-registry).

| Journey | Exact canonical records and shared terminal meaning | Native variation / candidate detail | Negative guarantee and evidence gap |
| --- | --- | --- | --- |
| `J-01` import and fidelity | [C-ED](#source-registry) `Source Version` / `Manuscript Revision` / `Textual Source of Record`; [C-07](#source-registry); [C-13](#source-registry); [C-17](#source-registry). Fidelity classes and any authoritative write/outcome proof are shared. | Picker, drag/drop, system permission, path presentation, and staged-view geometry. | No roaming filesystem, silent loss, manuscript-bearing diagnostics, or claimed DOCX proof. Import transaction/schema and cancellation recovery remain open. |
| `J-02` long manuscript | [C-ED](#source-registry) `Manuscript Branch` / `Manuscript Revision` / `Manuscript Block` / `Edit Journal` / `Manuscript Checkpoint`; [C-06](#source-registry); [C-25](#source-registry); [C-26](#source-registry). Scale, full-manuscript operations, exactness, and durability are shared. | IME, text-service, scroll, selection, shortcut, and assistive-technology mechanics. | A synthetic 10M usability fixture proves neither performance nor persistence; no stale projection becomes authoritative text. |
| `J-03` Task Intent to Run | [C-ED](#source-registry) `Manuscript Pin` / `Task Editorial Dimension Snapshot`; [C-EX](#source-registry) `Task Intent` through `Task Outcome`; [C-09](#source-registry); [C-10](#source-registry); [C-11](#source-registry). | Selection gestures, composer/inspector layout, notification and focus treatment. | Task Intent submission is not Run launch; Plan Preview has no authority; no silent retarget or other named decision is implied. Current Policy-identity visibility follows the sealed baseline. |
| `J-04` factual finding and Exact Fetch | [C-ED](#source-registry) `Manuscript Assertion` / `Editorial Error Finding` / `Source Version` / `Correction Proposal`; [C-05](#source-registry); [C-26](#source-registry). Three evidence dimensions remain independent. | Evidence-card layout, exact-jump and return-focus interaction. | No green aggregate truth, fuzzy/cached text as exact evidence, model belief as evidence, forced rewrite, or scope-broadening stale link. Full state enums remain candidate/evidence-gap material. |
| `J-05` correction proposal/apply | [C-ED](#source-registry) `Correction Proposal` / `Proposal Branch` / `Proposal Decision` / `Manuscript Pin`; [C-EX](#source-registry) `Effect Intent` / `Effect Approval` / `Effect Receipt`; [C-06](#source-registry); [C-07](#source-registry). | Inline/side-by-side/tab comparison and diff navigation. | Proposal edit never changes active text; decision/toast/tool result never proves application; stale Effect Approval never floats to changed target/payload. |
| `J-06` manuscript conflict | [C-ED](#source-registry) `Proposal Branch` / `Manuscript Conflict` / `Manuscript Revision`; [C-06](#source-registry); [C-07](#source-registry). Explicit resolution and atomicity are shared. | Base/current/proposal layout and native diff presentation. | No last-write-wins, partial original Effect, or automatic authority for model-composed resolution. Detection/re-anchoring mechanisms remain open. |
| `J-07` workflow, package, local export and maintenance | Current [Editorial context](../domain/editorial/CONTEXT.md) `Editorial Deliverable Revision` / `Milestone Version` / `Delivery Package` / `Publication Version` / `Maintenance Case`; current [Execution context](../domain/execution/CONTEXT.md) `Local Export Preparation` / `External Export Policy` / Effects; [C-07](#source-registry); [C-08](#source-registry); [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md); [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md); [ADR 0040](../adr/0040-preserve-post-designation-maintenance-as-versioned-cases.md). | Native save/copy conflict wording and layout, phase-view layout. | Technical completion is not workflow completion, package identity, Effect proof, external delivery, publication, recall, or takedown; native interaction never replaces AI7 approval-before-commit or receipt/reconciliation authority. |
| `J-08` crash and recovery | [C-ED](#source-registry) `Edit Journal` / `Manuscript Checkpoint` / `Recovery Snapshot` / revision ancestry; [C-EX](#source-registry) `Run Continuation Checkpoint`; [C-06](#source-registry). | Crash detection, shutdown/sleep, startup restoration, and storage durability behavior. | No checkpoint/snapshot/journal/Run/technical-execution-checkpoint collapse, history overwrite, silent loss of newer journal state, or process-restart-equals-Resume claim. |
| `J-09` cross-Book concurrency | [C-EX](#source-registry) `Run Record` / `Run Source Scope` / `Plan Envelope` / `Task Outcome` / Effects; [C-02](#source-registry); [C-07](#source-registry); [C-11](#source-registry); [C-21](#source-registry). | Queue, badge, notification, window attention, and OS lifecycle. | Parallel Runs use instances of one loop implementation; no focus theft, cross-Book scratch/cache/source sharing, Book-close cancellation, cancellation rollback claim, or queue-card authority. Native background lifecycle evidence is absent. |
| `J-10` continuation modes | [C-EX](#source-registry) `Resume` / `Retry` / `Redo` / `Replay` / `Run Continuation Checkpoint` / `Ambiguous External Outcome`; [C-07](#source-registry); [C-11](#source-registry); [C-21](#source-registry). | Label placement, confirmation, disabled-state presentation. | Replay performs no execution; Resume does not resume inside a tool call; ambiguous outcomes disable Retry; Redo is never disguised as Retry. Safe-retry evidence rules need later definition. |
| `J-11` feedback and learning | [C-ED](#source-registry) `Quality Signal` / `Learning Material` / `Learning Eligibility Decision` / `Learning Lineage` / `Learning Audit Log` / `Delivery Quality Metric`; [C-EX](#source-registry) `Policy Document`; [C-03](#source-registry); [C-04](#source-registry); [C-18](#source-registry); [C-19](#source-registry). | Feedback interaction, audit navigation, charts, and accessible presentation. | No LLM-training claim, factual learning from taste, scope-broadening audit link, inferred reason on close, or sample threshold blocking work. Current Policy visibility/activation follows the sealed baseline; future supersession is outside this mapping. |
| `J-12` first run/data/provider | [C-EX](#source-registry) `Model Provider` / `Provider Processing Policy` / `Outbound Data Category` / `Credential Reference` / `Credential Broker` / `Protected Secret Store` / `Agent Data Root`; [C-ED](#source-registry) `Public Release Permission`; [C-16](#source-registry); [C-17](#source-registry); [C-23](#source-registry). Shared outcomes are local material, separate secrets, explicit location/fallback/warnings, provider-optional editing, and processing-not-release. | Every concrete Windows path, channel, secure store, trust prompt, removal flow, and file dialog; macOS has no admitted journey. | OS/CPU/channel/floor/portable equivalence/signing/update behavior are open. No secret appears in portable data, prompt, result, or log. |
| `J-13` Series and Cross-project | [C-A](#source-registry) `Book`; [C-ED](#source-registry) `Series` / `Series Knowledge` / `Series Corpus` / `Series Retrieval Exclusion` / `Series-scoped Task`; [C-EX](#source-registry) `Run Source Scope`; [C-02](#source-registry); [C-10](#source-registry). | Membership/source selector and navigation. | No inferred membership, all-project default, ambient library access, cross-Book mutation, or learning-scope substitution. Combined-scope precedence needs a formal contract. |
| `J-14` accessibility/IME overlay | [C-A](#source-registry) Chinese-first input/typography obligation plus candidate outcomes [U-I §§2.2, 3, 16](#source-registry), [U-V §7](#source-registry), and [U-U §§4, 10](#source-registry). It creates no new business record and overlays J-01–J-13. | Windows viewport, Narrator, high contrast, Microsoft IMEs, F6/Ctrl keys are examples; each claimed OS needs native equivalent evidence. | No professional-editor session, disabled-editor research, macOS native test, or production accessibility proof exists. Native variation cannot excuse loss of a core journey. |

## Mapping defects, conflicts, and gaps

1. **The candidate source chain is not exact under the packet.** Many [U-T](#source-registry) rows cite `D`-series aliases in the `D10`–`D34` range whose targets are absent from the manifest, while `A` and `G` are whole-file aliases; no single alias family covers every row. This crosswalk replaces every non-exact alias with manifest-listed objects.
2. **The C01 flag is stale under current-baseline precedence.** [C-18](#source-registry) and the later [C-A](#source-registry) rule resolve the sealed baseline to developer-reviewed Policy Documents hidden from editorial users. [C-04](#source-registry) is earlier tension, not a live baseline ambiguity. A future owner may deliberately supersede visibility/activation through the separate A1 option axis; this mapping does not infer that change.
3. **Four accepted-record gaps remain:** `UX-IMP-004` import metadata schema; `UX-IMP-005` reimport ambiguity; `UX-ED-004` end-to-end Unicode/IME exact anchors; `UX-EVD-004` complete five-state Factual Verification taxonomy.
4. **Ten choices remain candidate-only:** `UX-IA-002`, `UX-IA-004`, `UX-IA-005`, `UX-ED-001`, `UX-ED-002`, `UX-ED-009`, `UX-TASK-001`, `UX-TASK-002`, `UX-RUN-007`, and `UX-PROP-002`. `UX-LEARN-006` left this list because [C-DM](#source-registry) row 13 accepts its rollback/forgetting/version-snapshot semantics; only its preview presentation and affected-running-task display detail remain candidate.
5. **Five rows are adapter-bound:** `UX-IMP-001` and `UX-SET-001`–`UX-SET-004`. Their security/product outcomes remain shared, but Windows picker, `%LOCALAPPDATA%`, Credential Manager, known-root detection, portable placement, and permission UX are not macOS rules.
6. **Accessibility is missing from the 79-ID count.** It appears only as unnumbered requirements and J-14, so 79/79 traceability is not complete product-parity evidence.
7. **No admitted artifact contains an exact OS floor, CPU promise, support tier, cross-OS channel set, native-exception list, macOS first-run journey, professional-editor result, or native accessibility result.** These cannot be inferred from “consistent product outlook,” [P-27](#source-registry), or browser health.

## Crosswalk conclusion

J-01–J-13 provide a candidate journey frame around a shared semantic core: domain identity, scope, evidence, named authority, proposal/application proof, recovery, and negative guarantees. J-14 is a cross-cutting accessibility/IME evidence layer. The current Windows examples, fixed geometry, implementation assumptions, and unrun validation do not cross the A1 boundary. The decision-ready contract and mutually exclusive options are in [A1 Product Consistency](./A1-PRODUCT-CONSISTENCY.md).
