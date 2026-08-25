# Initial Keep / Adapt / Drop Matrix

Status: **row-by-row review; only rows explicitly marked accepted are settled**

“Drop” means do not make it part of the new implementation baseline. The source remains available in the old repository or an offline archive; only the accepted credential/mock-evidence/test-Book allowlist may cross as data.

## Product and domain

| Asset / behavior | Proposed decision | Target treatment | Why |
| --- | --- | --- | --- |
| AI7 identity; Chinese-first literary-publishing desktop product | **Accepted: keep and sharpen** | Product charter and default deployment policy | The primary role is a professional in a leading mainland Chinese literary publishing house, not a generic writing-app user. |
| Multi-aspect editorial judgment | **Accepted with extensible eight-dimension baseline** | Product story and Editorial Dimension Catalog | Tasks select and weight relevant built-ins; production users can introduce additional dimensions rather than being constrained by a closed taxonomy. |
| Unpublished editorial material | **Accepted: protect proportionately** | Public-release policy and safe defaults | Prevent unauthorized public release; do not assume classified or high-secrecy controls for every Book. |
| Manuscript and related editorial deliverables | **Accepted: broaden** | Editorial domain and journey catalog | Deliverables include manuscript text, promotional articles, news reports, reviews, and other Book-related content. |
| Old editor-first UI, layout, and component model | **Accepted: drop** | Historical UX evidence only | New AI7 gets a new UI; retain or revise user outcomes only through explicit product-story review. |
| One-Book task authority and explicit Cross-project workspace | **Accepted with corpus-learning seam** | AI7 domain model | Direct text access and mutation remain scoped; cross-Book learning uses separately governed derived patterns and feedback. |
| Cross-corpus adaptive editorial learning | **Accepted as product requirement; representation open** | House Editorial Memory design | Learn from the eligible Working Corpus without silently granting tasks unrestricted cross-Book text access. |
| Series work | **Accepted as a richer sharing exception** | Series Knowledge plus exact read-only member retrieval | Related works share canon and continuity context, while exclusions are explicit and every mutation remains Book/revision-targeted. |
| Learning audit and material eligibility | **Accepted with bounded decisions and hybrid revision activation** | Learning Audit Log plus a versioned Learning Eligibility Policy Document | Users need lineage and controls; agents may revise after runs, but only evaluated non-expansive calibration inside a user-approved envelope may auto-activate. |
| Textual source-of-record boundary | **Accepted: keep and clarify** | AI7 source services + Harness tool/prompt guards | The source revision is authoritative for exact wording, not for the factual or semantic truth of its Manuscript Assertions. |
| Source search, exact fetch, generation, and grounding separation | **Accepted: keep and sharpen** | Separate capability seams plus typed Evidence Links and Factual Verification Policy Document | Reference Integrity, Claim Support, and Factual Verification remain independent; Model knowledge cannot close factual findings. |
| Old generative/retrieval/streaming pipelines and mandatory RAG/long-context split | **Accepted: drop/archive** | Historical evidence only; strategies behind provider-neutral capabilities | The module paths are absent and encode an obsolete stack/decomposition. |
| Stable manuscript blocks, revision DAG, branches, journal, merge, recovery | **Accepted: keep semantics, replace implementation** | Deep AI7 Manuscript History capability behind narrow Harness tools | High-value, hard-won manuscript guarantees; legacy storage, proof compatibility, and Word-frontier machinery are not the architecture. |
| Proposal branches for model-generated text changes | **Accepted: keep** | AI7 manuscript mutation workflow | Model output stays isolated and exact-base-bound; acceptance uses the same conservative, recovery-gated merge path. |
| Publication lifecycle vocabulary and artifacts | **Accepted: keep semantics, replace Book-wide stage machine** | Book-owned Deliverable Workflows, versioned profiles, typed artifact registry, human gates/signoff | The revised deliverable family cannot truthfully share one current Book stage; current AI handlers are contract tracers rather than expert behavior. |
| Visible-plan hybrid autonomy | **Accepted: keep and sharpen** | Task Intent + versioned Execution Plan + authority-bearing Plan Envelope with bounded adaptation | The plan is more than presentation but less than blanket approval; material drift suspends and requires a Plan Revision plus renewed Run Authorization. |
| Provider roles, privacy classes, source scope, budgets, fallback | Keep | AI7 policy/resolution plugin over Harness LLM adapters | Harness model selection alone does not encode these domain constraints. |
| Provided Foundation Models plus AI7 Editorial Intelligence Layer | **Accepted product invariant** | Replaceable Harness model adapters plus AI7-owned knowledge/context/evaluation | AI7 improves professional delivery through governed editorial intelligence, not model-weight training. |
| DeepSeek Harness as Agent Behavior Framework | **Accepted purpose; composition detail open** | Versioned behavior composition and evaluation through public Harness extension seams | The main value sought from DSH is better observable agent conduct—not only reusing an agent loop and not training an LLM. |
| Legacy dataset export, fine-tuning, LoRA/DPO, or behavior-cloning roadmap | **Drop from product thesis** | Historical/north-star evidence only | Contradicts the accepted foundation-model invariant and is unnecessary for adaptive retrieval/memory. |

## Records, execution, and safety

| Asset / behavior | Proposed decision | Target treatment | Why |
| --- | --- | --- | --- |
| Task Intent | **Accepted Q22: keep** | Exact structured request in the AI7 Task Ledger, correlated to its rendered Harness message | Pins Book, revision, selection, source, profile, and reviewed inputs without owning a transcript. |
| Run Record | **Accepted Q22: keep and narrow** | Stable semantic/provenance record linked to exact Harness Execution Spans | Avoid a duplicate transcript while preserving authorization, pins, evidence, decisions, Effects, attempts, and typed outcome. |
| Generic Operation Record, Operation Event, and `operationRuns` | **Accepted Q22: drop as active authorities and migration targets** | Harness Session owns the technical timeline; old records remain only in old-repository/offline history | Original AI7 overlaps Run, Operation, and retry-group records; recreating them would make a second execution log. |
| Harness Session ledger and cross-ledger correlation | **Accepted Q22: keep Harness authority; add AI7 bindings** | Canonical model/tool execution history plus sparse Execution Bindings, Harness Execution Spans, and rebuildable projections | One logical causal graph retains business provenance without duplicating model-visible content or control loops. |
| Durable Approval | **Accepted: split named authorities** | Run Authorization, Execution Grant, Proposal Decision, Review Decision, Effect Approval, and existing Public Release Permission | One overloaded Approval cannot safely mean task start, agent execution, editorial judgment, exact Effect authority, and public release. |
| Effect identity, fencing, receipt, ambiguous-outcome policy | **Accepted: keep guarantees, replace machinery** | Deep AI7 Effect capability invoked through guarded Harness tools | Stable exact identity, per-Effect atomicity, receipts, reconciliation, and no ambiguous retry are stronger than ordinary tool results or Session events. |
| Current custom agent loop/provider shell | Drop | Harness agent loop and LLM seams | Current ordinary execution is provider-free/mock and duplicates Harness responsibility. |
| Local engineering multi-agent dispatch workflow | **Accepted: keep and revise for development only** | Repository-agent runbook with typed handoff, scoped authority, exact-commit review, fail-closed identity, and replay lessons | It is development infrastructure, never a shipped AI7 product runtime or a second production agent platform. |
| Windows Host connector for Claude/Codex pilot | Drop if Harness is canonical | Archive evidence; retain only requirements not supplied by Harness | Avoid two worker authorities and enrollment systems. |

## Skills and providers

| Asset / behavior | Proposed decision | Target treatment | Why |
| --- | --- | --- | --- |
| Thirteen canonical AI7 built-in Task Skill IDs | **Accepted: keep as legacy capability evidence** | Versioned AI7 catalog subject to workflow/profile review | All are cataloged runnable, but behavior maturity and execution paths are uneven. |
| Rich AI7 Task Skill manifest | **Accepted: keep semantics, redesign schema** | AI7 declarative package projected into a Harness instructional skill plus AI7-owned activation | Harness Skill metadata lacks versioned identity, trust, capability authority, schemas, and activation evidence. |
| Kernel-mediated capability allowlists | **Accepted: keep and rename** | AI7 Capabilities enforced at both Harness tools and service/backend facades | Tool visibility and prompt instruction are not authority boundaries. |
| Staged skill trust and bundled promotion gate | **Accepted: keep and deepen** | Provenance-derived Trust Tier, content-addressed admission, independent validation, digest-bound enablement ceiling | Trust cannot come from editable manifests; enablement is not Run or Effect authority. |
| Legacy `ai7.workflow.*` pseudo-skills | Drop | Frozen archive/reference metadata only | Superseded by Task Skills and Harness-native orchestration; no legacy Run-history import exists. |
| Provider-free fixtures and sanitized cassettes | Keep | Deterministic replay/evaluation provider | Strong CI asset; never claim it is the production network path. |
| Mock/cassette-only ordinary product execution | Drop | Real Harness model adapters under AI7 provider policy | Current runtime cannot meet full Harness capability or production provider behavior. |

## Runtime and persistence

| Asset / behavior | Proposed decision | Target treatment | Why |
| --- | --- | --- | --- |
| Python manuscript/domain services | **Accepted: drop the implementation, re-express the semantics** | TypeScript domain services in the AI7 service process | Question 33 found the legacy Python carried zero third-party dependencies and handled DOCX with stdlib zip and XML, so nothing required it. Semantics are re-expressed from contract under ADR 0006; no interpreter or worker ships (ADR 0022). |
| `ai7.local-service/v1` concept | Adapt | Versioned local Standalone application boundary | One desktop client still needs one domain/Harness authority; the old Python protocol/process shape is not inherited. |
| Direct Python CLI command path beside the shared service | Drop | One canonical gateway/control path | Current dual route splits authority and compatibility behavior. |
| Atomic `projects.json` as permanent target model or import source | **Accepted: drop; no general importer** | Inspect only to locate user-selected credential references during protected transfer | Rich nested production state must not constrain the new schema or cross the accepted migration allowlist. |
| Legacy production data | **Accepted: do not migrate** | No production Books/manuscripts, generated outputs, indexes, embeddings, memory, workflow/task/run/operation history, proposals, decisions, Effects, receipts, or UI state | The new AI7 starts with a clean business store and does not reproduce obsolete record/storage models. |
| Legacy credentials, mock-provider evidence, and selected test sample Books | **Accepted allowlist-only exceptions** | Protected credential transfer; reviewed mock-provider generators/fixtures/cassettes; explicitly selected test-only sample Books | Preserve required connectivity and deterministic proof without importing old production state; secrets never enter repository files/logs and samples are excluded from production learning/publication by default. |
| Harness append-only Session log and persistence seam | Keep | Canonical model/execution history | Enables replay, fork, recovery, and UI projection. |
| Harness generic Workspace as Book storage | Drop as a mapping | Use only for file/cwd context | Workspace and Book have different ownership and lifecycle. |

## Standalone surface and delivery

| Asset / behavior | Proposed decision | Target treatment | Why |
| --- | --- | --- | --- |
| Standalone-only V1 | **Accepted Q23** | One Chinese-first Windows desktop workbench over one AI7 domain/Task Ledger authority and one Harness runtime | Avoids dual-surface complexity while making the new Standalone editor—not the old UI—the complete V1 product. |
| Professional Standalone text editing | **Accepted as release-critical** | New editor and UI/UX evaluated on long Chinese manuscripts, structure/selection, durable editing/recovery, proposals/review, and import/export | The old Standalone editor was unsatisfactory; dropping Word cannot reduce V1 to chat plus a weak text box. |
| Standalone/Word parity, Word binding, drift, and synchronization | **Dropped/deferred from V1** | Contingency safety evidence only; a future Word scope needs a new evidence-backed decision | One V1 surface has no cross-surface parity or synchronization contract. |
| Word C# COM implementation and add-in | **Do not migrate in V1** | Old-repository/offline contingency evidence | No COM packages, Host protocol, Word installer, signing, or clean-machine Word gate in V1. |
| Existing monolithic renderer/main/runtime modules | Drop as foundation | Rewrite around new client/domain seams; retain journey contracts | File sizes and mixed responsibilities make them poor migration roots. |
| Legacy layouts, Ribbon/component semantics, and Operations/evidence presentation | **Accepted: drop as UI authority** | Mine only for candidate user outcomes and failure cases | The new UI starts fresh; no legacy component or layout parity obligation. |
| Superseded UI PRDs/prototypes | Drop as authority | Reference only | The source repo explicitly closed them for redesign. |
| Windows installer/repair/release machinery | Adapt later | Re-evaluate after final component/process topology | Useful evidence, but premature to port before deployable boundaries exist. |
| Windows-focused desktop target | **Accepted: keep** | Product/platform constraint | It shapes the Standalone runtime, distribution, editor, test, and local application boundary materially. |

## Tests and documentation

| Asset / behavior | Proposed decision | Target treatment | Why |
| --- | --- | --- | --- |
| Glossary and high-value ADRs | Keep as evidence; re-ratify selectively | Import concepts with source attribution; do not blindly inherit every implementation decision | The new foundation invalidates some assumptions. |
| Capability inventory and user journeys | Keep | Target acceptance ledger | Best source of product parity truth. |
| Behavioral, backend-contract, system, and release tests | Adapt/classify | Migrate by behavior class and target seam; retain only surface-neutral value from Word-coupled tests | Word/COM/IPC tests are deferred, while manuscript/Effect behaviors are re-expressed against Standalone/domain seams. |
| Tiered GitHub Actions verification ladder | **Accepted: keep, reduced to two Windows workflows** | `pr` and `release`, each a single job on `windows-2025`; focused verification stays local | Windows is the only target, so it is the only place required evidence is produced. Ubuntu lane, nightly, Test Catalog, and quarantine registry are deferred behind named triggers, not rejected. ADR 0014. |
| Generated mock-LLM-provider test cases | **Accepted: keep and integrate** | Deterministic, provider-free fixtures/cases shared across appropriate tiers | They are required CI evidence; live-provider rehearsals remain separate and optional/authorized. |
| Revised root `AGENTS.md` and one-line `CLAUDE.md` wrapper | **Accepted: keep** | Concise new-project standing rules plus focused linked runbooks | Preserve durable rules, not the legacy file's implementation chronology. |
| Static byte/digest/source-shape tests | Drop unless they protect a real invariant | Replace with behavioral/contract proof | Avoid freezing old decomposition. |
| Sanitized replay cassettes and public synthetic corpus | Keep only through reviewed manifest; regenerate private-linked corpus identity | Exact-match compatibility/evaluation fixtures | High-value deterministic proof, but raw recordings are excluded and the old corpus leaked a private sample's byte-length fingerprint. |
| 4.5 MB legacy `PROGRESS.md` as machine state | Drop | Compact human checkpoint plus issue/decision records | Operational state should not become an architecture dependency. |
| Older React/FastAPI/SQLite/Qdrant reference corpus | Keep as reference only | Mine capabilities and failure cases; no module parity promise | The current AI7 repo already declares it non-authoritative. |

The detailed source-instruction and glossary classification is maintained in [Source Document Inheritance](./08-source-document-inheritance.md). It governs what may be promoted from the pinned `AGENTS.md`, `CONTEXT.md`, and `CLAUDE.md` files; these source documents are never inherited wholesale.

## Harness baseline disposition

| Harness area | Proposed decision | Notes |
| --- | --- | --- |
| Cordis plugin model, profile/bundle layering, typed events | Keep | Primary extension and composition model. |
| Agent loop, LLM seam, tool pipeline, sessions, plans/goals/subagents/jobs | Keep | Canonical generic control plane, with feature-specific limitations recorded. |
| Prompts/context, tools, policy, plans, workflows, subagents, and session hooks as behavior-shaping seams | Keep and study at the exact pin | Form the Harness Agent Behavior Layer; every AI7 composition or change should be versioned, reconstructable, and evaluated. |
| Harness replay and snapshot infrastructure | Keep and adapt | Provides keyless deterministic regression evidence over prompts, tool schemas, protocol output, persisted sessions, and Web UI. It does not prove correctness. |
| General agent-behavior/editorial-quality evaluator | Add in AI7 | The pinned Harness has no general scoring framework or independent goal verifier; AI7 must evaluate source fidelity, editorial quality, policy compliance, and workload reduction. |
| Official web/headless bundles | Adapt | Base composition and reference UI; AI7 requires custom client/shell work. |
| Generic shell/filesystem/coding tools | Available but restricted by profile | “Full Harness” must not silently mean unrestricted manuscript access. |
| Dynamic Cordis packages/`!!js` | Trusted developer capability only | Explicitly not a security boundary. |
| Built-in web server on a network | Drop from default deployment | No TLS/auth/origin policy at the audited revision. |
| Telemetry export | Disabled by default pending privacy design | It can export raw captured session records. |
| Source fork of the full monorepo | Avoid initially | Use only after a demonstrated public-seam gap. |
