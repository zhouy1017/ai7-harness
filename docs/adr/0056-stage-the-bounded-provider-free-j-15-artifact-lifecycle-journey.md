---
status: accepted
---

# Stage the bounded provider-free J-15 artifact lifecycle journey

On 2026-08-31 the Owner accepted Issue #155's recommended admission of Issue #88's bounded provider-free J-15 slice into the one logical E2E Functional Gate. This ADR records CI routing and executable-cutover order only. [ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) remains the sole owner of the selected declarative artifact revision, carrier, digest, bundled-local-directory adapter, disabled-first installation, exact-Book enablement, and Main Editorial Role Authority Ceiling.

## Admitted J-15 meaning

J-15 exercises only ADR 0045's bounded lifecycle: acquire the exact selected local declarative revision; inspect its identity, version, provenance, license, digest, compatibility and Authority Ceiling; validate and copy it without executing artifact code, hooks, scripts or dependencies; install it durably in disabled state; then use a second explicit action to enable that exact revision for one exact Book, retain that state across restart, and leave another Book disabled.

The Journey remains provider-free and stops without Plugin execution, generic source or catalog behavior, network acquisition, update or reconciliation, Task, Plan, Run, Session, Provider, credential, manuscript access, Enrollment, Apply, or Effect.

## Three-phase executable cutover

Immediately after this governance decision, the real executable admitted set and `e2e:all` remain J-01, J-02, J-08 and J-12. The existing disabled workflow projects dormant J-15 after J-12 and dormant J-03 after J-15; neither projection may execute or become completion evidence.

Issue #88 must supply the real J-15 runner and dispatcher and atomically add J-15 to the then-current local `e2e:all` orchestration. At that cutover, J-15 becomes real while J-03 remains dormant. Local completion and any later applicable Hosted Gate occurrence or post-boundary re-entry then execute the resulting real set.

Issue #47 later supplies the real J-03 runner and dispatcher and atomically adds J-03 to that resulting set under [ADR 0055](./0055-stage-the-bounded-provider-free-j-03-authorization-journey.md). Every report resolves the executable Journey IDs from its exact head. This ADR fixes no permanent or unconditional total.

## Preserved workflow and evidence boundaries

Exact workflow `E2E Functional Gate` (ID `342459594`) remains `disabled_manually` and unrun. This decision authorizes no enablement, dispatch, run, rerun, probe, replacement workflow, trigger, permission, concurrency, route, job identity, action pin, toolchain, matrix, bootstrap, build, or platform-topology change. [ADR 0054](./0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md)'s pre-boundary Windows-only evidence timing and truthful macOS deferral remain unchanged.

This ADR adds no product implementation, runner, dependency, schema, credential operation, Provider call, manuscript payload, release, publication, or `main` authority. Any later Journey admission still requires its own explicit Owner routing decision and separate CI-governance integration.

## Rollback and stop boundary

Before Issue #88's executable cutover, rollback reverts this governance admission and dormant workflow projection without data migration or product cleanup. Stop if J-15 cannot remain exactly ADR 0045's bounded provider-free declarative lifecycle; if it cannot enter `e2e:all` atomically with its real runner and dispatcher while J-03 remains dormant; or if the change requires a placeholder, skipped Journey, fixed total, workflow operation, or any adjacent authority.
