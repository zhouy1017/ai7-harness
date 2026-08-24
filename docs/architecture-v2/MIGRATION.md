# V2 migration direction

Status: **design-to-implementation direction; no implementation authorization**

Migration preserves AI7's product and domain model, **preserves and reshapes the DeepSeek Harness baseline** rather than removing it, adds the accepted Model Role bindings and provider boundary, keeps Codex material as non-runtime reference, and removes proof machinery and legacy runtime/UI assumptions. This is selective reuse, not a history merge or wholesale source copy.

## Retain

- The Chinese-first Windows Standalone product, exact AI7 name, professional publishing audience, Word exclusion, and two Windows channels.
- Book, Series, source, manuscript, revision, branch, journal, checkpoint, recovery, projection, retrieval, and Exact Fetch semantics.
- Deliverable-owned workflows, artifacts, gates, decisions, signoffs, delivery packages, and the seven shared phases.
- Task Intent, Execution Plan, Plan Envelope, Run Record, Task Ledger, Execution Binding, Harness Execution Span, and Resume/Retry/Redo/Replay meanings.
- Named authority, proposal-first mutation, atomic apply, Effects, receipts, ambiguity handling, privacy, credentials, provider resolution, capabilities, policies, learning lineage, and factual-verification behavior.
- **DeepSeek Harness as the one production Primary Agent Harness**, composed inside the AI7 Node service: the full composition machinery behind a narrow tool surface, the pinned exact package subset with a committed lockfile, no `@deepseek-ai/dsh` CLI aggregate, AI7-owned scheduling and concurrency, the AI7 Capability Facade, dual grant enforcement, the two ledgers, and the exclusion of generic shell, roaming filesystem, and arbitrary network tools.
- Provider-neutral Model Roles declared by Task Skills, now with the accepted DeepSeek defaults and an explicitly configurable alternative frontier binding.
- The Electron main/renderer/Node-service topology, ProseMirror bounded editor, Agent Data Root outcomes, and provider-free Windows E2E journey concept.
- Surface-neutral user outcomes in the A1 product-consistency and evidence-crosswalk documents. The crosswalk is historical design reference, not a gate.
- Codex material as the non-runtime **Codex Interaction Model Reference** for interaction, host-boundary, and extension-design ideas.
- Authorized predecessor code, documentation, tests, and fixtures only when an implementation task selects an asset and records its provenance, sanitization, and applicable third-party/provider obligations.

## Reshape

- Add the four accepted Model Role defaults to Provider Preflight and the Plan Envelope, and make the Frontier Model Role's alternative binding an explicit user configuration rather than an architectural variant.
- Justify every DSH default that would reach an editorial Run, replacing inherited coding presets, prompts, tool sets, and web surface with AI7-authored Agent Behavior Assets.
- Extend the Execution Binding to pin the composed DSH configuration digest and admitted plugin pins alongside the AI7 behavior composition.
- Add the plugin admission and Local Plugin Pin discipline to the existing dependency-pinning practice, using the AI7-controlled local plugin store plus committed manifest and lockfile.

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
| ADR 0020 | Retained and confirmed: continue consuming the pinned DSH package subset with no CLI aggregate. Extend it with the plugin admission and pinning rules from candidate ADR 0002. |
| ADR 0021 | Unchanged: single execution authority, one loop, AI7 scheduling, no automatic fallback. |
| ADR 0024 | Unchanged: three AI7 process roles, no TCP listener, composed Harness runtime inside the Node service. |
| ADRs 0014 and 0027 | Treat ADR 0027 as current: one Windows E2E functional/regression surface only. |
| ADRs 0018, 0019, 0023, 0025 | Retain product behavior; remove their separate proof or validation gates as superseded by ADR 0027. |
| ADR 0003 and provider records | Add the accepted Model Role defaults and the primary-not-exclusive provider boundary without making any model a factual authority. |
| `AGENTS.md` and `kick-in/` runtime descriptions | Preserve the DSH production and pinning language; add the Model Role defaults, Codex's reference-only role, and the plugin admission policy; remove proof-first clauses. |
| Legacy Task Skills and behavior assets | Re-express useful editorial intent as AI7-owned declarative Task Skills and AI7-authored Harness instructional skills; do not translate coding-oriented presets mechanically. |
| UI/UX candidate | Retain outcomes and journey semantics; design new AI7-owned screens around manuscript work, reinterpreting the Codex Interaction Model Reference at the principle level. |

## Staged direction after authorization

These are sequencing directions, not validation gates.

1. **Integrate the decision records.** After owner acceptance, update canonical context, glossary, ADRs, standing instructions, and design notes through the Commander path.
2. **Establish the offline product spine.** Build the Electron shell, renderer, Node service, local stores, bounded editor, journal/recovery, and typed IPC without requiring the harness or a provider at startup.
3. **Establish business execution.** Implement Task/Run records, Plan Envelopes, scheduling and budget governance, provider and credential brokers, capability grants, Effect handling, and the two-ledger binding against a provider-free test double used by the Windows journey.
4. **Compose the harness.** Select and pin the exact DSH package subset with a committed lockfile, implement `PrimaryAgentHarness`, disable inherited defaults, expose only editorial capabilities, and connect technical spans without copying transcripts.
5. **Bind the Model Roles.** Wire Provider Preflight to the accepted DeepSeek defaults, add the explicit alternative frontier configuration, and place the Provider Payload/Egress Gate before every transmission.
6. **Complete vertical user journeys.** Add import/edit/recovery, task-to-proposal, proposal apply, factual review with Exact Fetch, workflow delivery, concurrency/continuation, and learning/feedback as coherent end-to-end slices.
7. **Admit a plugin only if a need appears.** If and only if an identified capability or composition need has no adequate AI7-owned or DSH-seam answer, take a Plugin Admission Snapshot, record a Local Plugin Pin, and ship the change through reviewed deployment composition.
8. **Package both Windows channels.** Produce zip-portable and NSIS outcomes from one source while keeping data, plugin store, and secrets in their accepted locations.

The single standing CI suite grows with these complete user journeys and with regressions for observed bugs. Ordinary implementation diagnostics stop when the bug is understood; they do not become new permanent gates by default.

## Data migration

Start new business and technical stores. Do not import legacy Books, manuscripts, indexes, embeddings, memory, task/run/operation history, workflows, proposals, decisions, Effects, receipts, or UI state. The only allowed transfers remain user-initiated API credential transfer into the new Protected Secret Store, reviewed mock-provider material needed by the provider-free journey, and explicitly selected test-only sample Books. Manuscript restrictions remain absolute.

## Stop boundary

This document authorizes no GitHub search, plugin selection, source copy, dependency installation, package pin, scaffolding, implementation issue, test infrastructure, merge, push, pull request, or release.
