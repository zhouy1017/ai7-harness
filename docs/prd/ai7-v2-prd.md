# AI7 V2 PRD

Status: **frozen requirements index as of 2026-09-06 (moved from GitHub Issue #28 under ADR 0064)**. It grants no implementation, Provider, export, release, or `main` authority. Implementation status lives in [`PROGRESS.md`](../../PROGRESS.md) and [E2E journeys](../development/e2e-journeys.md); the delivery order and the mapping of user stories to plan slices live in [`docs/development/development-plan.md`](../development/development-plan.md). Changes to requirements enter through an ADR or a plan revision, never by editing this file silently.

## Problem Statement

Professionals at leading literary publishing houses in mainland China must edit, verify, review, package, and maintain very long Chinese manuscripts while preserving exact source text, editorial history, evidence, and institutional judgment. Existing workflows fragment manuscripts, source material, comments, model conversations, approvals, exports, and recovery state across tools. Generic AI assistants compound that problem: they operate on partial context, blur generated suggestions with authoritative text, offer broad filesystem or network access, and treat model/tool success as if it proved a business result.

Editors need a Chinese-first desktop product that remains responsive on manuscripts up to 10 million Chinese characters, supports professional import/edit/review/delivery work on Windows and macOS, and makes every consequential change inspectable and reversible through exact records. Model assistance must remain subordinate to Book scope, manuscript revision authority, evidence, explicit decisions, versioned policy, and independently verified Effects. Local editing, recovery, search, history, and eligible local export must not depend on a model provider or network connection.


## Solution

AI7 is a Chinese-first Standalone editorial desktop product organized around exact Books and their authoritative editorial records. It combines a bounded ProseMirror manuscript surface with a separate Node service that owns Books, manuscripts, revisions, journals, AI7 authority/compatibility sidecars and projections, durable Workflow Instances and business state, tasks, policies, Effects, receipts, retrieval, analysis Result Sets, Enrollment, quality signals, and learning lineage. Native DSH Skill/Plugin/Bundle/Profile/Agent Preset artifacts retain their identity, versioned Workflow definitions and eligible technical logic; AI7 owns exact pins, compatibility and authority crossings rather than copying those definitions into a competing owner. A thin Electron main process owns native lifecycle and user-chosen file dialogs; an isolated renderer owns presentation; the service composes the pinned DeepSeek Harness runtime behind an AI7-owned `PrimaryAgentHarness` boundary and presents a Book-bound DSH-composed Agent Workspace.

The product supports sixteen coherent editorial journeys: safe import and reimport; very-long-manuscript editing; exact task authorization; evidence-bearing factual review; proposal review and Apply; conflict resolution; deliverable workflow and local export; recovery; concurrent Runs; explicit continuation semantics; governed feedback and learning; data/model-service setup; Series knowledge and restrictions; cross-platform accessibility; reusable procedures; and Book-bound interactive editorial dialogue.

AI7 keeps authority explicit. The Manuscript Revision is authoritative; windows, indexes, retrieval chunks, Coverage projections, and model context are non-authoritative derivations. Targeted retrieval and Exact Fetch remain distinct from deterministic covered analysis and immutable Result Set Revisions. A model result is never a manuscript change. Run Authorization, Proposal Decision, Review Decision, the exact single-use AI7 Apply boundary, Effect Receipt, Publication Version, and Public Release Permission remain distinct. Trusted launch authority maps development/CI to immutable Provider Processing v1, exact fixture recording to immutable v2, and ordinary production to default-deny v3; setup and policy eligibility create no Provider path or Run authority. External Export Policy v1 only makes one exact user-selected local-file Effect eligible for later approval and verified commit.

## User Stories

1. As a professional editor, I want every activity anchored to an exact Book, so that manuscripts, sources, tasks, decisions, and deliverables never drift into an unbound conversation.
2. As a professional editor, I want to create an intentionally empty Book, so that I can prepare work before a manuscript or source arrives.
3. As a professional editor, I want a Book Work Overview, so that I can understand manuscript, workflow, task, proposal, evidence, and delivery state in one place.
4. As a professional editor, I want direct routes to exact revisions and records, so that navigation never hides which version I am viewing.
5. As a professional editor, I want multiple Book windows without focus theft, so that parallel work does not interrupt the manuscript I am editing.
6. As a professional editor, I want AI7 to explain its Product Data Location, so that I understand where durable editorial material lives.
7. As a non-technical user, I want native file selection rather than filesystem instructions, so that I can reach my own material safely.
8. As a professional editor, I want local reading and editing to work offline, so that provider or network availability never blocks core editorial work.
9. As a cross-platform editor, I want the same product meanings on Windows and macOS, so that platform adapters do not change editorial outcomes.
10. As a returning editor, I want startup to restore authoritative durable state, so that a restart does not invent completion or lose uncertainty.
11. As a professional editor, I want to select a DOCX through the native picker, so that AI7 receives only the file I explicitly chose.
12. As a professional editor, I want import targets and relationships initially unselected, so that similarity or context never silently decides authority.
13. As a professional editor, I want exact-match, filename-collision, and fuzzy-similarity findings disclosed separately, so that hints cannot masquerade as identity.
14. As a professional editor, I want to review fidelity before import, so that preserved, degraded, and rejected document features are explicit.
15. As a professional editor, I want an editable Book title suggestion with its source disclosed, so that local heuristics remain suggestions.
16. As a professional editor, I want new-Book manuscript import committed atomically, so that Book, primary Manuscript, initial Revision, workflow, provenance, and import records cannot partially exist.
17. As a professional editor, I want to add the first primary Manuscript to an existing empty Book, so that Book identity is preserved.
18. As a researcher or editor, I want to import material as a Book-owned Source Version without creating a Manuscript, so that sources and manuscripts remain distinct.
19. As a professional editor, I want to create a source-bound zero-Manuscript Book, so that source development can precede manuscript intake.
20. As a professional editor, I want reimport to use verified lineage when available, so that comparison does not invent source ancestry.
21. As a professional editor, I want a verified no-change reimport outcome without an empty Revision, so that history remains meaningful.
22. As a professional editor, I want interrupted import drafts revalidated before continuation, so that stale target, relationship, lineage, or fidelity choices cannot commit.
23. As a professional editor, I want an uncertain import commit blocked for reconciliation, so that retry cannot create a duplicate Book graph.
24. As a long-form editor, I want a bounded manuscript window, so that renderer memory does not grow with manuscript size.
25. As a long-form editor, I want AI7 to remain responsive up to a 10-million-character manuscript, so that professional-scale books remain editable.
26. As a long-form editor, I want to jump across distant outline and global positions, so that windowing does not make the manuscript feel fragmented.
27. As a long-form editor, I want indexed whole-manuscript search and jump, so that find latency does not depend on loading the whole text into the renderer.
28. As a long-form editor, I want replacement previews and atomic application, so that large changes remain inspectable and all-or-none.
29. As a Chinese-language editor, I want correct Simplified Chinese IME composition, so that ordinary typing is stable and natural.
30. As a professional editor, I want exact selections anchored to stable Manuscript Blocks and grapheme positions, so that proposals and tasks survive window changes.
31. As a professional editor, I want visible durable Edit Journal acknowledgement, so that renderer-local state is never mistaken for saved work.
32. As a professional editor, I want meaningful Manuscript Checkpoints, so that task input, milestones, and recovery boundaries remain distinct.
33. As a professional editor, I want durable undo and redo, so that restart does not erase the edit history I depend on.
34. As a professional editor, I want independently verified Recovery Snapshots, so that recovery does not depend on the same failing store path.
35. As a professional editor, I want service-side whole-manuscript work off the UI thread, so that indexing or analysis never freezes typing.
36. As a publishing professional, I want inline styles, revisions, notes, tables, images, sections, headers, and footers classified as preserve, disclose-degradation, or reject, so that fidelity loss is never silent.
37. As a professional editor, I want a Task Intent bound to exact targets and ranges, so that a Run cannot silently change what it is acting on.
38. As a professional editor, I want newer acknowledged journal state materialized as a Task Input Checkpoint, so that every task reference resolves to one exact Revision.
39. As a professional editor, I want native DSH artifact recommendations to remain optional and exact-revision-aware, so that a suggested Skill, Plugin, Bundle, Profile, or Agent Preset never grants install, enablement, Run, Enrollment, or Apply authority.
40. As a professional editor, I want to choose Book, Series, and Cross-project source scope explicitly, so that readable context is understandable and bounded.
41. As a professional editor, I want outbound-data categories disclosed before authorization, so that controlled provider processing is visible.
42. As a professional editor, I want the default Run Budget Ceiling shown as unset rather than unlimited, so that AI7 and provider limits are not confused.
43. As a professional editor, I want a Plan Preview of goal, scope, capabilities, providers, privacy, budget, Effects, and pins, so that authorization is informed.
44. As a professional editor, I want Quick Start and each Default Execution Rule to remain exact projections of accepted rules and match only a newly user-initiated Task, so that speed never schedules ambient background work or grants Apply authority.
45. As a professional editor, I want Run Authorization to bind an exact Plan Envelope, so that material drift requires a Plan Revision.
46. As a professional editor, I want non-material Plan Adaptations logged inside the unchanged envelope, so that the agent can progress without silently expanding scope.
47. As a professional editor, I want choice-first Clarification Requests, so that unresolved decisions are quick, bounded, and restart-safe.
48. As a professional editor, I want continued editing not to retarget an already authorized Run, so that its evidence and outcome remain reproducible.
49. As a professional editor, I want concurrent Runs across Books, so that background work does not serialize my editorial day.
50. As a professional editor, I want Global Attention grouped by Book, so that concurrent activity remains understandable without stealing focus.
51. As a professional editor, I want pause and cancel controls with honest partial outcomes, so that cancellation never pretends to undo committed Effects.
52. As a professional editor, I want scratch, cache, scope, usage, and budget state isolated per Run, so that concurrent Books never leak into one another.
53. As a professional editor, I want Resume to continue the same unchanged Run only after explicit action, so that restart cannot dispatch silently.
54. As a professional editor, I want Retry to create a new safe attempt within the same Run, so that attempt history remains intact.
55. As a professional editor, I want Rewind to append a new direction without erasing history, so that prior decisions and Effects remain auditable.
56. As a professional editor, I want Redo to create a newly authorized Run, so that materially changed work receives new authority.
57. As a professional editor, I want Replay to execute nothing, so that inspection cannot create side effects.
58. As a professional editor, I want reaching an explicit Run Budget Ceiling to end that Run honestly, so that increased budget requires Plan Revision and Redo.
59. As a professional editor, I want Provider Account Limits distinguished from AI7 budget ceilings, so that the correct recovery action is clear.
60. As a professional editor, I want ambiguous external outcomes to disable automatic retry and fallback, so that duplicate Effects cannot be created.
61. As a professional editor, I want to enter and leave a Book-bound DSH-composed Agent Workspace with exact Book, safety, composition, and Active Work Object context visible, so that interactive dialogue never becomes an unbound assistant surface.
62. As a professional editor, I want foreground Agent Workspace answers to stream semantic fragments while already-authorized background Runs remain quiet and non-focus-stealing, so that presentation changes do not originate new work.
63. As a professional editor, I want Agent Workspace content to enter a Proposal, Task Intent Draft, Source, or other governed record only through an explicit action, so that dialogue never mutates manuscript or authority automatically.
64. As a fact-checking editor, I want assertion markers tied to exact manuscript positions, so that review returns to what the source actually says.
65. As a fact-checking editor, I want Reference Integrity, Claim Support, and Factual Verification shown independently, so that one status cannot stand in for another.
66. As a fact-checking editor, I want retrieval to return candidates rather than truth or coverage evidence, so that ranking uncertainty and comprehensive-analysis completeness remain visibly separate.
67. As a fact-checking editor, I want to save a fully retrieved research snapshot as a Source Version only through an explicit Book target, so that temporary research does not silently become retained source material.
68. As a fact-checking editor, I want Exact Fetch restricted to pinned authoritative revisions and versions, so that quotations can be certified against exact text without pretending that the whole manuscript was covered.
69. As a fact-checking editor, I want unresolved and conflicting evidence preserved, so that AI7 does not manufacture certainty.
70. As a fact-checking editor, I want model knowledge used only to raise questions and guide research, so that generated knowledge is never cited as evidence.
71. As a fact-checking editor, I want proposed factual fixes expressed as exact-revision Correction Proposals, so that source text is never silently rewritten.
72. As a fact-checking editor, I want citations and navigation back to exact source locations, so that evidence can be inspected efficiently.
73. As a reviewing editor, I want Proposal Cards anchored to persistent manuscript positions, so that windowing does not detach changes from context.
74. As a reviewing editor, I want each semantic Proposal Change Item decided independently, so that unrelated edits are not bundled.
75. As a reviewing editor, I want Atomic Proposal Change Groups to require an explicit justification, so that all-or-none semantics are visible.
76. As a reviewing editor, I want current text, proposed text, rationale, and evidence shown separately, so that persuasion cannot replace comparison.
77. As a reviewing editor, I want to edit or selectively use proposal content, so that the final editorial judgment remains mine.
78. As a reviewing editor, I want Proposal Decision recorded separately from the exact AI7 Apply boundary, so that acceptance is never mistaken for mutation authority.
79. As a reviewing editor, I want Apply Preparation to bind one exact Book, base revision, diff, target set, and result preview, so that the pending manuscript mutation is fully inspectable.
80. As a reviewing editor, I want drift rechecked before one explicit confirmation creates and consumes a single-use AI7 Apply, so that Run, Session, artifact, Enrollment, update rule, default rule, Proposal Decision, or prior approval cannot authorize mutation by implication.
81. As a reviewing editor, I want only a verified Apply Effect Receipt to prove the new Revision, with retry limited to idempotent recovery of the same Effect, so that UI or Harness success cannot create or duplicate business outcomes.
82. As a reviewing editor, I want same-block and structural conflicts resolved all-or-none, so that partial mutation cannot corrupt the manuscript.
83. As a reviewing editor, I want model-composed conflict resolutions to remain Proposals, so that AI generation never becomes authority.
84. As a reviewing editor, I want reversal to be a new governed Effect, so that history and prior receipts remain immutable.
85. As an editorial workflow owner, I want each deliverable Workflow Instance to pin an exact native DSH Workflow definition through an AI7 projection while AI7 alone owns durable phases, gates, signoffs, scheduling, and transitions, so that different outputs progress independently without copying definition ownership.
86. As an editorial workflow owner, I want phases to overlap, reopen, or be skipped with a reason, so that the system reflects real publishing work.
87. As an editorial workflow owner, I want Workflow Gate and Review Decisions recorded exactly, so that process state does not imply factual or legal authority.
88. As an editorial workflow owner, I want to save an exact Milestone Version, so that important internal states are durable without implying publication.
89. As an editorial workflow owner, I want immutable Editorial Deliverable revisions, so that delivery history remains reconstructable.
90. As an editorial workflow owner, I want a destination- and format-independent Delivery Package, so that package identity does not collapse into one exported file.
91. As a production editor, I want to select format and fidelity per export, so that DOCX, PDF, and Markdown consequences are explicit.
92. As a production editor, I want native alternative-name, cancel, and replace behavior for collisions, so that AI7 follows platform conventions without duplicating authority.
93. As a production editor, I want every exported file to have its own preparation, approval, atomic commit, verification, and receipt, so that batch actions remain exact.
94. As an editorial authority, I want to designate an exact Publication Version separately, so that delivery and publication status remain distinct.
95. As an editorial authority, I want corrections, errata, supersession, withdrawal, reissue, and archive represented as versioned Maintenance Cases, so that post-designation history is never rewritten.
96. As an editorial authority, I want local export to prove only its exact local file result, so that it never implies sending, delivery, publication, or Public Release Permission.
97. As a professional editor, I want contextual feedback prompts to be optional and non-blocking, so that learning does not interrupt editorial work.
98. As a professional editor, I want reason choices initially unselected, so that AI7 does not learn its own guess as my judgment.
99. As a professional editor, I want Learning Material candidacy separated from eligibility, so that captured signals do not automatically influence behavior.
100. As a professional editor, I want Book-level eligibility to be the default explicit choice, so that another Book cannot silently receive raw text or facts.
101. As an editorial leader, I want Series or House inclusion to require a separate visible decision, so that broader learning scope is governed.
102. As an editorial leader, I want backward and forward Learning Lineage, so that every learned influence can be audited.
103. As an editorial leader, I want exclusions to preserve history while stopping future influence, so that remediation remains explainable.
104. As an editorial leader, I want quality signals from decisions, revisions, survival, dissatisfaction, and effort-weighted edit volume, so that improvement reflects real editorial value.
105. As a professional editor, I do not want per-task time tracking, so that quality measurement does not become surveillance.
106. As a new AI7 user, I want the product to operate with zero prior data, so that sample thresholds never block work or proposals.
107. As a Series editor, I want explicit Series membership changes with impact previews, so that sharing scope changes prospectively and visibly.
108. As a Series editor, I want editor-authored or provenance-bound Series Knowledge Candidates, so that shared knowledge has an exact source.
109. As a Series editor, I want conflicts edited, preserved with disclosure, or cancelled, so that promotion never silently resolves disagreement.
110. As a Series editor, I want Series Knowledge Items to retain immutable revisions and promotion decisions, so that shared knowledge remains auditable.
111. As a professional editor, I want exact Series Knowledge revisions selected and pinned in an authorized Run, so that membership alone grants no read scope.
112. As a professional editor, I want Cross-project sources selected separately from Series scope, so that the two sharing mechanisms cannot be conflated.
113. As a Series editor, I want a new Series Retrieval Exclusion to stop affected future reads immediately, so that current restrictions override historical authorization.
114. As a Series editor, I want ending an exclusion not to auto-resume old work, so that changed scope receives renewed authorization.
115. As a professional editor, I want every manuscript mutation targeted to one exact Book and Revision, so that richer Series sharing never widens mutation authority.
116. As an administrator, I want Task Intents, exact native DSH artifacts, and analysis contracts to declare Model Roles rather than providers, so that provider choice remains replaceable and centrally governed.
117. As an administrator, I want on-demand Model Service setup by Model Role using opaque Credential References, so that secrets never enter prompts or diagnostics and setup grants no artifact, Enrollment, Run, dispatch, or Apply authority.
118. As an administrator, I want a final AI7-owned payload and egress gate evaluated under the trusted launch-selected operational scope, so that the complete outbound request is checked immediately before transmission.
119. As an administrator, I want a missing, unknown, or unmatched trusted operational scope to deny Provider Processing with no cross-scope fallback, so that configuration or product settings cannot grant egress.
120. As an administrator, I want External Export policy evaluated separately from provider processing, so that local files and model calls never share authority.
121. As an administrator, I want credentials replaceable or removable without revealing values, so that secret management remains safe for non-technical users.
122. As a portable-product user, I want credentials kept outside the portable AI7 folder, so that copying the folder never copies secrets.
123. As an editorial authority, I want Public Release Permission independent from provider processing and local export, so that each boundary remains explicit.
124. As a professional editor, I want to capture a completed Run or visible steps as a native DSH artifact, AI7 projection, Default Execution Rule, or developer proposal candidate, so that useful work can be repeated deliberately without inventing a generic automation object.
125. As a professional editor, I want each candidate classified as a native DSH Skill, Plugin, Bundle, Profile, Agent Preset, Workflow-definition draft, AI7 projection, Default Execution Rule, or Developer Capability Proposal, so that carrier identity and authority remain explicit.
126. As an administrator, I want native artifact acquisition, non-executing validation/conversion, installation, scoped enablement, and per-Run activation separated, so that provenance and installation establish only an authority ceiling.
127. As an administrator, I want native Workflow-definition publication, AI7 Workflow Profile projection, artifact update/adoption, and Default Execution Rule enablement governed through distinct paths, so that definition, compatibility, update, and execution authority cannot collapse.
128. As a professional editor, I want unpinned reuse to resolve the latest scoped-enabled compatible native revision and its AI7 sidecar before authorization, so that the selected artifact and authority ceiling are exact.
129. As a professional editor, I want active Runs and Workflow Instances to retain immutable native-artifact and AI7-sidecar pins, so that later adoption, update, rollback, or retirement never rewrites history.
130. As a professional editor, I want artifact reuse to begin with current-Book scope and require explicit compatible scope expansion, so that enabling a procedure never transfers another Book's materials or grants background analysis.
131. As an auditor, I want source snapshots, imported working revisions, adopted versions, update decisions, rollbacks, and retired native revisions to retain non-executable lineage, so that old outcomes remain explainable and imported updates stay inert until governed adoption.
132. As a keyboard user, I want every supported journey reachable through labeled keyboard paths, so that pointing-device use is optional.
133. As a Chinese-language editor, I want representative Simplified Chinese IMEs supported across editing and input surfaces, so that composition is reliable.
134. As a low-vision user, I want 200% zoom and reflow without hidden authority or state, so that the product remains operable.
135. As a keyboard user, I want visible focus and predictable focus preservation, so that background updates do not disorient me.
136. As an accessibility user, I want light, dark, Windows forced-colors, and applicable macOS appearance support, so that meaning is not encoded only by color.
137. As a cross-platform user, I want native dialogs and shortcuts with equivalent final outcomes, so that platform conventions do not fork product semantics.
138. As a professional editor, I want an editable Detached Manuscript Window, so that flexible layouts do not lose exact context or state.
139. As a Chinese-first user, I want preferred Simplified Chinese labels on product surfaces, so that stable English identifiers remain an implementation detail.
140. As a professional editor, I want consequence-first errors that retain safe work and name uncertainty, so that failures are actionable without technical literacy.
141. As a cross-platform user, I want Windows and macOS treated as one product, so that no platform becomes a reduced-capability edition.
142. As an editorial analyst, I want a deterministic Coverage Manifest divided into complete structure-aware Analysis Units, so that comprehensive analysis can prove what was planned and processed without loading a whole manuscript into one context.
143. As an editorial analyst, I want typed provenance-preserving reducers to retain gaps and conflicts while reporting coverage, closure, freshness, and assurance independently, so that one score cannot manufacture completeness.
144. As an editorial analyst, I want immutable Result Set Revisions for sync-to-current, selected-range forced reanalysis, and full-Book forced reanalysis, so that reuse, invalidation, and recomputation lineage remain inspectable.
145. As a professional editor, I want one baseline manuscript-analysis contract plus independently selected optional, Plugin-provided, and user-defined analysis kinds, so that useful additions do not silently redefine the baseline.
146. As a professional editor, I want background manuscript analysis to require an explicit, disclosed, revocable Background Analysis Enrollment while successful import remains independent, so that background work cannot arise from setup, installation, or import completion.
147. As an editorial leader, I want immutable Result Set-bound Quality Signals and a separate versioned Analysis Quality Metric, so that feedback is not treated as truth, learning authority, Policy activation, or cross-Book permission.
148. As an auditor, I want every Run to record its exact foreground, Default Execution Rule, or Background Analysis Enrollment origin and allow inheritance only for declared generation, embedding, reranking, subagent, analysis, and reducer suboperations, so that hidden work cannot borrow authority.

## Implementation Decisions

- AI7 is one Chinese-first Standalone desktop product for professional literary publishing on Windows and macOS; Microsoft Word integration is excluded from V1.
- The accepted runtime topology remains three processes: thin Electron main, context-isolated renderer with Node integration off, and a separate Node service as sole local product authority.
- The Electron main owns native lifecycle, window creation, user-chosen file/destination dialogs, and service supervision; it owns no manuscript, Run, Effect, credential, or receipt semantics.
- The renderer owns interaction and ephemeral projection state. ProseMirror edits bounded windows mapped to stable Manuscript Block identities and never holds a whole manuscript.
- The Node service owns Books, sources, manuscripts, revisions, branches, journals, recovery, AI7 artifact sidecars/projections, durable Workflow Instances and business state, tasks, policies, capabilities, Provider bindings, Effects, receipts, retrieval, Coverage/Result Sets, Enrollment, analysis metrics, quality signals, and learning lineage.
- DeepSeek Harness supplies the one generic agent loop inside an AI7-owned `PrimaryAgentHarness` boundary. AI7 does not fork the loop or adopt coding-agent presets, generic shell, arbitrary filesystem, arbitrary network, jobs, schedule, or workflow packages.
- Many isolated Runs may use instances of the same loop. AI7 owns scheduling, concurrency, budgets, continuation, business state, and model-free jobs; Harness owns technical turn/session execution.
- The AI7 Task Ledger and Harness Session Ledger remain separate authoritative ledgers joined by exact Execution Bindings and Harness Execution Spans; transcripts are not copied into AI7 business records.
- The Manuscript Revision is the sole authoritative text. Windows, indexes, outlines, chunks, embeddings, and assembled context are rebuildable projections with exact derivation revisions and overlap-based invalidation.
- Long-manuscript scale tiers remain binding: no sensible degradation below 500K Chinese characters, no critical issue up to 1M, and no crash or unresponsiveness up to 10M. Typing latency depends on bounded window size rather than manuscript size.
- Import uses a persisted, non-authoritative Staged Import Snapshot and exact relationship review before one atomic domain commit. Reimport preserves verified lineage or discloses conservative comparison.
- Manuscript history uses stable Blocks, immutable reconstructable Revisions, text-only Branches, per-branch Edit Journals, meaningful Checkpoints, and independent Recovery Snapshots as distinct records.
- Every formal agent-originated Manuscript mutation begins from an exact governed proposal/preparation and crosses one AI7 Apply boundary. Apply binds one Book/base/diff/target set, rechecks drift, requires explicit editor confirmation, is single-use, and is proven only by a verified Effect Receipt; direct typing and deterministic editor commands remain separate.
- Factual review keeps textual fidelity, Reference Integrity, Claim Support, and Factual Verification independent. Retrieval returns candidates; only Exact Fetch against pinned authority certifies exact text.
- Book is the source, privacy, and mutation authority. Native DSH artifacts retain versioned Workflow definitions and eligible technical logic; AI7 projections pin compatibility/authority, and Editorial Deliverables own AI7-durable Workflow Instances whose phases, gates, signoffs, scheduling, and deterministic business transitions may overlap, reopen, or be skipped with a reason.
- Delivery Package identity is destination- and format-independent. Publication Version and Public Release Permission remain separate from package creation and local export.
- External Export Policy v1 is default-deny and makes only an exact user-selected local-file Effect eligible. Each file still requires frozen preparation, exact approval, atomic commit, verification, and its own receipt or classified outcome.
- Trusted build/launch authority maps development/CI to immutable Provider Processing v1, exact `sample1` fixture recording to immutable v2, and ordinary production to default-deny v3 through active-policy-set v3. This policy selection is current design authority but proves no executable selector, adapter, endpoint, model binding, credential, dispatch path, or live call exists.
- Native DSH Skill/Plugin/Bundle/Profile/Agent Preset artifacts retain native identity, versioned content, Workflow definitions, and eligible technical logic. AI7 owns separate exact pins, compatibility/authority sidecars, scoped enablement, per-Run activation, foreign-Skill source/working/update lineage, and durable business state; acquisition, installation, or enablement grants no Run, Enrollment, Provider, or Apply authority.
- Model Roles in Task Intent, exact native artifacts, and analysis contracts express requirements without naming a provider. Provider Preflight freezes eligible bindings, outbound-data category, scope, and budget inside the Plan Envelope; declared model-driven suboperations inherit only that unchanged envelope, and missing/unknown operational scope denies with no cross-scope fallback.
- Credential values remain in an OS-protected store and never enter prompts, Session text, generic environments, results, or diagnostics. Only opaque references cross ordinary product boundaries.
- One logical causal graph uses exact named decisions and Effects. Harness success, tool output, renderer state, notification, or Session event is never an AI7 Effect Receipt.
- Series is an explicit sharing exception with governed Series Knowledge and read scope; manuscript mutation remains Book- and Revision-targeted. Current retrieval exclusions stop later affected reads immediately.
- Editorial Learning stays outside model weights. Learning Eligibility, editorial preferences, factual correctness, and global metric aggregation remain separate concerns with visible Learning Lineage.
- AI7 ships no Python interpreter. Runtime and domain implementation remain TypeScript and Node unless a separately accepted ADR admits one bounded native capability.
- Dependencies use exact versions and a committed lockfile. DSH aggregate CLI and excluded generic tool packages must remain absent from the dependency graph.
- The current source checkout is one deep root package rather than a horizontal empty monorepo. Existing Electron, renderer, service, storage, bounded editor, J-01 scenario, and command owners must be extended before any new owner is proposed.
- Exact current development pins are Node 24.18.1, pnpm 11.24.0, Electron 43.4.1, and TypeScript 6.0.3.

## Testing Decisions

- The Owner-confirmed highest seam is the existing launchable-product E2E Functional Gate. A test starts through the built Electron product and observes user-visible, domain, authority, and durable-data outcomes across renderer, main, service, composed Harness, and persistence boundaries.
- Supported journey IDs are the scenario vocabulary. Windows and macOS execute the same admitted IDs; native mechanics may differ but supported meaning and outcome may not.
- The ideal seam count is one. Functions, modules, IPC edges, service methods, databases, package closure, platform mechanics, and Harness adapters do not receive independent standing gates.
- A new supported scenario is admitted only when a separately authorized Change Brief names the exact Journey ID and bounded outcome. A regression variation additionally names an observed bug Issue.
- E2E product execution is provider-free, credential-free, outbound-network-denied, and based only on authorized public synthetic inputs or exact Owner-designated Public SampleBooks. Logs and artifacts expose scenario identity/state/failure location, never manuscript payload.
- A deterministic model fixture may exist only inside the same journey boundary when a later authorized journey requires model-facing turns; it is not a provider emulator, conformance suite, cassette programme, or separate proof surface.
- Six exact Owner-designated Public SampleBooks are tracked under exact root `SampleBooks/` through Issue #32 / PR #33. Exact `sample1` is the standing compatibility baseline consumed by the manuscript-dependent Journeys; the other five admitted books remain unused. Raw payload remains excluded from logs, uploaded build/test artifacts, and distributions.
- Good tests assert consequences visible to the editor and exact durable records, including negative authority outcomes. They do not assert internal class layout, SQL shape, message order, or Harness internals unless those details become user-visible behavior.
- Accessibility, fidelity, recovery, privacy, authority, and long-manuscript behavior remain product requirements inside applicable complete journeys; they do not create separate standing test programmes.
- Lint, type-check, format, and build may remain developer commands required to construct the product subject, but they are not independent CI success subjects.
- No live provider call, private or non-designated manuscript, credential, screenshot, trace, video, product database, performance gate, coverage target, package proof, release proof, or formal review gate is introduced by this PRD. Public SampleBooks remain raw test inputs only and are not logged, uploaded as artifacts, or distributed.

## Out of Scope

- Treating this PRD, its `ready-for-agent` label, or any accepted design statement as direct implementation authority.
- Claiming that the existing tracer completes full J-01 or any of J-02 through J-16.
- Selecting the next bounded implementation outcome; that requires a separate Owner-authorized Issue and Change Brief.
- Microsoft Word integration, COM add-ins, Word synchronization, Word packaging, or Word verification in V1.
- A generic shell, arbitrary filesystem access, arbitrary network access, TCP listener, developer capability escalation, or coding-agent tool surface.
- Forking DeepSeek Harness, implementing a second generic agent loop, or depending on the aggregate DSH CLI.
- Trusted operational-scope selector implementation, Provider adapter/model/endpoint binding, credential use, live Provider/API calls, runtime dispatch, or production Provider-path proof.
- AI-mediated cloud, network, email, or remote-send export.
- Public release, external publication, tag creation, packaging/release automation, signing, notarization, or promotion from `dev` to `main`.
- Importing legacy production Books, manuscripts, indexes, embeddings, memory, runs, workflows, proposals, decisions, Effects, receipts, or UI state.
- Copying private manuscripts or derivatives into a repository, hosted CI, logs, artifacts, fixtures, corpora, or distribution.
- Inspecting or reproducing Public SampleBooks content during this PRD refresh; the refresh uses only integrated authority, manifest metadata, and existing scenario evidence.
- Training or fine-tuning a language model or storing Professional Editorial Knowledge in model weights.
- Inventing new proof programmes, separate test gates, test catalogs, coverage inventories, quarantine registries, or platform certification lanes.
- Replacing current architecture, domain owners, policy documents, or UI/UX authority with this summary.

## Further Notes

- Canonical design remains target-qualified to exact `dev` owners. This refresh resolves them from `dev@ec623a6ae3d411c36eb64d02b7c527fd3f883cc5`, including root ADRs 0045–0048, V2 architecture/UI/UX, domain contexts, Provider Processing v1/v2/v3 and active-policy-set v3. This PRD is a navigational synthesis; conflicts are resolved in favor of those owners.
- The source design provenance is frozen `design-doc@6895f02d2983865516d267809d8cdda77026f62c`, normalized through the exact allowlist already integrated into `dev`.
- Immutable Issue #24 checkpoint `4ef62ac1d1de37c2cc644fd17669bd4669ec8441` is historical ancestry, not the current implementation head. Material integrated evolution includes SampleBook admission through Issues #30/#32 and PRs #31/#33; the `sample1` J-01 sequence through Issue #36 and PRs #74/#75/#77; reimport disclosure through Issue #78 / PR #79; Issue #86 successor normalization through PR #87; Reviewer-rule normalization through #98 / PR #99; deterministic import identity through #37 / PR #100; import continuity/reconciliation through #41 / PR #101; the complete bounded J-02 module through #43 / PR #102; and the complete J-08 Recovery Workspace through #45 / PR #105 at exact `dev@76e7ee36b281464d8d44938e57d36c52c4c0e10a`.
- The product display name is exactly **AI7**. Harness remains third-party execution infrastructure and is never user-facing branding.
- Preferred Simplified Chinese labels belong on product surfaces; stable English domain terms remain architecture and record identifiers.
- Human review should focus on product boundary, native-artifact versus AI7 authority ownership, Run/Enrollment/Apply separations, targeted retrieval versus covered analysis, current-versus-future implementation truth, the single E2E seam, and the exact `sample1`-versus-other-Public-SampleBooks consumption boundary under ADRs 0043–0044.

### Original publication Change Brief (historical)

The following original publication brief is preserved verbatim. Its exact base and then-current scope describe the initial publication event, not this refresh.

### Change Brief

#### Authority Resolution
- Exact base / branch state: clean `dev@1a0914530007287fc1fa93c107685cd49be6d9eb`.
- Intended integration target: current `dev`; this Issue does not target `main`.
- Canonical authority: the exact-base root Context Map and contexts, root ADRs, V2 architecture/UI/UX packages, active Policy Documents, CI boundary, and existing source-checkout implementation owners.
- Owner authorization and scope: synthesize the current accepted design into a PRD and publish a rapid human-review report; confirm one launchable-product E2E seam; record the Owner's statement about publicly usable `samplebooks` material without consuming it.
- Commander authority: create and label this Issue, add the review report, and update only current routing through the normal `dev` PR flow.
- Implementation journey: `N/A — documentation/design synthesis only; no product behavior is authorized`.
- Candidate input: six exact Owner-designated Public SampleBooks are admitted through Issue #32 / PR #33 under ADR 0043; this PRD did not read their content and no current Journey consumes them.
- Supersession: none. This PRD does not supersede contexts, ADRs, policies, V2 specifications, or the integrated tracer boundary.
- Open matters deliberately out of scope: next bounded outcome, full-J-01 sequencing, provider policy expansion, export implementation, release, and `main` promotion.

#### Outcome
- Non-product outcome: one issue-tracker PRD plus one concise human-review report that accurately separates accepted design, current implementation, and future authority.
- Current failure: the accepted design is comprehensive but distributed across architecture, UI/UX, domain, policy, and runbook owners; reviewers lack one product-level synthesis.
- Completion boundary: required PRD sections, extensive journey-covering user stories, implementation/testing decisions, explicit exclusions, review summary, `ready-for-agent` label, and current routing link.

#### Existing State and Reuse
- Existing owners: current root contexts/ADRs, V2 packages, Policy Documents, one E2E boundary, and the existing tracer implementation.
- Consumers inspected: product journeys, source-checkout commands, current Issue tracker rules, and current progress/handoff routers.
- Related integrated work: Issues #18, #20, #22, #24, #26 and PRs #19, #21, #23, #25, #27.
- Reuse disposition: synthesize and route; create no competing product or domain owner.
- New owner justification: no new repository authority owner is created; the GitHub PRD is a review and downstream-planning index.

#### Structural Budget
- Allowed responsibility: issue body, issue comment, `ready-for-agent` label, and concise current routing updates.
- Allowed processes: authenticated GitHub Issue/PR operations under Commander authority only.
- Expected repository paths: root `PROGRESS.md` only if routing is updated.
- Non-goals: product source, schema, dependency, policy, context, ADR, CI workflow, scenario, test data, manuscript content, release, or `main` change.
- No-change guarantees: current tracer behavior and evidence remain unchanged; no journey or Effect gains implementation authority.

#### Consequences
- Data/migration: none.
- Authority/privacy/egress/credential/Effect: no new authority or execution; no protected material, credential, provider transmission, export, or Effect.
- Windows/macOS variation: none; the PRD records existing shared product behavior.
- E2E: `N/A — documentation-only; no automated proof`.
- Cleanup: delete local PRD publication scratch files; keep the Issue and review comment as the requested tracker artifacts.

#### Stop Conditions
- Stop if synthesis would resolve a new product/domain decision, authorize an implementation slice, consume manuscript content, weaken policy, add a gate, or target `main`.
- Decision owner: Owner for any such expansion; Commander may only preserve ambiguity and report it.

#### Documentation Lifecycle
- Archive trigger: none; this is a new review index over active owners.
- Keep: PRD Issue, review comment, and concise current routers. Delete publication scratch files. No archive copy.


### Issue #86 successor refresh Change Brief (2026-08-27)

#### Authority Resolution
- Exact target-qualified baseline: integrated `dev@ec623a6ae3d411c36eb64d02b7c527fd3f883cc5` from Issue #86 / PR #87.
- Canonical authority: that exact tree's `AGENTS.md`, root ADRs 0045–0048, domain contexts, V2 architecture/UI/UX owners, Provider Processing v1/v2/v3 and active-policy-set v3, plus current source and J-01 scenario owners.
- Owner authorization and scope: after accepting Issue #86, the Owner explicitly authorized the Commander to update the PRD and affected Issues and then define one bounded next-stage development target.
- Commander scope: refresh this external requirements index and its review comment only. The refresh is not product implementation, Provider execution, dependency/plugin installation, manuscript handling, release, or `main` authority.
- Supersession: this section refreshes current PRD synthesis against Issue #86 while preserving the original publication Change Brief and historical comments unchanged.

#### Outcome and reuse
- Outcome: align the PRD's solution, affected stories, implementation/testing decisions, exclusions, and current/future boundary with exact integrated successor authority.
- Reuse: extend the existing PRD and stable story numbering; add stories 142–148 without renumbering 1–141; create no competing domain, design, policy, runtime, or test owner.
- Current implementation truth: the repository remains the provider-free `sample1` J-01 tracer described above. Successor artifact, Provider, analysis, Enrollment, metric, and Apply seams remain future work.

#### Structural Budget and consequences
- Writable tracker surface: Issue #28 body and one new review comment; affected implementation Issues are refreshed separately against the same exact baseline.
- No-change guarantees: no Issue/label grants implementation authority; no source, dependency, schema, test, policy serialization, Provider, credential, manuscript, export, release, or `main` change occurs.
- E2E: `N/A — tracker-only requirements refresh`; no new gate or proof surface.

#### Stop Conditions and lifecycle
- Stop if the refresh must choose a native artifact source/carrier/adapter, trusted production selector/Provider binding, final schema/UI mechanics, or any other deferred Owner decision.
- Keep this Issue as the current external PRD index. Preserve historical comments; add one dated refresh comment. Repository root-routing/archive work follows its own post-merge lifecycle Issue/Change Brief.

### Post-#43 implementation-stage refresh Change Brief (2026-08-28)

#### Authority Resolution
- Exact integrated baseline: `dev@064b4fb88a11ac485c5fd4b21743629a109e7b55` after #37/#100, #41/#101 and #43/#102.
- Owner authorization: the active Owner instruction requires post-merge PRD/Issue normalization, then staged continuation of all implementation work in cohesive large modules. This selects only the next dependency-ready module; it does not decide deferred carrier, platform or Provider choices.
- Canonical authority remains the exact target-qualified repository contexts, ADRs, policies, design packages and current source. This PRD remains an index.

#### Outcome and current routing
- The first large-module batch is integrated: deterministic J-01 import identity, interrupted-import continuity/reconciliation and complete J-02 bounded editing.
- Former #44 is closed as fully absorbed by #43; no duplicate editing-history Worker will be dispatched.
- Refreshed #45 is the next selected T3 product module: provider-free J-08 crash recovery and the Book Recovery Workspace, based on current SQLite v6 and #43 durability owners.
- #38, #42, #88 and #91 remain `ready-for-human` because exact native Workflow carrier, Product Data Location/macOS mechanics, native artifact source/carrier/adapter, and production Provider bindings respectively remain Owner decisions.
- Backlog briefs remain non-dispatchable until their exact base, dependencies and successor authority are refreshed at selection time.

#### Structural and authority boundary
- Tracker changes only: this refresh changes no repository source, schema, dependency, policy, Provider path, manuscript/fixture, test gate, export, release or `main` state.
- Provider setup and artifact install remain non-authorizing; new autonomous background Provider analysis still requires active Background Analysis Enrollment; imported updates remain inert until explicit adoption or an eligible Artifact Update Rule; formal agent-originated manuscript mutation retains one exact single-use AI7 Apply.
- Repository root routing and the #43 archive sweep are owned by a separate one-Issue/one-branch lifecycle change before #45 implementation starts.

#### Stop Conditions and lifecycle
- Stop if selecting the next stage would require resolving a deferred Owner decision, widening #45 beyond J-08, introducing another proof gate, or authorizing Provider/export/release/`main` activity.
- Keep this PRD current as the requirements/index surface. Historical comments and prior dated Change Briefs remain unchanged; no repository archive copy is created.


### Post-#45 implementation-stage refresh Change Brief (2026-08-28)

#### Authority Resolution

- Exact integrated baseline: `dev@76e7ee36b281464d8d44938e57d36c52c4c0e10a` after Issue #45 / PR #105.
- Owner authorization: the active Owner instruction requires post-merge PRD/Issue normalization, next-stage definition, and staged implementation in cohesive large modules. It does not authorize the Commander or a Worker to invent any deferred native-carrier, platform-data-root, artifact-source, or production-Provider choice.
- Canonical authority remains the exact target-qualified repository contexts, ADRs, policies, design packages and current source. This PRD remains an index rather than development authority.

#### Outcome and current routing

- The provider-free J-08 interrupted-manuscript Recovery Workspace is integrated and Issue #45 is closed.
- No open implementation Issue is currently `ready-for-agent`. Issue #38 is the nearest decision gateway and, once its exact native Workflow-definition carrier is Owner-selected and its brief is refreshed, is the nearest implementation candidate; it directly unlocks the remaining J-01 intake Issues #39 and #40 and later workspace/workflow work.
- Issues #42, #88 and #91 remain `ready-for-human` for Product Data Location/macOS mechanics, one exact declarative native artifact source/carrier/adapter, and trusted ordinary-production Provider binding respectively.
- No new product-Issue decomposition or Worker dispatch follows from this tracker refresh.

#### Structural and authority boundary

- Tracker changes only: this refresh changes no repository source, schema, dependency, policy, Provider path, artifact installation, manuscript/fixture, test gate, export, release or `main` state.
- Provider setup and artifact install remain non-authorizing; background Provider work requires an active Background Analysis Enrollment; imported updates remain inert until explicit adoption or an eligible Artifact Update Rule; every formal agent-originated manuscript mutation retains one exact single-use AI7 Apply.
- Repository root routing and the Issue #45 archive sweep belong to a separate one-Issue/one-branch lifecycle change.

#### Stop Conditions and lifecycle

- Stop before product dispatch until the Owner resolves #38's exact native Workflow-definition carrier and the selected implementation Issue receives a current target-qualified Change Brief.
- Keep historical sections and comments unchanged; no repository archive copy of this PRD is created.


