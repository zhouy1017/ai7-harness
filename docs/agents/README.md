# Agent document router

This is the task-oriented reading map. Root [`AGENTS.md`](../../AGENTS.md) is the universal entry. A Commander then reads [`PROGRESS.md`](../../PROGRESS.md), the [development plan](../development/development-plan.md), and the [Dispatch Register](./dispatch-register.md). A Worker or Reviewer reads `AGENTS.md`, its Issue, and its Launch Receipt. Load the smallest row below that covers the active slice; do not read another task transcript, every linked document, or the archive by default.

## Design-truth order

Resolve authority from the intended integration target, normally the current `dev` head. A record present only on a task branch, a prototype, `design-doc`, or an archive is candidate or historical material until it integrates into `dev`; that is the one place this qualifier is stated, and it applies to every design document, ADR, and Policy Document in the tree.

1. scoped Owner decision;
2. repository operating rules and their runbooks;
3. accepted ADRs, Policy Documents, and context definitions;
4. the plan slice and Issue outcome after they agree with those owners;
5. current implementation reality;
6. `PROGRESS.md` and background records;
7. explicitly labeled candidate or evidence material; and
8. exact archived history when a current record names it.

Use [design authority and action authorization](./design-authority.md) for conflicts. Authority and permission are separate: a correct design statement may still lack permission to act.

## Read by task

| Task | Read after the universal set |
| --- | --- |
| Dispatch, resume, acceptance, integration, retention | [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md); [Dispatch Register](./dispatch-register.md); the Issue's receipts |
| Any product slice | The Issue's Brief; [incremental development](./incremental-development.md); the plan slice's linked ADRs; the applicable context sections; [CI and test boundaries](./ci-test-boundaries.md) |
| Covered analysis, factual review, Run Report | [ADR 0047](../adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md), [ADR 0048](../adr/0048-enroll-and-evaluate-background-manuscript-analysis.md), [ADR 0066](../adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md); editorial `CONTEXT.md` analysis terms; `docs/ui-ux-v2/journeys.md` J-04; `src/service/analysis/` |
| Provider scope, credentials, egress, live runs | [ADR 0046](../adr/0046-separate-provider-processing-by-operational-scope.md), [ADR 0065](../adr/0065-admit-a-developer-live-provider-processing-scope.md), [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md), [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md); [`docs/policies/README.md`](../policies/README.md); execution `CONTEXT.md` Provider terms; `src/service/provider/`, `src/service/launch-policy.ts` |
| Task, plan, authorization, continuation | [ADR 0009](../adr/0009-use-authority-bearing-plan-envelopes.md), [ADR 0021](../adr/0021-single-execution-authority.md), [ADR 0034](../adr/0034-require-explicit-resume-after-interruption.md); execution `CONTEXT.md`; `docs/architecture-v2/HARNESS-INTEGRATION.md`; `src/service/task-authorization.ts` |
| Proposal, Apply, export, publication | [ADR 0007](../adr/0007-separate-decisions-authority-and-effect-proof.md), [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md), [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md); External Export Policy v1; `docs/ui-ux-v2/journeys.md` J-05 and J-07 |
| Mechanical T1 change | The short Brief; the exact named paths; the applicable formatting or Git rule |
| Bug diagnosis | Nearest Journey and Issue; the code path; [CI and test boundaries](./ci-test-boundaries.md) |
| Domain or authority change | [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md); the context; root ADRs; [domain rules](./domain.md); an Owner decision if semantics or authority change |
| Harness, dependency, pin, bootstrap, build, launch | ADRs 0020 and 0041; the Runtime section of [project constraints](./project-constraints.md); [source-checkout buildability](./source-checkout-buildability.md) |
| Git, pull request, tag, release | [Git conventions](./git-conventions.md); [issue tracker](./issue-tracker.md); [CI and test boundaries](./ci-test-boundaries.md) |
| Documentation cleanup or handoff | [document lifecycle](./document-lifecycle.md); the archive node index |
| Architecture or design fork | [design authority](./design-authority.md); [multi-session design workflow](./multi-session-design-workflow.md) |

## Current versus historical material

- Root ADRs stay at stable paths even when superseded; their status and supersession chain preserve history.
- `docs/architecture-v2/`, `docs/ui-ux-v2/`, `kick-in/`, the domain contexts, `GLOSSARY.md`, and `UBIQUITOUS_LANGUAGE.md` are frozen design references under [ADR 0064](../adr/0064-reweight-repository-development-toward-value-first-delivery.md); they change only through an ADR that names the clause.
- `PROGRESS.md` and [E2E journeys](../development/e2e-journeys.md) are the only implementation-status records.
- `docs/archive/` is historical storage excluded from default reading.

Use `rg` with `-g '!docs/archive/**'` to locate the exact symbol, term, or section the Brief names, read the owner and its direct consumers, and expand only when that scan fails.
