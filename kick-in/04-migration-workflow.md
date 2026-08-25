# Migration and Project Workflow

Status: **accepted sequence; platform-dependent Phase 0 contents reopened by ADR 0027**

## Phase 0 — Design and authority (reopened by the 2026-08-21 platform revision)

Outputs:

- Accepted charter and V1 boundary.
- Repository license and source-authorization decision. Visibility is already settled: private.
- Accepted target architecture and semantic mapping.
- Keep/adapt/drop matrix with owners and deferrals.
- Security, provider, data, Windows-and-macOS Standalone/editor, and upstream strategies; Word explicitly deferred.
- First tracer-slice acceptance contract.

Exit gate: every interview item and every later owner revision is resolved or explicitly deferred, including the post-interview platform blockers in note 35 and the Harness baseline audit in note 36. The required evidence checks pass, but no runtime scaffold is needed or authorized to pass this gate.

### Repository initialization ran early, by instruction

On 2026-08-17 the owner directed that the design room itself be placed under version control and published as private `zhouy1017/ai7-harness`. Repository visibility, proprietary licensing, predecessor reuse authority, and the intended Harness package baseline are now resolved design facts. Product scaffolding, profile/bundle composition, dependencies, build faces, and CI remain future implementation and are not authorized. On 2026-08-21 the owner expanded the target to Windows and macOS, reopening only the platform-dependent Phase 0 decisions listed in the [current exit review](./36-phase-0-exit-review.md).

### Accepted legacy-transfer gate

The new production business store starts empty. Future implementation may provide only three narrow transfer paths: local protected API-credential transfer/re-enrollment, reviewed mock-provider evidence intake, and explicitly selected test-sample-Book intake. It must not build a general `projects.json`, Book/history, index, memory, Run/Operation, workflow, or UI-state importer. See [Legacy Data Migration Boundary](./24-legacy-data-migration-boundary.md).

## Phase 1 — Foundation bootstrap (future implementation)

- Work only after explicit implementation authorization; repository creation and licensing are already complete.
- Install the accepted exact Harness package family only after the mandatory `rc.5` to `rc.6` delta and two-platform package-closure audit; record upstream SHA/notices.
- Add the AI7 profile/bundle skeleton without changing Harness core.
- Establish Host/Client build faces, domain boundary packages, the provenance ledger, and only the verification machinery accepted at the Phase 0 exit; the Test Catalog remains trigger-deferred.
- Establish the two accepted workflow names, `pr` and `release`, with the smallest accepted Windows/macOS evidence topology, plus the reviewed and regenerated mock-LLM-provider corpus, before behavior migration.
- Dump and snapshot the effective Cordis configuration so upgrades cannot silently change capability exposure.

Exit gate: an empty AI7 composition boots deterministically, has no manuscript data, exposes only its declared capabilities, and can be upgraded/reverted by changing one pin.

## Phase 2 — Read-only vertical tracer

**Accepted at Question 35**, and preceded by a throwaway store-and-index spike. The slice: create or open one Book, import and index one synthetic DOCX, view it in the real windowed editor, ask one source-grounded question, and return an answer whose citation resolves to an exact highlighted Manuscript Block range — through a real Harness model adapter plus a deterministic replay adapter. The full definition and thirteen-point exit gate are in [First tracer slice and exit gate](./34-first-tracer-slice.md).

The slice must prove end to end:

- Book identity is not inferred from cwd.
- Source revision and scope are exact and durable.
- Retrieval, exact fetch, synthesis, and grounding are separate.
- The model sees only logged/reconstructable input.
- The AI7 Run Record has exact Execution Bindings to Harness Session/turn/tool event ranges without copied transcripts.
- Default profile cannot use undeclared shell/filesystem/network paths.
- Replay fixture and a real-provider rehearsal share the same contracts.
- Restart/reopen reconstructs the user-visible result without hidden provider state.

Exit gate: behavior passes at the highest useful seam; no document mutation or general data import is included.

## Phase 3 — Durable controlled mutation

Add proposal branches, durable approval, Effects, receipts, recovery, retry/cancel, and ambiguous-outcome fencing through the Harness tool pipeline.

Exit gate: a text-changing task can propose, review, accept/reject, publish once, recover after interruption, and prove that an uncertain external effect is never silently repeated.

## Phase 4 — Standalone product surface and professional editor

- Build one new Chinese-first editorial workbench and manuscript editor from accepted journeys through the chosen AI7 shell/client extension model; do not recreate the legacy UI or editor.
- Prove long-document Chinese editing, structure/selection fidelity, journal/checkpoint/recovery, proposals/review, source-grounded agent interaction, and import/export outcomes through the Standalone Editing Sufficiency Gate.
- Keep one versioned local domain/Harness authority behind the desktop client.
- Implement only the Windows and macOS helper-process, data, packaging, signing, repair, and release mechanics accepted at the Phase 0 exit, and honor every explicit deferral; include no Word add-in or COM component.

Exit gate: Standalone satisfies the professional-editing and cross-platform consistency gates, executes canonical Task Intents, and presents consistent Run/workflow/decision/Effect state plus linked Harness status on clean supported Windows and macOS machines.

## Phase 5 — Capability expansion

Migrate remaining task skills as vertical journeys, not a bulk manifest copy:

1. Summary, review, and writing generation.
2. Annotation and side-by-side proposal review.
3. Publication-lifecycle skills.
4. Skill authoring and managed installation after the trust boundary is proven.
5. Cross-project and Series workflows; no general legacy production-data import.

Each skill must declare its domain inputs/outputs, Harness primitives, allowed AI7 capabilities, source/privacy scope, approval rules, durable records, UI surfaces, and verification evidence.

## Phase 6 — Release and upstream operations

- Pin updates enter through dedicated upstream-upgrade PRs.
- Each update compares the package/API surface, effective config dump, session format, security defaults, notices/licenses, and AI7 behavioral journeys.
- AI7 never tracks an unbounded moving branch for release.
- A source fork is opened only for a documented missing seam with an upstream/contribution strategy.
- Release evidence is produced from the same exact commit as the packaged artifacts.

## Work-item shape

Only after explicit owner authorization to create a PRD/issues phase, implementation work should be divided into independently grabbable vertical slices. Every issue should name:

- User-visible outcome.
- AI7 domain owner and Harness extension point.
- Source provenance rows affected.
- Data/event/schema changes.
- Approval, privacy, and ambiguous-effect behavior.
- RED evidence and the highest useful GREEN test seam.
- Explicit non-goals and cleanup/migration behavior.

Layer-only issues such as “port all Python” or “copy all tests” should be rejected unless they enable a complete, measurable vertical outcome.

## Repository-development orchestration

Preserve and revise original AI7's local multi-agent dispatch as a developer workflow. Its workers may inspect, implement, test, and review repository changes under explicit scoped authority and recorded handoffs. It must not become a product runtime dependency, ship as an AI7 end-user workflow, or be conflated with Harness sessions/subagents used by the product. Exact source assets and current/stale status will be recorded in a focused legacy workflow inventory before its future implementation is planned.

## Legacy test classification

Before migrating any test, classify it:

| Class | Action |
| --- | --- |
| Product behavior contract | Re-express against the new public seam. |
| Safety/idempotency contract | Preserve early; it gates effects and data. |
| Compatibility fixture | Keep only when it belongs to the accepted mock-evidence/test-Book transfer allowlist or proves a future new-AI7 compatibility contract. |
| Platform proof | Run on the real supported host; mocks supplement but do not replace it. |
| Implementation-coupled oracle | Rewrite or drop; do not freeze old module/file shape. |
| Historical/prototype evidence | Archive and link; do not run as a gate. |
