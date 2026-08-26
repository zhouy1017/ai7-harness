# V2 migration direction

Status: **accepted design-to-implementation direction; execute only through an authorized Issue and Change Brief**

Migration preserves AI7's product and domain model, **preserves and reshapes the DeepSeek Harness baseline** rather than removing it, adds the accepted Model Role bindings and provider boundary, keeps Codex material as non-runtime reference, and removes proof machinery and legacy runtime/UI assumptions. This is selective reuse, not a history merge or wholesale source copy.

## Retain

- One Chinese-first Standalone AI7 product on Windows and macOS, the exact AI7 name, professional publishing audience, Word exclusion, and the two existing Windows-specific channels.
- Book, explicit Source Version acquisition and Source Acquisition Records, Series Knowledge candidate/item/promotion/revision and versioned exclusion semantics, manuscript, revision, branch, journal, checkpoint, recovery, projection, retrieval, and Exact Fetch semantics.
- Deliverable-owned workflows and immutable Editorial Deliverable Revisions, artifacts, gates, decisions, signoffs, Milestone/Publication Versions, destination-independent delivery packages, Local Export Preparations and per-file receipts, versioned Maintenance Cases, and the seven shared phases.
- Task Intent, Execution Plan, Plan Envelope, Run Record, Task Ledger, Execution Binding, Harness Execution Span, and Resume/Retry/Redo/Replay meanings.
- Named authority, proposal-first mutation, atomic apply, Effects, receipts, ambiguity handling, privacy, credentials, provider resolution, capabilities, policies, learning lineage, and factual-verification behavior.
- **DeepSeek Harness as the one production Primary Agent Harness**, composed inside the AI7 Node service: the full composition machinery behind a narrow tool surface, the pinned exact package subset with a committed lockfile, no `@deepseek-ai/dsh` CLI aggregate, AI7-owned scheduling and concurrency, the AI7 Capability Facade, dual grant enforcement, the two ledgers, and the exclusion of generic shell, roaming filesystem, and arbitrary network tools.
- Provider-neutral Model Roles declared by Task Skills, now with the accepted DeepSeek defaults and an explicitly configurable alternative frontier binding.
- The Electron main/renderer/Node-service topology, ProseMirror bounded editor, Agent Data Root outcomes, and one provider-free E2E journey surface executed on Windows and macOS.
- Exact `SampleBooks/sample1.docx` as the standing cross-Issue compatibility baseline for manuscript-dependent supported journeys. Its discovered fidelity signals resolve truthfully through preserve or explicit initially-unselected degrade behavior; downstream modules consume imported state rather than each reparsing DOCX.
- Surface-neutral user outcomes in the A1 product-consistency and evidence-crosswalk documents. The crosswalk is historical design reference, not a gate.
- Codex material as the non-runtime **Codex Interaction Model Reference** for interaction, host-boundary, and extension-design ideas.
- Authorized predecessor code, documentation, tests, and fixtures only when an implementation task selects an asset and records its provenance, sanitization, and applicable third-party/provider obligations.

## Reshape

- Add the four accepted Model Role defaults to Provider Preflight and the Plan Envelope, and make the Frontier Model Role's alternative binding an explicit user configuration rather than an architectural variant.
- Justify every DSH default that would reach an editorial Run, replacing inherited coding presets, prompts, tool sets, and web surface with AI7-authored Agent Behavior Assets.
- Extend the Execution Binding to pin the composed DSH configuration digest and admitted plugin pins alongside the AI7 behavior composition.
- Add the plugin admission and Local Plugin Pin discipline to the existing dependency-pinning practice, using the AI7-controlled local plugin store plus committed manifest and lockfile.
- Replace import-only source assumptions with explicit Book-targeted acquisition for supported files, editor-pasted or entered material, and fully retrieved research snapshots; keep separately governed Task/evidence records distinct from Source Versions.
- Project current Series Retrieval Exclusions through both the AI7 Capability Facade and final payload gate so immutable historical bindings never remain dispatch authority after a restriction takes effect.

## Discard

- The Codex-as-production-runtime assumption: no Codex dependency, process, technical Session owner, adapter target, provider invoker, fallback, or maintained source build.
- The `@deepseek-ai/dsh` CLI aggregate and the generic shell, pwsh, terminal, and web tool packages it pulls in; the Harness `schedule`, `jobs`, and workflow packages; and every DSH default preset, prompt, coding tool, and web surface.
- Any second generic agent loop, automatic harness fallback, dual technical authority, or self-service capability escalation.
- The old Standalone and Word UI implementations, layouts, editors, monolithic renderer, and component model.
- The predecessor Python runtime, active Operation/Operation Event/`operationRuns` model, and non-allowlisted legacy production data.
- The A2 capability-closure matrix, evidence register, gap register, artifact/probe programme, exact-hash scorekeeping, and conditional proof ladder.
- Separate validation machinery: tiered/nightly workflows, exact-head review gates, unit/contract/property/coverage gates, request fingerprints, performance/security/provider/package/plugin/provenance/release-proof gates, and release receipts.
- Codex branding, Codex Desktop GUI source/layout/assets, coding presets, and generic terminal/chat surfaces.

## Rewrite

| Area | V2 disposition |
| --- | --- |
| Canonical execution context and glossary | Keep vendor-neutral business terms; keep DSH as the Primary Agent Harness; add the Codex Interaction Model Reference, the four Model Roles, Plugin Admission Snapshot, Local Plugin Pin, and Third-Party DSH Plugin. Retire Development Reference Framework and Codex Secondary Development. |
| ADR 0011 | Unchanged: keep the two-ledger decision with the Harness Session Ledger owned by the DSH session store. |
| ADR 0017 | Unchanged: full engine behind a narrow AI7 tool surface, enforced by the Capability Facade. |
| ADR 0020 | Retained and confirmed: continue consuming the pinned DSH package subset with no CLI aggregate. Extend it with the plugin admission and pinning rules from root ADR 0042. |
| ADR 0021 | Unchanged: single execution authority, one loop, AI7 scheduling, no automatic fallback. |
| ADR 0024 | Unchanged: three AI7 process roles, no TCP listener, composed Harness runtime inside the Node service. |
| ADRs 0014, 0027 and 0028 | Treat ADR 0014 as historical, ADR 0027 as the one logical Windows-and-macOS E2E functional/regression surface, and ADR 0028 as the one-product platform contract. |
| ADRs 0018, 0019, 0023, 0025 | Retain product behavior; remove their separate proof or validation gates as superseded by ADR 0027. |
| ADRs 0035–0037 | Retain explicit Book-targeted source acquisition, reviewed Series Knowledge promotion, and immediate versioned Series-retrieval restrictions as current domain/authority refinements. |
| ADRs 0038–0040 | Retain destination- and format-independent Delivery Package identity, native-OS existing-file presentation under AI7 preparation/approval/receipt authority, and exact versioned post-designation Maintenance Cases without external send/publication/recall claims. |
| ADR 0003 and provider records | Add the accepted Model Role defaults and the primary-not-exclusive provider boundary without making any model a factual authority. |
| `AGENTS.md` and `kick-in/` runtime descriptions | Preserve the DSH production and pinning language; add the Model Role defaults, Codex's reference-only role, and the plugin admission policy; remove proof-first clauses. |
| Legacy Task Skills and behavior assets | Re-express useful editorial intent as AI7-owned declarative Task Skills and AI7-authored Harness instructional skills; do not translate coding-oriented presets mechanically. |
| V2 UI/UX baseline | Retain outcomes and journey semantics; build AI7-owned screens around manuscript work, reinterpreting the Codex Interaction Model Reference at the principle level. |

## Current authorized sequence

These are sequencing directions, not validation gates.

1. **Keep the normalized `dev` baseline.** Issue #20 promoted root authority, repaired routing and status, and recorded the exact frozen-source allowlist without merging `design-doc` history.
2. **Keep immutable policy history and the current v2/v1 selection.** Provider Processing v1 remains unchanged zero-transmission predecessor history. Provider Processing v2 remains default-deny and makes only exact `sample1` local manual model-fixture recording policy-eligible under ADR 0044; it creates no implementation, configured credential or current call. External Export remains immutable v1 and makes only the exact accepted local-file Effect policy-eligible. Active-set v2 pins those exact versions and bytes.
3. **Keep the first provider-free vertical result as current implementation.** The bounded J-01 happy path begins from a fresh checkout and a runtime-generated public-synthetic DOCX, presents Review Before Import, atomically creates the Book, primary Manuscript, initial Manuscript Revision and import records, opens a bounded manuscript window, and confirms a durable Edit Journal. It uses the production-shaped Electron main, renderer, separate Node service, composed Harness/domain boundary, and one root bootstrap/build/launch/E2E command surface. It does not yet consume `SampleBooks/sample1.docx` and does not claim restart, ambiguous import outcome, every accepted branch, or full J-01.
4. **Adopt sample1 as the accepted next compatibility baseline.** Revise Issue #36 at the then-current exact `dev` so the existing provider-free journey imports exact `sample1` and truthfully preserves or discloses all discovered fidelity signals. This is a cross-Issue invariant, not one giant scenario or full-J-01 claim.
5. **Defer real recording until the model-dependent product path exists.** Immediately before any future transmission, the Commander requests human intervention to freeze the exact Provider/model/endpoint/adapter/role/prompt/budget/Credential Reference and then-current terms. Recording remains local-only, human-attended, one-call and no-fallback through the actual Harness/provider/final-egress path. Raw material stays protected outside repositories; a reviewed fixture needs another Issue and pull request.
6. **Continue only through later accepted vertical outcomes.** Task/Run/provider/model/export behavior, additional journeys, plugins and packaging each require their own current authority and bounded Issue. A plugin remains need-based under root ADR 0042. Provider Processing v2 policy eligibility grants no implementation or dispatch authority, the External Export v1 eligibility rule grants no implementation authority, and no network export is admitted.

The single logical standing E2E suite runs on Windows and macOS and grows with these complete user journeys and with regressions for observed bugs. Each platform execution starts from a fresh checkout, uses the same documented root build path, and enters its no-network product interval only after exact dependency restoration. Ordinary implementation diagnostics stop when the bug is understood; they do not become new permanent gates by default.

## Data migration

Start new business and technical stores. Do not import legacy Books, manuscripts, indexes, embeddings, memory, task/run/operation history, workflows, proposals, decisions, Effects, receipts, or UI state. The design-level legacy transfer allowlist remains limited to later user-initiated credential transfer into the new Protected Secret Store, separately reviewed mock-provider generators/fixtures, explicitly selected local-only private test sample Books, and Owner-designated Public SampleBooks admitted under root [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md). Directory placement or allowlist membership alone selects nothing. Issue #20 and the current runtime-generated public-synthetic provider-free tracer use none of these sample assets. Public SampleBooks may be tracked and used as provider-free local/hosted-CI test input; exact `sample1` additionally has [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md)'s separately governed future local recording and reviewed-fixture exception. All other real or private manuscript material remains excluded from repositories and hosted CI, and no raw recording or manuscript payload enters artifacts, logs or distributable evidence.

## Stop boundary

This document grants no action authority by itself. The Owner's current instruction separately authorizes the exact sequential baseline, policy, planning, and bounded tracer work on `dev`; every other GitHub search, plugin selection, source copy, dependency change, implementation, external action, release, or `main` promotion remains unauthorized unless separately granted.
