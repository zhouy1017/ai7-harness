# Incremental development lifecycle

This is the binding implementation and iteration loop. Its purpose is to add one accepted outcome to the current system while preserving existing design intent, working behavior, and ownership boundaries.

## 1. Admit one bounded outcome

Work starts from one GitHub Issue, one branch, one pull request, and one writable Worker. Product work states one user-visible outcome or one observed user-visible defect. Design, documentation, dependency, and repository-maintenance work states one exact decision, consumer, or repository-operational outcome. Layer-only activity such as “rewrite the service,” “modernize the editor,” “port all tests,” or “clean the architecture” is not an outcome.

Before dispatch, resolve design authority and action authorization. Ambiguous T0 work, an unaccepted candidate dependency, or a missing owner decision stays with the Commander/owner and is not dispatched.

## 2. Map the existing state narrowly

Before proposing new structure:

1. locate the current behavior, owner module, public/internal seam, configuration, persisted record, and applicable supported journey;
2. inspect direct callers and consumers plus the nearest boundary above and below;
3. identify code, configuration, fixtures, adapters, and accepted predecessor assets that can be reused;
4. note contradictions with accepted ADRs or domain definitions; and
5. stop the scan when an adequate existing seam is found.

Start with `rg` and exact symbols/terms. A full-repository audit, source archaeology, broad technology comparison, capability scoring, or exhaustive dependency exploration needs a concrete blocking question and separate scope. Familiarity is not a reason to keep reading.

## 3. Write the Change Brief

Use the [tiered template](./change-brief.md) inside the Issue/Worker brief. The brief defines a **structural budget**, not a file-count or line-count target. Name the responsibilities, modules, interfaces, schemas, dependencies, processes, authority surfaces, and journeys that may change. Everything else is a non-goal.

Editing starts only after the brief is coherent. A Worker never expands it unilaterally.

## 4. Choose the earliest adequate change

Use this order and stop at the first safe option:

1. reuse current behavior, configuration, types, APIs, or composition;
2. extend the existing owner within its current responsibility;
3. make the smallest behavior-preserving local refactor needed to expose a clean seam;
4. use an already accepted framework or dependency extension seam;
5. reuse an individually selected predecessor asset after provenance, sanitization, and applicable third-party/provider obligations are recorded;
6. add a new module only for a responsibility that no current owner can truthfully hold;
7. add a new dependency only for an identified capability gap, under the accepted exact-pin and authority rules; or
8. request Replacement Authorization.

Do not add a parallel store, ledger, agent loop, scheduler, policy authority, proposal path, editor authority, provider path, or UI state owner for convenience. Deepen an existing module when moving complexity behind its interface makes the system easier to change without widening the interface.

## 5. Replacement Authorization

### Bounded internal replacement

The Commander may authorize an internal replacement through a revised Change Brief only when user behavior, domain ownership, public interfaces, data meaning, authority, privacy/egress, and process boundaries remain unchanged.

Judge replacement by cumulative intent, not Issue size. Several bounded tickets may not be used to replace most of an owner or subsystem without Foundation Replacement authority. A Change Brief links related or preceding replacement work; replacing the whole/primary responsibility implementation, moving ownership, or participating in a known multi-step replacement plan escalates even when each individual diff appears local.

### Foundation replacement

Stop for an explicit owner decision and, when applicable, an ADR or supersession before changing any framework, Primary Agent Harness or generic loop, editor foundation, process topology, storage authority, public API, domain data model, platform scope, dependency strategy, Capability/credential boundary, privacy rule, or outbound-data authority.

Every replacement request states:

- the exact existing seam and why extension cannot safely meet the accepted outcome;
- preserved behavior and design intent;
- migration and cutover sequence;
- rollback path;
- obsolete path and its deletion point; and
- the smallest vertical outcome that proves the new path is usable.

Code unfamiliarity, personal style, a newer framework, easier generation, hypothetical testability, or adjacent cleanup is never sufficient. Prefer an incremental cutover. Temporary dual paths must have one exact removal point in the authorized work; indefinite duplicate responsibility is prohibited. Big-bang rewrites are not the default and require explicit owner authorization.

## 6. Execute inside the structural budget

- Change only what the outcome requires.
- Preserve unrelated user and agent work in the worktree.
- Do not rename, move, generalize, format, or clean neighboring code opportunistically.
- Do not widen a public interface when behavior can stay behind it.
- Do not bundle a dependency pin bump with unrelated behavior; one exact pin changes at a time.
- Keep migrations forward, bounded, and reversible where the accepted domain contract requires it.

Stop and report when the brief is wrong, the structural budget must expand, an accepted record conflicts with the implementation, an authority/dependency/process/schema not explicitly authorized by the brief is needed, an external outcome is ambiguous, protected material would be exposed, or the applicable E2E journey fails for reasons outside the authorized change.

Before the exact Initial v1.0.0 Development Milestone Boundary, [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) independently permits product integration from fresh exact-head Windows `doctor` → `bootstrap` → `build` → `e2e:all`, including for shared and macOS-native changes. This route does not depend on [ADR 0053](../adr/0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md)'s external Hosted-CI condition remaining active. When that condition is active, its workflow-state, no-run, and external-condition records apply in addition; if it resolves before the boundary, ADR 0054 remains active and the paired workflow stays disabled and unrun. The route cannot bypass a Windows product, bootstrap, build, or Journey failure or unknown. Missing macOS evidence and known macOS-only problems are disclosed and deferred rather than represented as passing. Product changes integrate one at a time from current `dev`. Independent modules may proceed in parallel only when they consume stable owners and interfaces on current `dev`. Do not silently stack downstream work on unintegrated candidate code; a genuinely necessary stacked dependency must be explicit in both Change Briefs, separately authorized, and assigned an integration order.

## 7. Research, spikes, and diagnostics

Research answers one named question blocking the current Issue. Inspect current code and accepted documents first, then exact upstream or predecessor evidence only as needed. Do not revalidate accepted design or build an evidence programme “just in case.”

A spike or prototype is allowed only when the question cannot be answered from the current seams. Its brief names the question, bounded inputs, exit condition, what may be learned, and deletion/archive disposition. It is not production structure or implementation permission.

A generic payload-safe diagnostic facility may remain when it reports only the allowlisted non-payload metadata defined by the CI boundary and is explicitly labelled non-completion. Issue-specific temporary probes stop when the concrete issue is understood and are deleted before integration unless their user-visible behavior is admitted into the one E2E Functional Gate.

## 8. Verify the user outcome

Follow [CI and test boundaries](./ci-test-boundaries.md):

- a supported feature uses its complete supported journey;
- an observed bug adds the smallest regression variation inside the nearest complete journey;
- Windows and macOS execute the same applicable journey IDs; and
- documentation/design-only changes create no automated proof task.

Development and debugging complete locally before a pull request becomes Ready. On the actual supported development host, normal work runs the repository-root `doctor` → `bootstrap` → `build` → applicable Journey sequence. Restore only existing accepted pins. Declared caches may accelerate iteration but never become correctness inputs. The final `build` validates and replaces its canonical output before the applicable Journey rerun. CI-degraded integration follows the CI boundary's stricter exact-rebased-head, every-current-executable-Journey, affected-platform, and one-at-a-time rules. The executable set remains J-01/J-02/J-08/J-12 until another separately authorized cutover; Issue #88's unresolved J-15 route may change it before Issue #47, and Issue #47 must then add real J-03 without fixing an unconditional total.

ADR 0054 temporarily replaces only that affected-platform evidence requirement before the exact Initial v1.0.0 Development Milestone Boundary: the full all-Journey sequence must pass on actual Windows at the exact rebased head, while macOS evidence is deferred without a pass claim. Every Windows failure or unknown blocks. The exception expires at the boundary; separately authorized Windows/macOS re-entry then validates consolidated `dev`, and Ready but unmerged product work rebases afterward.

The Worker reports the host, commands, and outcomes. Do not retain logs, receipts, proof artifacts, credentials, Provider payloads, private material, untracked application inputs, or personal dependency state. Do not turn local checks, temporary diagnostics, component tests, or advisory review into new standing gates.

The Hosted E2E occurrence is integration evidence rather than a debugger. A locally reproducible hosted failure returns the pull request to Draft for local repair. Only the Commander may rerun one clearly external runner/network/infrastructure transient without a code change. During exact CI-degraded operation, documentation, design, and CI-governance work follows its Change Brief's applicable local path; product work follows ADR 0053, ADR 0054's current milestone phase, and the CI boundary. The Commander records the pre-Ready and pre-merge activation facts and exact disclosure; no local result, advisory review, fake green, substitute, or single-platform run is claimed as the Gate. Before the Initial v1.0.0 Development Milestone Boundary, resolution of the external hosted condition neither ends ADR 0054 nor authorizes workflow action. After the boundary and successful re-entry, Ready but unmerged product pull requests return to the normal paired-platform lifecycle, while workflow restoration still needs separate exact authority.

## 9. Return a finished unit

The Worker/PR reports:

- planned versus actual structural change;
- existing code and assets reused;
- new responsibility introduced, if any, and why no existing owner fit;
- data/migration/authority impact;
- applicable journey or bug outcome exercised;
- cleanup performed, including any replaced path removed;
- local validation host, commands, and outcomes, without logs or proof artifacts;
- unresolved matters; and
- one safe next action.

At an archive-triggering lifecycle node, run the [document archive sweep](./document-lifecycle.md) before declaring the node complete.

## Bootstrap exception

This repository currently has no product implementation. After an architecture is accepted, integrated, and implementation is separately authorized, bootstrap is the first thinnest runnable end-to-end outcome—not a horizontal scaffold phase. It creates only the first owners the outcome actually traverses, marks them **first owner** in the Change Brief, reuses accepted framework/predecessor assets where applicable, and avoids empty packages, all-architecture skeletons, speculative capability, or “lay every layer first” work. Once a responsibility lands, every later change to it follows the normal extension-first ladder above.

Each first owner leaves one concise, code-adjacent discovery surface—package/module README, exported interface documentation, or an equivalent codebase map entry—stating its responsibility, public seam, direct dependencies, and supported journey. Do not create a speculative directory map before code exists or duplicate implementation detail across documents.

## Version iteration

Every release or version starts from the last integrated implementation; it is never a new bootstrap by default.

- Build the version from independently accepted Issue outcomes. Do not use a version boundary to justify broad cleanup, framework replacement, or rewriting unchanged features.
- Keep incomplete work out of the release line rather than creating permanent feature flags or parallel implementations without an accepted product need.
- Change one exact dependency or Harness pin at a time, retain the prior pin as the rollback point, and exercise only the applicable supported journeys and observed-bug regressions.
- Make data/schema migration explicit in each owning Change Brief. Preserve accepted data meaning and recovery behavior; a version number never authorizes destructive migration.
- When a release milestone completes, replace current progress/handoff routing and run the lifecycle archive sweep. Packaging accepted source creates no new proof programme.
- Treat the Initial v1.0.0 Development Milestone Boundary as the exact repository record defined by ADR 0054, not as package metadata, a tag, a GitHub milestone, a release, or a product-domain Milestone Version. At that boundary the temporary Windows-only evidence requirement expires; complete the separately authorized consolidated Windows/macOS re-entry before any later product integration or any `dev` to `main` promotion, tag, package, signing, notarization, publication, or release action.
