# Incremental development lifecycle

This is the binding implementation loop: add one accepted outcome to the current system while preserving design intent, working behavior, and ownership boundaries.

## 1. Admit one bounded outcome

Work starts from one plan slice in the [development plan](../development/development-plan.md), one GitHub Issue carrying the one-page [Change Brief](./change-brief.md), one branch, one pull request, and one writable Worker in a fresh Task Session. Product work states one user-visible outcome or one observed defect; documentation, dependency, and repository work states one exact decision or operational outcome. Layer-only activity ("rewrite the service", "port all tests", "clean the architecture") is not an outcome.

Before dispatch the Commander resolves design authority and action authorization. T0 ambiguity, an unaccepted dependency, or a missing Owner decision stays with the Commander or Owner. A Worker starts only after verifying its Issue and Launch Receipt.

## 2. Map the existing state narrowly

Locate the current owner module, seam, configuration, persisted record, and applicable Journey; inspect direct callers and the nearest boundary above and below; note reusable code, fixtures, and adapters; note contradictions with accepted ADRs or contexts; stop when an adequate seam is found. Start with `rg` and exact symbols. A whole-repository audit needs a concrete blocking question and its own scope.

## 3. Choose the earliest adequate change

Stop at the first safe option:

1. reuse current behavior, configuration, types, APIs, or composition;
2. extend the existing owner within its responsibility;
3. make the smallest behavior-preserving local refactor that exposes a seam;
4. use an accepted framework or dependency extension seam;
5. reuse a selected predecessor asset after provenance and sanitization are recorded;
6. add a new module only for a responsibility no current owner can truthfully hold;
7. add a dependency only for an identified capability gap under the exact-pin rules;
8. request replacement authorization.

Do not add a parallel store, ledger, agent loop, scheduler, policy authority, proposal path, editor authority, provider path, or UI state owner for convenience. Deepen an existing module when moving complexity behind its interface makes the system easier to change without widening the interface.

## 4. Replacement authorization

The Commander may authorize a bounded internal replacement through a revised Change Brief when user behavior, domain ownership, public interfaces, data meaning, authority, privacy and egress, and process boundaries stay unchanged. Judge replacement by cumulative intent, not Issue size. Changing a framework, the Primary Agent Harness or generic loop, the editor foundation, process topology, storage authority, a public API, the domain data model, platform scope, dependency strategy, the capability or credential boundary, a privacy rule, or outbound-data authority is Foundation Replacement and stops for an Owner decision and, where applicable, an ADR. A replacement request states the exact seam, why extension cannot meet the outcome, preserved behavior, the cutover and rollback path, the obsolete path's deletion point, and the smallest vertical outcome that proves the new path. Big-bang rewrites need explicit Owner authorization.

## 5. Execute inside the allowed change

Change only what the outcome requires. Preserve unrelated work in the worktree. Do not rename, move, generalize, format, or clean neighboring code opportunistically. Do not widen a public interface when behavior can stay behind it. One exact dependency pin changes at a time. Keep migrations forward, bounded, and reversible where the domain contract requires it.

Treat the E2E Gate as a direct consumer: every implementation Issue records either `exact reuse — checked unchanged` or a `synchronized delta` that updates every affected runner, controller location, local `e2e:all` orchestration, hidden cross-Journey pin, and `.github/workflows/e2e.yml` projection in the same pull request. Never defer a required projection delta to a follow-up.

Stop and report `needs-commander` when the brief is wrong, the allowed change must widen, an accepted record conflicts with the implementation, an unauthorized authority, dependency, process, or schema is needed, an external outcome is ambiguous, protected material would be exposed, or the applicable Journey fails for reasons outside the authorized change.

## 6. Verify the outcome

Follow [CI and test boundaries](./ci-test-boundaries.md) and [ADR 0062](../adr/0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md). A supported feature uses its complete Journey; an observed bug adds the smallest regression at the nearest unit or service layer, and an E2E variation only when the user-visible outcome requires it; a new owner ships with its unit tests. Before Ready, product work passes the complete Local Verification Ladder at the exact rebased head on the supported Windows host (`doctor` → `bootstrap` → `check` → `test` → `test:service` → `build` → `e2e:all`), and the paired Windows and macOS Hosted Gate must then succeed before merge. A red Gate returns the pull request to Draft for local, then CI-parity, reproduction. A local result never becomes Gate evidence. Documentation-only work creates no automated proof task.

Research answers one named blocking question; a spike is allowed only when the current seams cannot answer it and has a stated exit and deletion disposition. Issue-specific probes are deleted before integration; full-fidelity debug output stays under ignored `test-results/`.

## 7. Return a finished unit

The Worker reports from its verified identity: launch-accepted binding, planned versus actual change, owners reused, any new owner and why, data, migration, and authority impact, Journey or bug outcome, cleanup, each ladder layer's outcome, unresolved matters, and one safe next action. No logs, proof artifacts, credentials, payloads, or private material. The Commander audits the report and branch, posts the Return Receipt, integrates serially, updates `PROGRESS.md` in the same or its own pull request, and runs the [archive sweep](./document-lifecycle.md) when a lifecycle node completes.

## Version iteration

Every release starts from the last integrated implementation, never a new bootstrap. Build it from independently accepted slices; keep incomplete work out of the release line rather than adding permanent flags or parallel implementations; change one dependency or Harness pin at a time with the prior pin as rollback; make data and schema migration explicit in the owning brief; a version number never authorizes destructive migration. The Initial v1.0.0 Development Milestone Boundary is the exact repository record defined by [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md); the separately authorized consolidated Windows and macOS re-entry precedes any `dev` to `main` promotion, tag, package, signing, notarization, or release action.
