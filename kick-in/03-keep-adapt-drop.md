# Initial Keep / Adapt / Drop Matrix

Status: **accepted development-baseline disposition; implementation authority remains Issue-scoped**

“Drop” means do not make it part of the new implementation baseline. The source remains available in the old repository or an offline archive; only the accepted credential/mock-evidence/test-Book allowlist may cross as data.

## Product and domain

| Asset / behavior | Current disposition | Target treatment | Why |
| --- | --- | --- | --- |
| AI7 identity; Chinese-first literary-publishing desktop product | **Accepted: keep and sharpen** | Product charter and default deployment policy | The primary role is a professional in a leading mainland Chinese literary publishing house, not a generic writing-app user. |
| Multi-aspect editorial judgment | **Accepted with extensible eight-dimension baseline** | Product story and Editorial Dimension Catalog | Tasks select and weight relevant built-ins; production users can introduce additional dimensions rather than being constrained by a closed taxonomy. |
| Unpublished editorial material | **Accepted: protect proportionately** | Public-release policy and safe defaults | Prevent unauthorized public release; do not assume classified or high-secrecy controls for every Book. |
| Manuscript and related editorial deliverables | **Accepted: broaden** | Editorial domain and journey catalog | Deliverables include manuscript text, promotional articles, news reports, reviews, and other Book-related content. |
| Old editor-first UI, layout, and component model | **Accepted: drop** | Historical UX evidence only | New AI7 gets a new UI; retain or revise user outcomes only through explicit product-story review. |
| One-Book task authority and explicit Cross-project workspace | **Accepted with corpus-learning seam** | AI7 domain model | Direct text access and mutation remain scoped; cross-Book learning uses separately governed derived patterns and feedback. |
| Cross-corpus adaptive editorial learning | **Accepted as product requirement; representation remains an implementation choice** | House Editorial Memory design | Learn from the eligible Working Corpus without silently granting tasks unrestricted cross-Book text access. |
| Series work | **Accepted as a richer sharing exception** | Explicitly promoted Series Knowledge Revisions plus exact read-only member retrieval | Related works share reviewed canon and continuity context, while versioned exclusions immediately guard later Series reads and every mutation remains Book/revision-targeted. |
| Learning audit and material eligibility | **Accepted with bounded decisions and hybrid revision activation** | Learning Audit Log plus a versioned Learning Eligibility Policy Document | Users need lineage and controls; agents may revise after runs, but only evaluated non-expansive calibration inside a user-approved envelope may auto-activate. |
| Textual source-of-record boundary | **Accepted: keep and clarify** | AI7 source services + Harness tool/prompt guards | The source revision is authoritative for exact wording, not for the factual or semantic truth of its Manuscript Assertions. |
| Source search, exact fetch, generation, and grounding separation | **Accepted: keep and sharpen** | Separate capability seams plus typed Evidence Links and Factual Verification Policy Document | Reference Integrity, Claim Support, and Factual Verification remain independent; Model knowledge cannot close factual findings. |
| Old generative/retrieval/streaming pipelines and mandatory RAG/long-context split | **Accepted: drop/archive** | Historical evidence only; strategies behind provider-neutral capabilities | The module paths are absent and encode an obsolete stack/decomposition. |
| Stable manuscript blocks, revision DAG, branches, journal, merge, recovery | **Accepted: keep semantics, replace implementation** | Deep AI7 Manuscript History capability behind narrow Harness tools | High-value, hard-won manuscript guarantees; legacy storage, proof compatibility, and Word-frontier machinery are not the architecture. |
| Proposal branches for model-generated text changes | **Accepted: keep** | AI7 manuscript mutation workflow | Model output stays isolated and exact-base-bound; acceptance uses the same conservative, recovery-gated merge path. |
| Publication lifecycle vocabulary and artifacts | **Accepted: keep semantics, replace Book-wide stage machine; Batch 5 refined** | Book-owned Deliverable Workflows, immutable Editorial Deliverable Revisions, versioned profiles, typed artifacts, human gates/signoff, destination-independent Delivery Packages, and versioned classified Maintenance Cases | The revised deliverable family cannot truthfully share one current Book stage; format/path-bound local exports and their receipts are separate Effects, and current AI handlers are contract tracers rather than expert behavior. |
| Visible-plan hybrid autonomy | **Accepted: keep and sharpen** | Task Intent + versioned Execution Plan + authority-bearing Plan Envelope with bounded adaptation | The plan is more than presentation but less than blanket approval; material drift suspends and requires a Plan Revision plus renewed Run Authorization. |
| Provider roles, privacy classes, source scope, budgets, fallback | **Accepted: keep behind policy and resolution boundaries** | AI7 policy/resolution layer over Harness LLM adapters | Harness model selection alone does not encode these domain constraints. Active Provider Processing Policy v1 has exactly zero provider allow rules; live-provider work remains blocked pending a separately authorized provider-specific rule/terms decision and runtime task. |
| Provided Foundation Models plus AI7 Editorial Intelligence Layer | **Accepted product invariant** | Replaceable Harness model adapters plus AI7-owned knowledge/context/evaluation | AI7 improves professional delivery through governed editorial intelligence, not model-weight training. |
| DeepSeek Harness as Agent Behavior Framework | **Accepted: DSH-first architecture with exact public-package pins** | Versioned behavior composition through the public extension seams fixed by ADRs 0041 and 0042 | The main value sought from DSH is better observable agent conduct—not only reusing an agent loop and not training an LLM. Exact package composition remains an implementation-plan decision within those accepted boundaries. |
| Legacy dataset export, fine-tuning, LoRA/DPO, or behavior-cloning roadmap | **Drop from product thesis** | Historical/north-star evidence only | Contradicts the accepted foundation-model invariant and is unnecessary for adaptive retrieval/memory. |

## Records, execution, and safety

| Asset / behavior | Current disposition | Target treatment | Why |
| --- | --- | --- | --- |
| Task Intent | **Accepted Q22: keep** | Exact structured request in the AI7 Task Ledger, correlated to its rendered Harness message | Pins Book, revision, selection, source, profile, and reviewed inputs without owning a transcript. |
| Run Record | **Accepted Q22: keep and narrow** | Stable semantic/provenance record linked to exact Harness Execution Spans | Avoid a duplicate transcript while preserving authorization, pins, evidence, decisions, Effects, attempts, and typed outcome. |
| Generic Operation Record, Operation Event, and `operationRuns` | **Accepted Q22: drop as active authorities and migration targets** | Harness Session owns the technical timeline; old records remain only in old-repository/offline history | Original AI7 overlaps Run, Operation, and retry-group records; recreating them would make a second execution log. |
| Harness Session ledger and cross-ledger correlation | **Accepted Q22: keep Harness authority; add AI7 bindings** | Canonical model/tool execution history plus sparse Execution Bindings, Harness Execution Spans, and rebuildable projections | One logical causal graph retains business provenance without duplicating model-visible content or control loops. |
| Durable Approval | **Accepted: split named authorities** | Run Authorization, Execution Grant, Proposal Decision, Review Decision, Effect Approval, and existing Public Release Permission | One overloaded Approval cannot safely mean task start, agent execution, editorial judgment, exact Effect authority, and public release. |
| Effect identity, fencing, receipt, ambiguous-outcome policy | **Accepted: keep guarantees, replace machinery** | Deep AI7 Effect capability invoked through guarded Harness tools | Stable exact identity, per-Effect atomicity, receipts, reconciliation, and no ambiguous retry are stronger than ordinary tool results or Session events. |
| Current custom agent loop/provider shell | **Accepted: drop** | Harness agent loop and LLM seams | The predecessor implementation duplicates Harness responsibility and is not a development baseline. |
| Local engineering multi-agent dispatch workflow | **Accepted: keep and revise for development only** | Repository-agent runbook with typed handoff, scoped authority, exact-commit review, fail-closed identity, and replay lessons | It is development infrastructure, never a shipped AI7 product runtime or a second production agent platform. |
| Windows Host connector for Claude/Codex pilot | **Accepted: drop** | Archive evidence; retain only requirements not supplied by Harness | The accepted Harness topology has one execution authority; do not revive a second worker authority or enrollment system. |

## Skills and providers

| Asset / behavior | Current disposition | Target treatment | Why |
| --- | --- | --- | --- |
| Thirteen canonical AI7 built-in Task Skill IDs | **Accepted: keep as legacy capability evidence** | Versioned AI7 catalog subject to workflow/profile review | All are cataloged runnable, but behavior maturity and execution paths are uneven. |
| Rich AI7 Task Skill manifest | **Accepted: keep semantics, redesign schema** | AI7 declarative package projected into a Harness instructional skill plus AI7-owned activation | Harness Skill metadata lacks versioned identity, trust, capability authority, schemas, and activation evidence. |
| Kernel-mediated capability allowlists | **Accepted: keep and rename** | AI7 Capabilities enforced at both Harness tools and service/backend facades | Tool visibility and prompt instruction are not authority boundaries. |
| Staged skill trust and bundled promotion gate | **Accepted: keep and deepen** | Provenance-derived Trust Tier, content-addressed admission, independent validation, digest-bound enablement ceiling | Trust cannot come from editable manifests; enablement is not Run or Effect authority. |
| Legacy `ai7.workflow.*` pseudo-skills | **Accepted: drop** | Frozen archive/reference metadata only | Superseded by Task Skills and Harness-native orchestration; no legacy Run-history import exists. |
| Provider-free deterministic model fixtures | **Accepted only inside an admitted complete E2E journey** | Local/in-process fixture at the same AI7 model boundary when that journey needs one | ADR 0027 admits no separate cassette, replay, provider-conformance, or request-fingerprint programme. The current tracer performs no model call. |
| Mock/cassette-only ordinary product execution | **Accepted: drop** | Real Harness model adapters under AI7 provider policy in later authorized work | A fixture is journey evidence, never the production network path. Active Provider Processing Policy v1 has exactly zero provider allow rules; live-provider implementation remains blocked pending a separately authorized provider-specific rule/terms decision and runtime task. |

## Runtime and persistence

| Asset / behavior | Current disposition | Target treatment | Why |
| --- | --- | --- | --- |
| Python manuscript/domain services | **Accepted: drop the implementation, re-express the semantics** | TypeScript domain services in the AI7 service process | Question 33 found the legacy Python carried zero third-party dependencies and handled DOCX with stdlib zip and XML, so nothing required it. Semantics are re-expressed from contract under ADR 0006; no interpreter or worker ships (ADR 0022). |
| `ai7.local-service/v1` concept | **Accepted: adapt** | Versioned local Standalone application boundary | One desktop client still needs one domain/Harness authority; the old Python protocol/process shape is not inherited. |
| Direct Python CLI command path beside the shared service | **Accepted: drop** | One canonical gateway/control path | The old dual route splits authority and compatibility behavior. |
| Atomic `projects.json` as permanent target model or import source | **Accepted: drop; no general importer** | Inspect only to locate user-selected credential references during protected transfer | Rich nested production state must not constrain the new schema or cross the accepted migration allowlist. |
| Legacy production data | **Accepted: do not migrate** | No production Books/manuscripts, generated outputs, indexes, embeddings, memory, workflow/task/run/operation history, proposals, decisions, Effects, receipts, or UI state | The new AI7 starts with a clean business store and does not reproduce obsolete record/storage models. |
| Legacy credentials, mock-provider generators/fixtures, and selected test sample Books | **Accepted allowlist-only exceptions, none selected for the current tracer** | Later protected credential transfer; separately reviewed mock-provider generators/fixtures; explicitly selected local-only test sample Books | Avoid importing old production state while permitting a later exact Issue to select a narrow asset. Secrets and real/sample manuscripts never enter repository/CI files, logs, artifacts, distributable fixtures, corpora, or proof programmes; the current tracer uses public-synthetic input only. |
| Harness append-only Session log and persistence seam | **Accepted: keep** | Canonical model/execution history | Enables continuation, fork, recovery, and UI projection; Session history is never an AI7 business receipt. |
| Harness generic Workspace as Book storage | **Accepted: drop as a mapping** | Use only for bounded runtime context | Workspace and Book have different ownership and lifecycle. |

## Standalone surface and delivery

| Asset / behavior | Current disposition | Target treatment | Why |
| --- | --- | --- | --- |
| Standalone-only V1 | **Accepted Q23, platform scope amended by ADR 0028** | One Chinese-first Windows-and-macOS desktop workbench over one AI7 domain/Task Ledger authority and one Harness runtime | Avoids dual-surface complexity while making the new Standalone editor—not the old UI—the complete V1 product. |
| Professional Standalone text editing | **Accepted as release-critical** | New editor and UI/UX evaluated on long Chinese manuscripts, structure/selection, durable editing/recovery, proposals/review, and import/export | The old Standalone editor was unsatisfactory; dropping Word cannot reduce V1 to chat plus a weak text box. |
| Standalone/Word parity, Word binding, drift, and synchronization | **Dropped/deferred from V1** | Contingency safety evidence only; a future Word scope needs a new evidence-backed decision | One V1 surface has no cross-surface parity or synchronization contract. |
| Word C# COM implementation and add-in | **Do not migrate in V1** | Old-repository/offline contingency evidence | No COM packages, Host protocol, Word installer, signing, or clean-machine Word gate in V1. |
| Existing monolithic renderer/main/runtime modules | **Accepted: drop as foundation** | Rewrite around new client/domain seams; retain journey contracts | File sizes and mixed responsibilities make them poor migration roots. |
| Legacy layouts, Ribbon/component semantics, and Operations/evidence presentation | **Accepted: drop as UI authority** | Mine only for candidate user outcomes and failure cases | The new UI starts fresh; no legacy component or layout parity obligation. |
| Superseded UI PRDs/prototypes | **Accepted: drop as authority** | Reference only | The source repo explicitly closed them for redesign. |
| Windows installer/repair/release machinery | **Accepted: adapt only as the Windows platform implementation** | Keep zip-portable and NSIS outcomes separate from macOS packaging mechanics | Useful Windows evidence, not a cross-platform package template. |
| Windows-and-macOS desktop target | **Accepted: keep under ADR 0028** | One product contract plus native platform adapters | It shapes the Standalone runtime, distribution, editor, E2E journeys, and local application boundary materially. |
| Existing-file collision dialogs and local-export authority | **Accepted in Issue #8 Batch 5: keep native presentation, relocate authority** | Native OS rename/cancel/replace workflow feeds a frozen AI7 Local Export Preparation; AI7 retains exact approval-before-commit, per-file receipt, reconciliation, and history | Avoid a duplicate AI7 collision modal without granting the renderer, OS, or Harness roaming filesystem or Effect authority; cancellation attempts no file Effect and local export proves no sending or publication. |

## Tests and documentation

| Asset / behavior | Current disposition | Target treatment | Why |
| --- | --- | --- | --- |
| Glossary and high-value ADRs | **Accepted: keep only through explicit re-ratification** | Import concepts with source attribution; do not blindly inherit every implementation decision | The new foundation invalidates some assumptions. |
| Capability inventory and user journeys | **Accepted: keep** | Target acceptance ledger | Best source of product parity truth. |
| Behavioral, backend-contract, system, and release tests | Adapt/classify | Migrate by behavior class and target seam; retain only surface-neutral value from Word-coupled tests | Word/COM/IPC tests are deferred, while manuscript/Effect behaviors are re-expressed against Standalone/domain seams. |
| Tiered GitHub Actions verification ladder | **Superseded by ADR 0027; invocation bounded by ADR 0049** | One logical provider-free E2E Functional Gate executed on Windows and macOS | Draft suppression, integration-ready execution and local debugging limit hosted consumption without reviving an additional tier, platform-certification programme or proof surface. |
| Generated mock-LLM-provider cases | **Adapt only when an exact supported journey needs a deterministic model fixture** | One local/in-process fixture inside that same provider-free E2E journey | No tiered suite, cassette/replay programme, provider conformance, request fingerprint, or separate fixture evidence; the current import/window/journal tracer makes no model call. |
| Revised root `AGENTS.md` and one-line `CLAUDE.md` wrapper | **Accepted: keep** | Concise new-project standing rules plus focused linked runbooks | Preserve durable rules, not the legacy file's implementation chronology. |
| Static byte/digest/source-shape tests | **Accepted: no standing gate** | Use only as temporary diagnostics; put user-visible behavior in the applicable complete E2E journey | Avoid freezing old decomposition or creating a separate proof programme. |
| Sanitized response fixtures and public-synthetic corpus | Adapt only inside an admitted complete E2E journey; regenerate any private-linked corpus identity | Deterministic model fixture and public-synthetic journey input, when an exact Issue needs them | No separate cassette/replay proof programme; raw recordings stay excluded, and the old corpus leaked a private sample's byte-length fingerprint. |
| 4.5 MB legacy `PROGRESS.md` as machine state | **Accepted: drop** | Compact human checkpoint plus issue/decision records | Operational state should not become an architecture dependency. |
| Older React/FastAPI/SQLite/Qdrant reference corpus | **Accepted: keep as reference only** | Mine capabilities and failure cases; no module parity promise | The current AI7 repo already declares it non-authoritative. |

The detailed source-instruction and glossary classification is maintained in [Source Document Inheritance](./08-source-document-inheritance.md). It governs what may be promoted from the pinned `AGENTS.md`, `CONTEXT.md`, and `CLAUDE.md` files; these source documents are never inherited wholesale.

## Harness baseline disposition

| Harness area | Current disposition | Notes |
| --- | --- | --- |
| Cordis plugin model, profile/bundle layering, typed events | **Accepted: keep** | Primary extension and composition model. |
| Agent loop, LLM seam, tool pipeline, Sessions, plans/goals/subagents/jobs | **Accepted: keep the required engine subset** | Canonical generic control plane, with AI7 scheduling and business authority remaining outside Harness. |
| Prompts/context, tools, policy, plans, workflows, subagents, and Session hooks as behavior-shaping seams | **Accepted: keep and inspect at the exact pin** | Form the Harness Agent Behavior Layer; every AI7 composition or change is versioned and reconstructable. |
| Harness replay and snapshot infrastructure | **Available upstream capability, not a standing AI7 gate** | May support a concrete later journey or diagnosis without becoming a separate replay/snapshot proof programme | Harness technical evidence never proves AI7 business completion or an Effect Receipt. |
| General agent-behavior/editorial-quality evaluator | Add in AI7 | The pinned Harness has no general scoring framework or independent goal verifier; AI7 must evaluate source fidelity, editorial quality, policy compliance, and workload reduction. |
| Official web/headless bundles | **Accepted: reference only** | AI7 uses the accepted Electron renderer/main/service topology and may inspect upstream composition patterns | Neither web nor service-only headless execution substitutes for the product journey. |
| Generic shell/filesystem/coding tools | Available but restricted by profile | “Full Harness” must not silently mean unrestricted manuscript access. |
| Dynamic Cordis packages/`!!js` | Trusted developer capability only | Explicitly not a security boundary. |
| Built-in web server on a network | **Accepted: drop from deployment** | No TCP listener is part of the accepted local topology. |
| Telemetry export | Disabled by default pending privacy design | It can export raw captured session records. |
| Source fork of the full monorepo | Avoid initially | Use only after a demonstrated public-seam gap. |
