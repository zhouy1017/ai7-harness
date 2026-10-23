# Agent document router

Read root [AGENTS](../../AGENTS.md), then the assigned Issue. Repository execution always loads [Orca dispatch](orca-dispatch.md); the Commander also reads [PROGRESS](../../PROGRESS.md), the [development plan](../development/development-plan.md) and the [Dispatch Register](dispatch-register.md). Load the smallest task row below.

## Design authority

Resolve records at the intended integration target. `dev` is the canonical implementation-facing line; a task branch, prototype, frozen `design-doc` source or archive remains candidate or historical material until its accepted change integrates. [Design authority](design-authority.md) owns the precedence and action-authorization rules.

## Read by task

| Task | Read after the entry set |
| --- | --- |
| Dispatch, handoff, review, merge, retention | [Orca dispatch](orca-dispatch.md); [Dispatch Register](dispatch-register.md) |
| Any product slice | Issue brief; [incremental development](incremental-development.md); linked ADRs and context sections; [CI and test boundaries](ci-test-boundaries.md) |
| Editor-facing surface, label or flow | [Editor surfaces](../ui-ux-v2/editor-surfaces.md), the screen's section and clause IDs; [ADR 0077](../adr/0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md); [ADR 0096](../adr/0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md) for structure editing, recognition and ceremony; named clauses in [requirements](../ui-ux-v2/requirements.md) |
| Procedure, stage, governor, idle lane, harness tools or review contract | [ADR 0095](../adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md); execution CONTEXT procedure and enrollment terms; `src/service/analysis/kind-definition.ts`, `execution.ts`, `src/service/harness/primary-agent-harness.ts` |
| Covered analysis, factual review, Run Report | ADRs [0047](../adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md), [0048](../adr/0048-enroll-and-evaluate-background-manuscript-analysis.md), [0066](../adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md), [0095 §5](../adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#5-review-contract-v2-evidence-on-the-card-and-the-derived-report); editorial CONTEXT analysis terms; J-04; `src/service/analysis/` |
| Provider scope, credentials, egress or live tests | [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md); [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md); [policy selection](../policies/README.md); execution CONTEXT Provider terms; `src/service/provider/`, `src/service/launch-policy.ts` |
| Provider route, model profile or credential slot | [Provider support](../development/provider-support.md) |
| Task, plan, authorization or continuation | ADRs [0009](../adr/0009-use-authority-bearing-plan-envelopes.md), [0021](../adr/0021-single-execution-authority.md), [0034](../adr/0034-require-explicit-resume-after-interruption.md), [0095 §2–3](../adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md); execution CONTEXT; [Harness integration](../architecture-v2/HARNESS-INTEGRATION.md); `src/service/task-authorization.ts` |
| Proposal, Apply, export or publication | ADRs [0007](../adr/0007-separate-decisions-authority-and-effect-proof.md), [0038](../adr/0038-separate-delivery-package-identity-from-local-export.md), [0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md); selected [export policy](../policies/README.md); J-05/J-07; [editor surfaces](../ui-ux-v2/editor-surfaces.md) sections 1, 7 and 9 |
| Mechanical documentation edit | Bounded brief; named paths; applicable formatting or Git rule |
| Local Verification Ladder or Electron Journey | [CI and test boundaries](ci-test-boundaries.md), Where the ladder runs; [ADR 0083](../adr/0083-run-every-agent-s-electron-journeys-on-the-background-test-guests.md) |
| Bug diagnosis | Nearest Journey and Issue; code path; [CI and test boundaries](ci-test-boundaries.md) |
| Domain or authority change | [CONTEXT-MAP](../../CONTEXT-MAP.md); context owner; root ADRs; [domain rules](domain.md); scoped Owner decision |
| Harness, dependency, pin, bootstrap, build or launch | ADRs 0020 and 0041; Runtime section of [project constraints](project-constraints.md); [source-checkout buildability](source-checkout-buildability.md) |
| Git, pull request, tag or release | [Git conventions](git-conventions.md); [issue tracker](issue-tracker.md); [CI and test boundaries](ci-test-boundaries.md); [nightly packages and Windows releases](../adr/0093-automate-nightly-packages-and-windows-version-tag-releases.md); [version identity](../development/versioning.md) |
| Documentation cleanup or handoff | [Document lifecycle](document-lifecycle.md) |
| Architecture or design fork | [Design authority](design-authority.md); [multi-session design workflow](multi-session-design-workflow.md) |

## Current and historical material

Frozen architecture/UI references, kick-in, contexts and glossary indexes change only through an ADR naming affected clauses. Current rules contain only applicable instructions; obsolete conflicting prose is removed under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), with Git retaining history. [PROGRESS](../../PROGRESS.md) and [E2E journeys](../development/e2e-journeys.md) own implementation status. Archives are excluded from default search and reading.

Use `rg -g '!docs/archive/**'` to locate exact symbols or clauses, read their owner and direct consumers, and expand only when that scan fails.
