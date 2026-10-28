---
status: accepted by the Owner on 2026-10-12; amended by the Owner on 2026-10-26 to allow manual per-Issue dispatch, retire mandatory cross-provider review, and require repair only when E2E or CI tests fail; amended by the Owner on 2026-10-28 to close Owner direct-merged slices by their merge record
date: 2026-10-12
deciders: Owner
---

# 0089 · Adopt Orca dispatch and value-first live-model delivery

The Owner approved this design and documentation update on 2026-10-12, tracked by [#805](https://github.com/zhouy1017/ai7-harness/issues/805), and amended it on 2026-10-26 to allow manual per-Issue coding dispatch, remove mandatory cross-provider review, and gate repair strictly on E2E and CI test failures. It replaces conflicting repository-development guidance and reorders remaining implementation around actual editorial value.

## Decision owners

- [Orca dispatch](../agents/orca-dispatch.md) is the sole current owner of repository roles, manual per-Issue or Orca wave dispatch, test-driven gate repair and wave integration.
- [Development plan](../development/development-plan.md) owns delivery order and dependencies. [PROGRESS](../../PROGRESS.md) reports current integration status.
- This ADR owns the development-test/business boundary and the target Provider decision. Runtime configuration and immutable policies continue to describe the executable capabilities of their actual selected versions.

The model/effort table is deliberately not copied here or into templates.

## Orca roles and delivery

Work may be dispatched either by the Owner manually one Issue at a time to a single coding agent, or through an Orca wave coordinator across available ChatGPT, Claude and OpenCode Go subscriptions. Mandatory cross-provider review (requiring a second agent on a different subscription channel) is retired.

The assigned coding agent implements the Issue brief, runs the applicable CI checks (`check`, `test`, `test:service`, `build`) and E2E Journeys, fixes any failing E2E or CI tests on the branch, and opens or updates the PR to the wave integration branch or `dev`. Follow-up repair or review is triggered only when E2E tests or CI tests fail. Once the required E2E and CI checks pass, the slice may merge without waiting for a cross-provider Reviewer handoff. The protected `main`/release line remains separate. Under the Owner's direct-merge authorization (Owner, 2026-10-28), a slice merged into the wave branch by a maintain/admin account without receipts is closed in the integration completion as a direct merge and verified by its merge record; the candidate's own completion and Full Gate release are unchanged.

This replaces fixed old model bindings, the optional read-only Reviewer, Worker prohibitions on creating PRs and the Commander's former monopoly on every external action. It lifts the ADR 0082 dispatch hold as the new rulebook integrates; operational dispatch still requires a verified Orca runtime; product waves require the CI adaptation of [#806](https://github.com/zhouy1017/ai7-harness/issues/806). The infrastructure bootstrap for #806 itself follows rulebook §2 and does not wait on its own completion. An unavailable runtime is a disclosed prerequisite, not permission to call a different mechanism Orca.

## Necessary live development validation

Agents may autonomously perform a necessary new AI7 development validation using the admitted Go route, protected credential broker and authorized development material. Record the question that existing evidence cannot answer, its stable validation purpose, model/contract/input class and the resulting usage/evidence. Per-item attendance or per-batch Owner approval is not required.

For identical or similar **development tests**, reuse recorded results or sanitized fixtures. Similarity chooses existing validation evidence; it does not substitute another request's model answer. Cosmetic changes, changed Run identities or renumbered test items are not a new model question. Extend the existing Ledger/Result Cache and fixture generator in [#808](https://github.com/zhouy1017/ai7-harness/issues/808), including exact request namespaces, durable pre-send claims, unknown outcomes and fixture provenance.

For **actual business**, a new user task uses the real Provider for model-dependent steps, including a user deliberately asking or generating again with the same input. Development live-once restrictions, test-family matching and caches never block or answer those tasks. Existing business continuation, explicit incremental analysis and reuse of completed steps keep their own semantics.

Repository coding agents use their subscriptions normally; their conversations are not AI7 test items. CI, Gate and ordinary automated product regression remain provider-free. No new client daily/batch/call-count ceiling is introduced. Product Run budget semantics and account-limit stopping follow [ADR 0095 §2](./0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#2-an-execution-governor-and-real-throughput): reserve explicit ceiling capacity for in-flight requests, treat a bare 429 as backoff only on a declared retryable route, and keep account-limit responses terminal; quota exhaustion does not silently switch Provider or payment source.

## Provider target and credential boundary

The first product Go target is `deepseek-v4.1-flash`. Keep DeepSeek official as an independent optional route. The Owner confirms that the service provider has permitted the intended editorial use; this is an Owner attestation, not an independently verified public-doc statement.

Production users configure their own credential and data location. The development key, protected test cache and ledgers are never inherited by ordinary production. The existing enrollment helper and credential broker remain the only path for the development secret; this document does not authorize printing, copying or committing it.

[#807](https://github.com/zhouy1017/ai7-harness/issues/807) owns model declaration, generated projections, capability evidence and policy/binding migration. V4 Flash evidence stays labeled with its actual model; it cannot establish V4.1 quality or capability. Orca's GLM allowlist creates no GLM product binding.

Current dev@afaf7465 still selects source-checkout development-ci/developer-live and Go `deepseek-v4-flash`; ordinary-production launch and several AI kinds remain unavailable. These facts are not changed by accepting this ADR. Retain runtime-pinned policy bytes and generated projections until their coherent implementation successors land; [ADR 0095 §6](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#6-one-production-policy-a-runtime-model-table-and-two-new-outbound-categories) names the single consolidating successor after which bindings inside declared protocol families are configuration records.

#807 is that coherent successor. From the `dev` commit that integrates it, active-policy-set v7 pins `developer-live` to Provider Processing v9, the direct successor of v5: exact `opencode-go/deepseek-v4.1-flash` for directly authorized baseline manuscript analysis only. Every earlier policy and active set keeps its bytes, and ordinary-production launch remains unavailable ([#811](https://github.com/zhouy1017/ai7-harness/issues/811)). This decision therefore supersedes the activation references that still name active-set v5 or developer-live v5 as current: the policy-mapping sentence of the PRD's Solution and its Provider Processing scope-map requirement; the Provider Processing and External Export target-qualified routes of the execution context; and the runtime-migration paragraphs of ADRs 0065, 0067 and 0088, with ADR 0067's statement that the #808 reuse owners are still absent. Those clauses now name v9/v7, and the [policy index](../policies/README.md) owns the current selection. Dated refresh records and frozen migration or handoff descriptions keep their recorded selections; no clause gains or loses scope, credential, export or product authority.

## Delete conflicting instructions

Remove the superseded instructions from the current tree, including duplicate archive copies. A retired document is deleted or reduced to a short replacement pointer if existing references need its path. A mixed document keeps only still-effective clauses and the replacement link. Git history carries the former normative text; do not republish it in an archive beside the new rule.

This applies to the superseded dispatch material in ADRs 0015, 0059–0061, 0063, 0068, 0069 and 0082, conflicting clauses in ADR 0064 and its consumers, and outdated attendance, production-default and development-replay clauses in ADRs 0044, 0046, 0065, 0067, 0070, 0080 and 0088. The repeated concrete role-default bindings in ADR 0041, architecture-v2/ARCHITECTURE.md and the execution context Model Role definitions are replaced with references to the current binding owner; role meaning and the single DSH topology are unchanged. The role, cadence and receipt clauses in ADRs 0027, 0049, 0050, 0057, 0058, 0062, 0075 and 0083, kick-in/05, kick-in/09, the kick-in entry router and the design-baseline normalization record are likewise removed or linked to their current owners. The scoped rules in document-lifecycle/design-authority are amended accordingly. Retained immutable runtime policy data is an implementation asset, not a repository-agent instruction.

Preserve unrelated decisions, evidence identity and product authority. The archive/readme and all active references must resolve without reintroducing deleted rules.

## Delivery and acceptance

P0 establishes Orca/CI readiness, test reuse, the V4.1 migration, existing non-web AI live tasks and a local production analysis loop. Pure model execution is not blocked on web tools or an Owner-attended combined experiment. P1 addresses measured editorial quality, cross-deliverable consistency, complex-document fidelity and the web-evidence chain. Knowledge/learning consumers follow at P2; wider orchestration, workspace and release work at P3. The plan contains the exact Issue mapping.

The current change is documentation and tracker work only: no product code, workflow, active-policy pin, credential or live Provider request changes. Its acceptance is link/directive consistency, role/effort/merge scenario walkthroughs, truthful current/target states and matching Issue dependencies. New implementation slices must independently prove their behavior.
