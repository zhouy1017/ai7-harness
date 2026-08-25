# Source Document Inheritance Audit

Status: **review complete; every topic cluster was resolved by a named question**

## Review scope accepted in Question 6

The owner will review preservation decisions from the original AI7 documentation one coherent topic cluster at a time. DeepSeek Harness document inheritance is delegated to the architecture maintainer and will not consume interview questions; it remains subordinate to accepted AI7 product, safety, and platform constraints.

The following cross-cutting dispositions are accepted:

- Keep a concise, revised new-project `AGENTS.md`; do not copy the legacy file wholesale.
- **Superseded historical inheritance decision:** the earlier tiered GitHub Actions and generated mock-provider programme was later replaced by ADR 0027. Current CI is one provider-free E2E Functional Gate on Windows and macOS for supported journeys and observed-bug regressions.
- Keep local multi-agent dispatch for repository development only. It is not a production AI7 workflow and must remain terminologically and architecturally separate from Harness-powered product agents.
- Keep AI7 as one Windows-and-macOS desktop product under ADR 0028.
- Discard the old UI implementation and presentation model. Review and revise its user stories and product outcomes rather than porting layouts or components.
- Discuss only original-AI7 inheritance rows with the owner. Harness-specific choices may be made by the architecture maintainer, with provenance and compatibility constraints documented.

## Question 7 — accepted product-story revision

- The normal working language and Book language are Chinese.
- The primary modeled role is an editorial professional in a leading literary publishing house in mainland China.
- AI7 must support multi-aspect editorial judgment; the canonical dimension set is the next decision rather than an implicit model prompt.
- Replace the broad shorthand “confidential manuscript” with **Unpublished Editorial Material**. The required guarantee is no unauthorized public release, not a classified/high-secrecy operating model.
- The output boundary is broader than an edited manuscript. **Editorial Deliverables** include manuscript revisions and related promotional articles, news reports, reviews, and other accepted Book-related texts.
- Original-AI7 product stories are revised under this spine; none inherits legacy UI structure by implication.

## Question 8 — accepted editorial-dimension baseline

- Keep the proposed eight dimensions: literary quality/voice; theme, values, and social-cultural context; structure/narrative coherence; Chinese language/style; factual/source integrity; readership/market positioning; legal/rights/ethical/publication-policy risk; and production/cross-deliverable consistency.
- Treat them as the **Baseline Editorial Dimension Set**, not an exhaustive or uniformly scored rubric.
- A task selects and weights the dimensions relevant to its purpose.
- Production users must be able to add **User-defined Editorial Dimensions**. Ownership scope, override rules, and version propagation remain the next decision.

## Question 9 — accepted dimension customization and versioning

- An Editorial Profile owns reusable user defaults and custom dimensions.
- A Book owns its active selection, display wording, additions, disabling, and weights; later profile changes do not silently propagate.
- A task takes an immutable Task Editorial Dimension Snapshot at start.
- Changes are prospective. Referenced dimensions retain stable identities and are archived rather than deleted.
- Applying revised profile defaults to an existing Book is explicit and visible.

## Question 10 — accepted Book authority with corpus-learning seam

- Preserve Book as the ordinary authority boundary for manuscript tasks, exact source access, revisions, and mutations.
- Keep direct Cross-project work explicit and limited to selected Books.
- Add a distinct cross-corpus learning capability that derives patterns and feedback from the eligible Working Corpus to improve future delivery quality.
- Learning scope must not silently become direct source scope. House Editorial Memory is Question 11, the Series exception is Question 12, and update governance is Question 13.

## Question 11 — accepted House Editorial Memory with Series exception

- For unrelated Books, cross-corpus adaptation uses versioned, inspectable, derived House Editorial Memory with provenance; it excludes unrestricted raw-text sharing and opaque fine-tuning by default.
- Tasks record the exact memory revision/items used, and users can inspect, correct, disable, archive, or forget them.
- A Series is an explicit exception because member works may share canon, continuity, terminology, and other Book-specific knowledge. Its exact shared read boundary is Question 12; feedback/update governance moves to Question 13.

## Question 12 — accepted Series sharing boundary

- Series membership is explicit, versioned, and never inferred from similarity.
- Member Books automatically share versioned Series Knowledge.
- A Series-scoped Task may perform exact, provenance-bearing, read-only retrieval across current member revisions without selecting every Book separately; it receives relevant passages rather than whole manuscripts in context.
- Users may create Series Retrieval Exclusions for specific Books or sources.
- Every mutation remains a Book-targeted proposal bound to an exact revision. Membership changes are prospective and preserve historical evidence.

## Question 13 — accepted learning-signal governance with audit requirement

- Explicit user memory instructions activate at their chosen scope; operational feedback and edits are captured as evidence.
- Inferred patterns remain provenance-bearing Memory Candidates, and cross-Book activation requires approval.
- Users can edit, approve, reject, bulk-review, roll back, and forget; tasks snapshot memory versions and no feedback enters model training automatically.
- Add a Learning Audit Log that identifies every Learning Material, eligibility decision, descendant memory record, and downstream task use.
- Treat include/exclude input as evidence for a separate Learning Eligibility Policy governing similar future material. Audit lineage is Question 14; automatic policy authority is Question 15.

## Question 14 — accepted audit/remediation contract and model-design invariant

- Keep an append-only Learning Audit Log with complete lineage from material through downstream task use and dependency-aware exclusion remediation.
- Exclusion disables unsupported memory, recalculates multiply supported memory, pauses affected running tasks, and marks—but never rewrites—completed historical tasks.
- AI7 does not train or fine-tune an LLM. It combines replaceable provided Foundation Models with an AI7-owned Editorial Intelligence Layer made from professionally governed knowledge, sources, skills, tools, memory, policies, provenance, feedback, and evaluations.
- Every model design must preserve provider independence, reconstructable model-visible inputs, professional judgment/publication authority, and measurable workload reduction.

## Question 15 — accepted bounded Policy Document authority

- Learning Eligibility Policy starts recommendation-only and may act automatically only for high-confidence material inside user-approved type and scope boundaries.
- Product authority rules live in versioned Policy Documents. Post-run AI agents may author evidence-linked revisions without mutating historical versions.
- Only evaluated, non-expansive calibration inside a user-approved envelope may auto-activate; semantic, safeguard, or authority changes require the user.

## Question 16 — accepted textual and factual authority boundary

- Preserve and sharpen the source-truth invariant from current `AGENTS.md`, `CONTEXT.md`, ADR 0021, and ADR 0022: imported source revisions and index chunks—not model prose—are the Textual Source of Record for exact wording and quotations.
- The manuscript is not a truth oracle. Its Manuscript Assertions may contain factual, logical, referential, or semantic errors; AI7 must help detect them against separate evidence/context and create evidence-linked Correction Proposals.
- Current import/index publication is staged, digest-bound, verified, and atomic. Current search is deterministic literal substring matching; it returns full exact text as well as IDs, weakening the conceptual separation between candidate discovery and exact fetch.
- Current general grounding largely treats “nonempty exact sources” as grounded. The narrow Task Skill kernel verifies that reference project/chunk/version/asset/text fields exactly match fetched sources, but neither path proves that each generated claim is semantically supported.
- Durable Project Q&A correctly pins each answer to source revisions, approved scope, provider plan, records, and a source bundle, but its whole-answer source list is not claim/span-level citation grounding.
- The legacy reference-only citation design contains a valuable rule absent from the current runtime: displayed quotations must normalized-exact-match authoritative source text; fuzzy matching may discover candidates but never certify or substitute a quote.
- Proposed disposition: keep immutable textual authority and durable provenance; separate candidate Search, Exact Fetch, Synthesis, Reference Integrity, Factual Verification, Semantic Review, and Quotation Verification; add typed Evidence Links, Editorial Error Findings, and Correction Proposals; archive old `pipelines/*`, FastAPI/SSE/Qdrant/BM25, and mandatory RAG-versus-long-context vocabulary.

The evidence and accepted two-axis verification model are detailed in [Source–Generation–Grounding Boundary](./17-source-generation-grounding-boundary.md). Factual authority follows a configurable Factual Verification Policy Document; Model knowledge can initiate research but is not evidence; conflicting or insufficient evidence remains visible. See [ADR 0005](../docs/adr/0005-separate-textual-and-factual-authority.md).

## Question 17 — accepted manuscript history and recovery boundary

- Preserve the current manuscript-native semantic core: stable structural blocks with lineage, immutable reconstructable revision DAG, branches that version only complete editable text, a durable per-branch Edit Journal, meaningful Manuscript Checkpoints, isolated Proposal Branches, conservative shared-base merge, atomic no-partial apply, and verified independent recovery before high-risk graph mutation.
- Keep Source Version, Manuscript Revision, Run Continuation Checkpoint, and Recovery Snapshot as separate concepts. Keep Source Index Chunk separate from Manuscript Block, and Harness Session separate from Manuscript Branch/Revision; Operation Checkpoint is now legacy-only.
- Recommend that identical and non-interacting different-block changes may auto-merge, while different same-block changes and structural interactions require explicit editor resolution; model-generated combined text may be a proposal only.
- Add a host-neutral general DOCX/reimport identity-reconciliation contract and typed Manuscript Pins for every dependent record.
- Relocate the semantics behind a deep AI7-owned Manuscript History boundary and narrow Harness capabilities. Drop current Python/CLI/JSON/ID-prefix details and old linear-version/chunk-as-identity behavior; defer or drop proof-v1, Word-frontier, binary-trie ancestry, and exact UI action machinery unless later compatibility decisions require them.

The pinned evidence, accepted semantic model, and full disposition are in [Manuscript Revision and Recovery Boundary](./18-manuscript-revision-and-recovery-boundary.md). See [ADR 0006](../docs/adr/0006-preserve-manuscript-native-history-and-recovery.md).

## Question 18 — accepted proposal, authority, Effect, and replay boundary

- Preserve generated-content isolation and exact editorial decision semantics, but replace stored `proposal.approval`/generic Approval wording with named authorities.
- Keep Run Authorization, transient Execution Grant, Proposal Decision, Review Decision, exact durable Effect Approval, Public Release Permission, and Effect Receipt semantically distinct. One user interaction may create both Proposal Decision and Effect Approval without collapsing their records.
- Preserve stable Effect identity/idempotency across safe Resume/Retry, exact payload/target conflict detection, staged verification, per-Effect atomicity, expected-revision fencing, commit receipts, read-only reconciliation, no automatic ambiguous-outcome retry/fallback, cooperative cancellation, and drift invalidation.
- Treat proposal persistence and later manuscript publication as separate Effects with separate receipts. Tool output, Session history, attempted dispatch, and proposal receipt cannot prove manuscript publication.
- Preserve the six underlying proposal outcomes but do not inherit the conflicting four-versus-six always-visible UI contracts; interaction layout remains for the independent UI/UX session.
- Drop/archive the old `/agent/approve` endpoint, step-ID continuation, old agent console, runtime-specific schemas, Python/JSON identities, and surface-owned orchestration.

The pinned evidence and accepted full contract are in [Proposal, Authority, Effect, and Replay Boundary](./19-proposal-approval-effect-replay-boundary.md). See [ADR 0007](../docs/adr/0007-separate-decisions-authority-and-effect-proof.md).

## Question 19 — accepted deliverable workflow and artifact boundary

- Keep the Book as source/privacy/mutation authority, but do not inherit one scalar eleven-stage Book lifecycle. Manuscript, promotion article, news report, and Review Article workflows are independently revision-addressed within the Book.
- Introduce versioned Workflow Profiles and durable Workflow Instances composed from intake, source development, drafting, review/verification, finalization, delivery, and maintenance; phases may overlap, skip with reason, and reopen.
- Keep lifecycle metadata, evidence-bearing human gates/signoff, proof/correction history, typed versioned Editorial Artifacts, and narrow Prepare/Commit/receipt command safety.
- V1 profiles cover Manuscript, Promotion Article, News Report, and Review Article with profile-specific briefs, source/quotation/fact records, style/review gates, signoff, Delivery Package, and correction history.
- Treat the five shipped provider-free lifecycle handlers as contract tracers rather than mature professional behavior. Adapt developmental/style work, broaden production copy to Publication Communications, make acquisition optional, and move memory review into continuous Editorial Learning governance.
- Drop universal stage enums, mandatory three-review/three-proof for every deliverable, old `ai7.workflow.*` execution, fixed UI, and automated legal/regulatory/ideological/publication authority; defer contracting, ISBN/CIP, print logistics, rights, awards, and backlist automation from V1 core.

The exact-pin evidence, accepted bilingual terms, profiles, artifacts, and full disposition are in [Deliverable Workflow and Editorial Artifact Boundary](./20-deliverable-workflow-and-artifacts.md). See [ADR 0008](../docs/adr/0008-use-deliverable-owned-workflow-profiles.md).

## Question 20 — accepted bounded-plan task interaction

- Preserve visible-plan hybrid autonomy, but make the plan an authority-bearing boundary rather than optional information or blanket approval.
- Keep one surface-neutral Task Intent and exact Book/deliverable/document/revision/selection capture; discard the Task Composer's visual form and every workbench layout prescription.
- Generalize the shipped provider-plan precedent into a versioned Execution Plan and machine-authoritative Plan Envelope. Run Authorization binds their exact digest.
- Permit logged Plan Adaptation only within unchanged capability, source, provider, privacy, budget, outcome, and Effect bounds. Material drift suspends execution and requires a Plan Revision plus renewed Run Authorization.
- Keep durable clarification waits, safe pause/cancel, verified-checkpoint Resume, linked Retry, new-Run Redo, and typed evidence-bearing Task Outcomes.
- Drop the old `/agent/plan`, `/agent/run`, `/agent/approve`, step resubmission, optional-plan visibility, Agent Command Center, Ribbon, Activity rail, panels, inspectors, docking model, and other UI/component authority.

The exact-pin evidence, accepted bilingual terms, authority matrix, lifecycle, outcome family, and full disposition are in [Bounded-plan Task Interaction](./21-bounded-plan-task-interaction.md). See [ADR 0009](../docs/adr/0009-use-authority-bearing-plan-envelopes.md).

## Question 21 — accepted Task Skill, capability, trust, and provider boundary

- Preserve Task Skills as immutable declarative packages with rich manifests, but remove UI ownership, editable trust/status claims, vague generic approval fields, and legacy file/runtime assumptions.
- Preserve content-addressed installation, independent provider-free validation, separate enablement, and repository-only bundled promotion. Enablement creates a maximum Authority Ceiling, not Run or Effect authority.
- Rename Kernel Capability to AI7 Capability. Install code-bearing Capability Implementations separately as pinned static Cordis plugins/bundles; a Task Skill cannot install, mount, or self-authorize code.
- Project each Task Skill into one non-authoritative Harness instructional skill plus one AI7-owned per-Run Task Skill Activation. Enforce activation both in Harness tool guards and AI7 service/backend facades because visibility is not authority.
- Preserve active-Book default and exact user-designated Run Source Scope, Model Roles with hard requirements/soft preferences, frozen Provider Resolution Plans and fallback, ambiguous-outcome stop, and opaque credential references.
- Separate Provider Processing Policy, External Export Policy, and Public Release Permission. Configured model processing is not public release, but its provider, source scope, outbound-data category, and budget are visible in the Plan Envelope.
- Treat all 13 bundled skills as shipped legacy capability evidence while recording two current gaps: enabled managed local skills are non-runnable, and the provider execution path is mock/cassette-only.

The exact-pin evidence, accepted bilingual language, manifest boundary, authority intersection, Harness anti-corruption mapping, proportional outbound-data policy, and full disposition are in [Task Skill, Capability, Trust, and Provider Boundary](./22-task-skill-capability-trust-provider-boundary.md). See [ADR 0010](../docs/adr/0010-separate-task-skill-instruction-implementation-and-authority.md).

## Question 22 — accepted linked Task and Harness ledgers

- Keep Task Intent and Run Record as AI7 business/provenance facts, but narrow Run to an immutable semantic record linked to exact Harness execution ranges rather than copied transcripts.
- Make the Harness Session Ledger authoritative for model-visible messages, requests, turns, steps, tool calls/results, chunks, technical lifecycle events, checkpoints, and attempt history.
- Retire the original-AI7 Operation Record and Operation Event as active authorities and migration targets, and drop the separate `operationRuns` retry grouping. Keep old records only in the old repository or an explicit offline archive.
- Move each valuable business fact to its real owner: Deliverable Workflow Instance, Run Record, named decision, Effect/receipt, Prepared Command, or domain audit.
- Store sparse Execution Bindings and rebuildable Event Projections instead of mirrored Harness content. A Harness tool result or Session success never proves an AI7 mutation committed.
- Generalize legacy lifecycle commands into Domain Command → Prepared Command → commit/Effect. Direct deterministic commands do not create fake Task Skill Runs.
- Distinguish Resume/续行, Retry/重试, Redo/重做, and Replay/重放. A new Harness Session or execution span does not by itself create a new Run.
- Replace the earlier generic Operation Checkpoint term with Run Continuation Checkpoint, Workflow Instance state, domain staging/Effect evidence, or Harness technical checkpoint according to the fact's owner.

The accepted boundary and bilingual terms are in [Linked Task and Harness Ledgers](./23-linked-task-and-harness-ledgers.md). See [ADR 0011](../docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md).

## Question 23 — accepted Standalone-only V1

- Ship one Chinese-first Windows-and-macOS Standalone desktop product over one AI7 domain/Task Ledger authority and one Harness runtime. V1 has no Word parity, COM add-in, Host protocol, synchronization, Word packaging, or Word verification gate.
- Treat the old Standalone editor and workbench as negative evidence, not a migration asset. Professional long-form Chinese editing quality is release-critical and must cover structure/selection, durable editing/recovery, proposals/review, Chinese input/typography, performance, and import/export fidelity.
- Retain surface-neutral Task Intent, decision, Effect, manuscript history, merge, recovery, and evidence semantics from Word-coupled tests only by re-expressing them against Standalone/domain seams.
- Leave the C# add-in, exact Host binding, cross-surface drift/synchronization machinery, named-pipe protocol, Word installer, and Word/COM proof corpus in the old repository or offline contingency evidence. Do not migrate or run them as V1 gates.
- Reconsider Word only after the evidence-backed Standalone Editing Sufficiency Gate fails for a named workflow and a proportional-remedy review shows that live Word integration, rather than editor or document-conversion improvements, is justified. Gate failure does not add Word; a later Word scope requires a new ADR.
- If reconsidered, preserve one AI7 authority, exact association/binding/observation separation, fail-closed drift, directional Effects, manuscript-native merge, and no raw Harness Web/ACP/dynamic Cordis boundary.

The accepted boundary and contingency constraints are in [Standalone-only V1 and Deferred Word Alternative](./25-standalone-word-surface-boundary.md). See [ADR 0013](../docs/adr/0013-ship-standalone-only-v1.md).

## Audited sources

| Project | Documents | Pinned revision |
| --- | --- | --- |
| [AI7 Reborn](https://github.com/zhouy1017/ai7-reborn-ai) | Root `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md`, read completely | `3e6e9ac772b7f07832154fa39d7de8a4deca51b1` |
| [DeepSeek Harness](https://github.com/zhouy1017/deepseek-harness) | Root and directly relevant scoped `AGENTS.md`/`CLAUDE.md`; repository-wide search for `CONTEXT.md` | `47f943859bef60e4160492346772ded9b24f765a` |

Important facts:

- AI7 Reborn has a 45 KB root instruction file and a 78 KB, 941-line glossary. Both mix durable knowledge with repository-specific implementation and historical status.
- AI7 Reborn's `CLAUDE.md` is the portable one-line `@AGENTS.md` wrapper.
- DeepSeek Harness has no `CONTEXT.md`; its framework vocabulary lives mainly in `docs/glossary.md`, architecture docs, and package READMEs.
- Harness uses Git symlinks from `CLAUDE.md` to `AGENTS.md`. Those materialize poorly on Windows, so the new project must not inherit that mechanism.
- The private AI7 documents have no declared project license. Substantial copied prose must not be published until reuse authority/license is recorded.

## Recommendation

Use **selective semantic inheritance**:

1. Preserve AI7 product, editorial-safety, privacy, scope, approval, recovery, and replay guarantees.
2. Modify AI7 execution terms only after mapping them to Harness primitives; never create two competing execution ledgers.
3. Preserve Harness plugin/capability/session engineering rules inside the adopted Harness boundary.
4. Keep upstream monorepo commands, package naming, releases, vendoring, i18n, and CI rules as pinned references rather than local standing orders.
5. Move product, UX, architecture, testing, release, and volatile state out of root `AGENTS.md` to one authoritative document per concern.
6. Keep `CLAUDE.md` exactly as the already-created normal file containing `@AGENTS.md`.

“Preserve” below means preserve the semantic obligation, normally rewritten and attributed for the new project. It does not authorize verbatim source copying.

## Inheritance precedence

When sources disagree, use this order:

1. Current system, user, and new-project safety instructions.
2. Accepted new AI7 ADRs and canonical context definitions.
3. New repository `AGENTS.md` and any scoped local `AGENTS.md`.
4. Adopted Harness contracts inside the explicitly selected Harness boundary.
5. Individually classified legacy AI7 terms and decisions.
6. Old source instructions, plans, issue/PR status, branches, commands, model names, and checkpoints as non-authoritative evidence.

Conflict rule: AI7 product safety/domain authority beats Harness convenience. An accepted new ADR beats both source projects. An unresolved conflict blocks only the affected implementation seam.

## File-level disposition

| Source file family | Decision | Target treatment |
| --- | --- | --- |
| AI7 `CLAUDE.md` | Preserve literally | New root `CLAUDE.md` is already the normal one-line `@AGENTS.md` wrapper. |
| AI7 `AGENTS.md` | **Accepted: rewrite selectively and reorganize** | Keep the new root file concise; relocate domain, architecture, testing, release, and operator detail; archive stale issue/status material. |
| AI7 `CONTEXT.md` | Curate and split | Promote only stable domain terms into Editorial, Execution, or Word contexts. Move UI/testing/release/implementation terms to focused design docs or archive them. |
| AI7 `PROGRESS.md` | Do not inherit | The source file is over 4 MB and stale at its pinned HEAD. Keep this project's fresh compact checkpoint. |
| Harness `AGENTS.md` hierarchy | Adapt a small rule set | Keep plugin/session/capability/Host-Client rules locally; link exact upstream mechanics at the pin. |
| Harness `CLAUDE.md` symlinks | Do not inherit | Windows portability and project rules favor the normal `@AGENTS.md` wrapper. |
| Harness glossary/architecture/package docs | Pinned upstream reference | Use them to define Harness terms; do not copy Harness vocabulary into AI7 domain glossaries as though it were AI7 product language. |

## AI7 `AGENTS.md` classification

| Source theme | Decision | New owner / modification |
| --- | --- | --- |
| Session start, document ownership, current checkpoint | **Accepted: preserve and simplify** | Root `AGENTS.md` + compact `PROGRESS.md`. Retain one current checkpoint; do not grow another multi-megabyte history log or parallel `MEMORY.md`. |
| Repository-task receipts and Commander authority | Preserve principle, relocate detail | Future repository-agent runbook. Keep fail-closed Git/worktree identity and no implicit external-mutation authority. Do not copy the unfinished pilot machinery. |
| Verification economy | **Superseded and narrowed by ADR 0027** | Current implementation authority is [`docs/agents/ci-test-boundaries.md`](../docs/agents/ci-test-boundaries.md): one provider-free E2E Functional Gate for supported journeys and observed-bug regressions. The former final exact-HEAD matrix is historical, not a gate. |
| Local desktop and unpublished-material safety | **Accepted: preserve proportionately** | Root standing rule plus public-release/security design. Prevent unauthorized publication or exposure; do not import an unnecessarily classified-data threat model. |
| Old installed skills, Codex Cloud review, AI7 scenario-audit rules | Do not inherit automatically | Reintroduce only if those workflows are actually installed and accepted here. |
| Exact GPT/Claude model routing | Archive | Volatile operator policy, not durable project instruction. |
| Product Direction | Relocate and re-ratify | Charter, domain contexts, UX design, and ADRs. Keep root `AGENTS.md` short and link to accepted owners. |
| Core source/scope/approval/replay/recovery invariants | Preserve strongly | Editorial and Execution contexts plus architecture ADRs. Modify `kernel`, `orchestrator`, and similar names after Harness mapping. |
| Task-skill manifest, trust, provider plan, secret rules | Preserve and modify | Execution context and skill/security ADRs. Harness Skill, AI7 Task Skill, and Cordis Plugin remain distinct terms. |
| Platforms, Electron, Python runtime, packaging | **Accepted with platform mechanics partly deferred** | Windows and macOS as one product (ADR 0028); Electron with a three-process topology (Q34); no Python, TypeScript throughout (Q33); Windows zip portable plus NSIS (Q26); concrete macOS package mechanics remain separate. None was inherited blindly. |
| Deep-module/seam/testability principles | Preserve | Concise engineering rules after the target module boundaries exist. |
| Monolithic renderer, legacy UI/component/layout model, and issue/PR chronology | **Accepted: drop as design authority** | Historical evidence only. User stories are reviewed separately and may be revised; UI source and presentation structure are not ported. |
| Unified Standalone/Word authority, inward adapters, exact links, crash isolation | Archive as contingency evidence | V1 is Standalone-only; promote only surface-neutral single-authority lessons unless a future ADR adds Word. |
| Old compatibility inventories and retired CLI paths | Archive | Preserve only the general rule that compatibility paths cannot acquire new authority. |
| `dev`/`master`/`release` policy and exact GitHub gates | Re-decide | New repository governance; preserve only concise commits and prohibition on secrets/private manuscripts. |
| Provider-free CI, exact-SHA evidence, deterministic E2E, packaged-runtime proof | **Historical; superseded by ADR 0027** | Retain only the provider-free principle and complete supported E2E journeys plus observed-bug regressions. Exact-SHA, tier, mock-provider programme, packaged-runtime proof, and separate topology gates are not current requirements. |
| Old Issue `#14` obligations, schedules, lane names, tag algorithms | Archive/rebaseline | Historical bootstrap and release implementation, not standing orders. |
| Safety-focused review rules | Preserve, relocate | Engineering review guide; source-truth, approval, revision, privacy, recovery, and replay violations remain high priority. |

## AI7 `CONTEXT.md` classification

### Promote to AI7 Editorial after term-level review

- Book project, Book record set, and Cross-project workspace.
- Primary Editorial Role, Chinese-first Editorial Work, Unpublished Editorial Material, Editorial Deliverable, multi-aspect editorial task, Project Q&A conversation, and Q&A turn.
- Source-truth text boundary, read-only imported source, and Source index chunk.
- Manuscript block, structural edit, working state, revision, journal, checkpoint, branch, proposal, merge, conflict, resolution, and recovery semantics.
- Project-targeted proposals and the artifact handoff/snapshot/derivative family.
- Publication lifecycle, stages, and durable editorial artifact types.

Preserve the old `_Avoid_` clauses for terms that are accepted; they prevent vocabulary drift.

### Promote to AI7 Execution only after Harness mapping

- Agentic task execution and visible-plan autonomy.
- Task Skill, default skill, manifest, trust, installation, validation, and authoring.
- Source scope and project/global/cross-project Run ownership.
- Task Intent, Run, Operation, Event, Effect, Checkpoint, receipt, lease, Resume, Retry, Redo, and ambiguous outcome.
- Durable Approval/input requests and exact binding.
- Provider role, requirements, preferences, resolution plan, binding, preflight, and just-in-time readiness.
- Lifecycle command and command intent.

Required modification: names must state whether they are AI7 business records or Harness runtime primitives. `Kernel capability` should become a governed AI7 capability/tool boundary only after its Harness mapping is accepted.

### Deferred Word Integration context

Question 23 intentionally promoted no Word terms. Keep AI7 interaction-surface, cross-surface drift/synchronization, Word branch/round-trip, Host binding, and add-in vocabulary as contingency evidence only. Surface-neutral decisions, Effects, proposals, manuscript history, and recovery already belong to the Editorial or Execution contexts. Do not promote Ribbon layouts, panel locations, component names, packaging, release lanes, or proposed Word terms unless a future ADR adds Word to a release boundary.

### Relocate outside the canonical glossary

| Legacy term cluster | Destination |
| --- | --- |
| Minimal/Empty Book flows and Task Composer outcomes | Product journey review; revise rather than inherit automatically |
| Editor-first workbench, Activity rail, Ribbon, tabs, panels, inspectors, action bars, docking, responsive collapse | Legacy UI evidence only; the new UI starts from accepted user outcomes, not these structures |
| TypeScript/Python, Electron, local service, persistence topology | Architecture decisions |
| Recovery storage and publication implementation mechanics | Persistence/recovery ADRs |
| Necessary default skill set and production workflow set | Capability catalog/roadmap |
| Test-first gates, test catalog, fixtures, quarantine, evidence | Testing strategy/glossary |
| Windows package, RC tags, promotions, release schedules | Release strategy |
| Concept-preserving redesign, proof slices, protected credential transfer, and fixture/sample allowlist | Migration charter/plan |

### Archive or rename

- `Generative pipeline`, `Retrieval pipeline`, `Generation pipeline`, `StreamPlan`, `stream_task`, and `Finalizer`: obsolete Python/FastAPI/SSE/SQLite implementation vocabulary.
- `Legacy pseudo-skill Run Record`: old-repository/offline history only; legacy Run-history migration is excluded.
- Old issue/PR/branch/gate names and frozen compatibility inventories.
- **Minimal runnable harness**: rename to **bootstrap verification scaffold** if the concept remains. Reserve **Harness** for the DeepSeek-based product execution framework.

## Harness instruction inheritance (architecture-maintainer owned)

The owner has delegated these dispositions. They are maintained as architectural working decisions and can be revised when an AI7 product requirement exposes a conflict; they are not part of the row-by-row interview.

The accepted reason for studying DeepSeek Harness is broader than replacing the old loop: its framework should improve observable Agent Behavior through composable context, prompts, tools, policies, plans, workflows, subagents, sessions, replay, and snapshots. Import extension principles and contracts selectively at the exact pin; do not turn upstream repository conventions into AI7 product rules, and do not confuse engineering adoption of the framework with runtime model training or silent self-modification. The pinned framework has no general model-quality evaluator or independent goal verifier, so AI7 owns semantic behavior and editorial-quality evaluation.

### Preserve or adapt locally

- New execution behavior goes through plugins, bundles, profiles, presets, and documented extension points; a core-loop change requires an accepted exception.
- A complete capability seam names Service Definition, Provider, and Consumer roles.
- Anything model-visible is logged and reconstructable from the Harness session record.
- Cordis registrations are reversible effects and must dispose cleanly.
- Host-level singletons and per-agent isolated composition remain separate.
- Host-only and browser/client compilation faces remain explicit when both exist.
- Durable business facts and replayable model facts are separated from ephemeral presentation choices.
- Configuration is explicit and validated; misconfiguration fails at the earliest owned point.
- Validate configuration, model/tool JSON, persistence, filesystem, process, worker, and wire inputs; avoid redundant hostile-input checks at trusted typed same-process boundaries.
- Use strict TypeScript, explicit exports, branded cross-boundary IDs, concise README/JSDoc contracts, and one authoritative home per fact once the stack is accepted.
- Historical Harness guidance favored narrow affected-surface checks and assembled/keyless behavior evidence. Current AI7 standing CI admits only applicable supported E2E journeys and observed-bug regressions under ADR 0027; it creates no separate affected-surface or behavior-evidence gate.

### Keep as commit-pinned upstream reference

- Exact `@deepseek-ai/dsh-*` package layout, Cordis peer-dependency rules, aggregate TypeScript configs, Typert generation, source-launch rules, and config-verifier internals.
- Full client slot/package checklist unless AI7 directly extends that client surface.
- Per-file 100% coverage, exact snapshot machinery, Model Experience templates, and upstream invariant export rules.
- Upstream examples, Agent Notes, PR stacks, labels, release mechanics, and pre-push skills.
- Defensive-pattern details used when changing upstream lifecycle/concurrency code.

### Do not inherit

- “Foundation over blast radius” freedom to break persisted formats without migration for future new-AI7 data; original-AI7 production state is separately excluded rather than upgraded.
- Vendored Cordis and its local-modification workflow.
- DeepSeek package namespace, rescoping, or `DEEPSEEK_API_KEY` as AI7-wide policy.
- Mandatory bilingual documentation, VitePress projection, exact word budgets, or mandatory Agent Notes.
- DeepSeek-specific Windows/Wine CI, GitHub labels, stacked-PR process, and release rules.
- Root/nested `CLAUDE.md` symlinks.

## Five authority collisions to resolve later

| Collision | Required outcome |
| --- | --- |
| AI7 product records vs Harness Session log | Correlate without allowing either to silently replace the other's owned truth. |
| AI7 Task Skill vs Harness Skill vs Cordis Plugin | Keep three explicit concepts and define projections/adapters. |
| AI7 durable Approval/Effect policy vs Harness one-shot approval/tool effects | Harness execution remains subordinate to exact AI7 product authority for manuscript/external effects. |
| Python domain backend vs TypeScript Harness Host | Select one topology and one state-transition owner before inheriting stack rules. |
| Provider-free product gate vs Harness live-provider tests | Provider-free remains required. ADR 0027 excludes live-provider tests and separate provider evidence gates unless the owner explicitly reverses it. |

## Actions during the row-by-row review

1. Keep the inheritance precedence and a short unpublished-material/public-release rule in root `AGENTS.md`.
2. Add an upstream-reference document pinned to Harness `47f943859…`; do not paste upstream monorepo rules into the always-loaded root instructions.
3. Promote only terms whose owning architecture/product question has been accepted into the three context `CONTEXT.md` files.
4. Keep `GLOSSARY.md` as links plus collision warnings; do not duplicate definitions.
5. Create focused product/UX/testing/release documents only when their questions are reached.
6. Log the source path, SHA, transformation, destination, and authorization for any substantially reused prose or asset.

## Active interview rule

Each subsequent inheritance question resolves one coherent original-AI7 topic cluster. The answer is written here and, where it defines domain language, immediately promoted to the owning context. No remaining row is accepted by implication.
