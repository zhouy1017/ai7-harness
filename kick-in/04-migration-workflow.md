# Migration and Project Workflow

Status: **accepted sequence; phase contents settled by the completed interview**

## Phase 0 — Design and authority (complete on `design-doc`; canonical `main` integration pending)

Outputs:

- Accepted charter and V1 boundary.
- Repository license and source-authorization decision. Visibility is already settled: private.
- Accepted target architecture and semantic mapping.
- Keep/adapt/drop matrix with owners and deferrals.
- Security, provider, data, Windows/macOS Standalone/editor, native-adapter, and upstream strategies; Word explicitly deferred.
- First tracer-slice acceptance contract.

Completion outcome: every item in the decision map is resolved or explicitly deferred. No runtime scaffold was needed. The `design-doc` aggregate records this completed design state but does not become canonical `main` or authorize implementation by itself.

### Repository initialization ran early, by instruction

On 2026-08-17 the owner directed that the design room itself be placed under version control and published as private `zhouy1017/ai7-harness`. This ran one repository-setup action early. The proprietary license, private-source reuse authorization, and `0.1.0-rc.6` Harness baseline are now accepted design inputs. Selecting the final package subset, adding the profile/bundle skeleton and build faces, and implementing the Source Checkout Buildability Contract remain Phase 1 work that requires separate implementation authorization.

### Accepted legacy-transfer gate

The new production business store starts empty. Future implementation may provide only three narrow transfer paths: local protected API-credential transfer/re-enrollment, reviewed mock-provider evidence intake, and explicitly selected test-sample-Book intake. It must not build a general `projects.json`, Book/history, index, memory, Run/Operation, workflow, or UI-state importer. See [Legacy Data Migration Boundary](./24-legacy-data-migration-boundary.md).

## Phase 1 — Foundation bootstrap (future implementation)

The repository already exists. After separate implementation authorization, establish its source-complete development surface as setup inside the first vertical product journey, not as a standalone build issue or test result:

- Apply the [Source Checkout Buildability Contract](../docs/agents/source-checkout-buildability.md) on every declared Windows and macOS Supported Development Host.
- Pin the exact Node and selected package-manager versions; commit the root/workspace manifests and one frozen lockfile.
- Pin the exact Harness package subset, record upstream provenance and notices, and add the AI7 profile/bundle skeleton without changing Harness core.
- Provide one documented root command surface for host checking, declared-source-assisted bootstrap, host-native build, readiness/lifecycle-aware provider-free launch, and E2E execution. CI invokes that same surface rather than a CI-only build path.
- Track or derive every required source, static asset, schema, migration, default, public-synthetic fixture, license, and notice from tracked inputs and immutable declared dependencies.
- Reject predecessor or sibling checkouts, personal paths, ambient payload discovery, untracked source, pre-generated output, private material, AI7 product/provider/signing credentials, release secrets, and CI-image-only state as build inputs. Permit narrowly scoped repository/dependency-source infrastructure authentication only during checkout and bootstrap.
- Keep development and E2E Agent Data Roots outside the repository. Startup reaches an interactive empty product without a provider, API key, manuscript, or outbound product request.
- Declare and integrity-bind registry dependencies and all secondary artifacts, including lifecycle-script downloads; reconstruct any local dependency store from empty; and materialize Agent Data Root-owned runtime dependencies atomically from a verified snapshot rather than another root or global store. Provider-free/E2E launch retains the normal non-provider topology and may substitute only the deterministic model fixture, isolated data root, disabled outbound network, and non-substituting test hooks. Prepare the same root path that the one logical Windows/macOS E2E Functional Gate will use. Dependency restoration may use approved package registries and immutable artifact sources before the product no-network interval; this setup creates no separate build, package, or reproducibility gate and receives no result before the first complete journey exists.

Phase-1 sequencing state: the host matrix, pinned toolchain, lockfile, root command surface, tracked-input boundary, and provider-free empty-product launch exist on Windows and macOS. This state has no independent pass/fail record. The Source Checkout Buildability Contract is first fulfilled only when Phase 2 uses that setup to pass its complete journey through the one E2E Functional Gate on both platforms. Release signing, notarization, and final package mechanics may remain later work only when they do not block local build and launch.

## Phase 2 — Read-only vertical tracer

The retained slice is a useful first supported journey after implementation authorization: create or open one Book, import and index one public-synthetic DOCX, view it in the real windowed editor, ask one source-grounded question through the in-boundary deterministic model fixture, and return an answer whose citation resolves to an exact highlighted Manuscript Block range. It starts with the Phase-1 fresh-checkout build path and crosses the launchable renderer/main/service/Harness/domain product path. The current definition and superseded historical gate material are separated in [First tracer slice](./34-first-tracer-slice.md).

The slice must prove end to end:

- Book identity is not inferred from cwd.
- Source revision and scope are exact and durable.
- Retrieval, exact fetch, synthesis, and grounding are separate.
- The model sees only logged/reconstructable input.
- The AI7 Run Record has exact Execution Bindings to Harness Session/turn/tool event ranges without copied transcripts.
- Default profile cannot use undeclared shell/filesystem/network paths.
- The provider-free deterministic fixture remains inside the same product boundary and makes no live provider call.
- Restart/reopen reconstructs the user-visible result without hidden provider state.

Completion outcome: the complete read-only user journey passes on Windows and macOS through the one E2E Functional Gate; no document mutation, general data import, headless substitute, provider rehearsal, replay proof, or separate tracer gate is included.

## Phase 3 — Durable controlled mutation

Add proposal branches, durable approval, Effects, receipts, recovery, retry/cancel, and ambiguous-outcome fencing through the Harness tool pipeline.

Completion outcome: an applicable complete E2E journey shows that a text-changing task can propose, review, accept/reject, publish once, recover after interruption, and stop rather than silently repeat an uncertain external Effect.

## Phase 4 — Standalone product surface and professional editor

- Build one new Chinese-first editorial workbench and manuscript editor from accepted journeys through the chosen AI7 shell/client extension model; do not recreate the legacy UI or editor.
- Cover long-document Chinese editing, structure/selection fidelity, journal/checkpoint/recovery, proposals/review, source-grounded agent interaction, and import/export outcomes inside applicable complete supported E2E journeys.
- Keep one versioned local domain/Harness authority behind the desktop client.
- Re-evaluate installer, helper processes, signing, repair, and release packaging against the final Standalone topology; include no Word add-in or COM component.

Exit outcome: the one Standalone product executes canonical Task Intents and presents consistent Run/workflow/decision/Effect state plus linked Harness status on Windows and macOS. Under ADR 0027 this is exercised only through complete E2E journeys, not a separate professional-editing or platform gate.

## Phase 5 — Capability expansion

Migrate remaining task skills as vertical journeys, not a bulk manifest copy:

1. Summary, review, and writing generation.
2. Annotation and side-by-side proposal review.
3. Publication-lifecycle skills.
4. Skill authoring and managed installation after the trust boundary is proven.
5. Cross-project and Series workflows; no general legacy production-data import.

Each skill must declare its domain inputs/outputs, Harness primitives, allowed AI7 capabilities, source/privacy scope, approval rules, durable records, UI surfaces, and supported-journey or observed-bug mapping when it changes admitted behavior.

## Phase 6 — Release and upstream operations

- Pin updates enter through dedicated upstream-upgrade PRs.
- Each update retains exact pin, provenance, rollback, and applicable notices/license obligations, and runs only the applicable complete E2E journeys plus observed-bug regressions on Windows and macOS.
- AI7 never tracks an unbounded moving branch for release.
- A source fork is opened only for a documented missing seam with an upstream/contribution strategy.
- Release automation packages an accepted source state without creating same-SHA, package, signing, notarization, release-proof, or release-receipt gates.

## Work-item shape

After the PRD/issues phase, implementation work should be independently grabbable vertical slices. Every issue should name:

- User-visible outcome.
- AI7 domain owner and Harness extension point.
- Source provenance rows affected.
- Data/event/schema changes.
- Approval, privacy, and ambiguous-effect behavior.
- Supported journey ID, or the observed-bug issue and nearest complete journey, affected by the change.
- Any change to root commands, Supported Development Host prerequisites, immutable dependencies, generated inputs, or launch semantics.
- Explicit non-goals and cleanup/migration behavior.

Layer-only issues such as “port all Python” or “copy all tests” should be rejected unless they enable a complete, measurable vertical outcome.

## Repository-development orchestration

Preserve and revise original AI7's local multi-agent dispatch as a developer workflow. Its workers may inspect, implement, test, and review repository changes under explicit scoped authority and recorded handoffs. It must not become a product runtime dependency, ship as an AI7 end-user workflow, or be conflated with Harness sessions/subagents used by the product. Exact source assets and current/stale status will be recorded in a focused legacy workflow inventory before its future implementation is planned.

## Legacy test disposition

Do not migrate a legacy test because its layer or suite existed. Re-express a legacy user-visible contract only when it belongs to an accepted supported journey or an observed-bug outcome inside the nearest complete journey. Retain allowed public-synthetic fixtures only when that journey needs them. Implementation-coupled, provider-rehearsal, replay, package-proof, platform-proof, and historical/prototype tests remain reference evidence and do not become standing gates.
