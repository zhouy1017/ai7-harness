# AI7 development plan

Status: **Owner-accepted delivery order under [ADR 0064](../adr/0064-reweight-repository-development-toward-value-first-delivery.md), written on `dev@4c50ce31b0f15ff2bfadd2af17fc914c317e0f22` on 2026-09-06.** This file is the only place the order lives. Root [`PROGRESS.md`](../../PROGRESS.md) names the next slice; every slice Issue carries its plan slot. The order changes only through a Commander pull request that edits this file and states the reason; a change that alters product authority also needs an ADR.

## Why this order

The prompt-only review practice of 2026-09-06 delivered what an editor pays for in one session: extract every unit, cross-check across the whole book, verify claims against institutional sources, sample the result adversarially, and render deliverables. AI7 already has the extract stage and the record model on synthetic fixtures. Phase 1 completes that pipeline on real model output; Phase 2 turns findings into applied corrections and exported files; only then do run governance, learning, and ecosystem slices follow, because they govern Runs that will by then exist.

## How an agent executes this plan

1. The Commander reads `PROGRESS.md`, takes the next slice from the phase tables below, and opens its Issue.
2. The Commander writes the one-page Brief on the then-current `dev` head in the form of [`docs/agents/change-brief.md`](../agents/change-brief.md), reusing the slice detail below, labels the Issue `ready-for-agent`, and dispatches one fresh Task Session under [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) with the class binding in the table.
3. The Worker runs the Local Verification Ladder at the exact head; the Commander posts the schema-v5 Return Receipt, pushes, marks the pull request Ready, waits for the paired Gate, squash-merges, updates `PROGRESS.md` in the same or its own pull request, and marks the slice `integrated` here.
4. A slice that exposes a design gap stops `needs-commander`; the Commander records the gap in `PROGRESS.md`, writes an ADR if authority changes, and edits this plan.
5. Slices marked `Owner confirmation` are not dispatched until the Owner confirms them in writing when they are reached.

Product integration stays serial. Slices in different phases never run in parallel; two slices in the same phase may run in parallel only when the table shows no dependency between them and they touch different owners.

## Phase 0 — in flight

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.1 | S13 | #48 | T3 | J-04 | Plan Revision on material drift and the `safe-retry` in-envelope adaptation on the executing analysis Task | — | integrated (PR #280, `dev@f417e50`) |

## Phase 1 — real analysis loop on `sample1`

Exit criterion: one `developer-live` Run on exact `sample1` produces unit results, model-driven cross-unit findings, sourced factual findings, a sampled assurance estimate, and a Run Report; fixtures generated from that Run replay the same path in J-04; the Owner has read at least one Run Report and its findings.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | S40 | #272 | T3 | J-04 | `developer-live` scope: Provider Processing v4, active set v4, trusted launch form, per-unit Session, required ceiling, `deepseek-v4-flash` through the `opencode-go` route, the ADR 0067 enrollment helper, Provider Test Ledger and Result Cache, quota classification, Egress Gate `transmit-remote` | S13 | planned |
| 1.2 | S41 | #273 | T2 | J-04 | Fixture generation from the Provider Result Cache with echo checks; content-digest resolution for unit and service tests | S40 | planned |
| 1.3 | S42 | #274 | T3 | J-04 | Baseline Cross-Unit Reduction Contract v1 over topic-reorganized unit results; `reducer`-lineage findings | S40 | planned |
| 1.4 | S18 | #53 | T3 | J-04 | Factual review: assertion markers, Factual Review Contract v1, research capability with a per-Run search budget and institutional-source list, independent Reference Integrity / Claim Support / Factual Verification, the ADR 0066 finding record | S40 | planned |
| 1.5 | S19 | #54 | T3 | J-04 | `保存为来源材料` research snapshot into a Book-owned Source Version; exact-revision Correction Proposal from a finding | S18 | planned |
| 1.6 | S43 | #275 | T2 | J-04 | Assurance sampling over cross-unit and factual findings feeding the assurance axis | S42, S18 | planned |
| 1.7 | S44 | #276 | T2 | J-04 | Durable Run Report linked from the Task Outcome | S43 | planned |

### Slice detail

**S40 (#272).** Extend `src/service/launch-policy.ts`, the policy directory, `src/service/provider/egress-gate.ts`, `credential-broker.ts`, `deepseek-adapter.ts`, `src/service/harness/primary-agent-harness.ts` (one Session per unit), `src/service/analysis/execution.ts` (ceiling enforcement before dispatch), and the `deepseek-v4-pro` literals in the ledger CHECKs, `src/shared/protocol.ts`, `src/main/application.ts`, and the J-03, J-12, and J-04 runner pins. Add route `opencode-go` (`https://opencode.ai/zen/go/v1/chat/completions`, Bearer key from the Protected Secret Store) beside the production route, `tools/enroll-dev-credential.mjs` as the only reader of the Owner's key file, and the Provider Test Ledger and Result Cache in the host-level cache root outside every checkout, so an identical request replays and a repeated test item is refused (ADR 0067). Only admitted Public SampleBooks are transmittable. J-04 stays on the deterministic route; a service suite proves the v4 gate decision and the ceiling refusal with a stub transport. No socket in any test.

**S41 (#273).** New tool `tools/generate-model-fixture.mjs --from-cache` reading the ADR 0067 cache and ledger; extend `src/service/provider/model-fixture.ts` with a `content-digest` resolution mode used only under `tests/`. Existing fixtures untouched. A generated fixture enters the repository only after human review of every free-text field, recorded in the closure.

**S42 (#274).** New contract module beside `contract.ts`; extend `reducers.ts`, `execution.ts`, `result-set-schema.ts`, the protocol projections, the Overview, and J-04 with one fixture-driven cross-unit finding. Topic axes split by topic when they exceed one unit budget. Deterministic conflict kinds stay as a pre-filter.

**S18 (#53).** New Task kind `factual-review` on the same real path (Task Intent through Result Set Revision). New contract module for assertion listing and verdicts. New owner `src/service/capabilities/research.ts`: under `development-ci` it replays research fixtures, under `developer-live` it fetches through the capability facade with the Plan Envelope's search budget (allocated by severity tier) and a curated institutional-source list that includes Chinese historical sources. Reference Integrity is verified deterministically against block text; Claim Support and Factual Verification are model-judged and shown independently. Findings use the ADR 0066 record shape; conflicts and unresolved evidence are preserved; `回到稿件范围` returns to the exact range. J-04 gains fixture-driven factual stages. Non-goals: source retention, proposals, Series.

**S19 (#54).** `保存为来源材料` commits a retention-permitted research snapshot into a Book-owned Source Version with a Source Acquisition Record (ADR 0035); a finding offers `提出更正提议`, which creates an exact-revision Correction Proposal on a Proposal Branch without applying it. J-04 asserts both. Non-goals: Proposal Decision and Apply (Phase 2).

**S43 (#275)** and **S44 (#276)** are specified in their Issues.

## Phase 2 — from proposal to delivered files

Exit criterion: an editor decides a Correction Proposal, applies it through one single-use AI7 Apply with a verified Effect Receipt, and exports the manuscript with its findings to local files through native collision handling.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2.1 | S20 | #55 | T3 | J-05 | Review and decide persistent Proposal Change Items without applying | S19 | planned |
| 2.2 | S21 | #56 | T3 | J-05 | Single-use AI7 Apply with drift recheck and Effect Receipt | S20 | planned |
| 2.3 | S23 | #58 | T2 | J-07 | Destination-independent Delivery Package over an exact revision | S21 | planned |
| 2.4 | S24 | #59 | T3 | J-07 | Local file export with per-file preparation, approval, atomic commit, and receipt; deliverable forms include the annotated DOCX and a findings ledger | S23 | Owner confirmation |
| 2.5 | S22 | #57 | T3 | J-06 | Same-block and structural conflicts resolved all-or-none | S21 | planned |

## Phase 3 — run governance

Exit criterion: a Run starts in one action, survives interruption with explicit `续行`, honors budgets and account limits, and two Books run concurrently without focus or scope leakage.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 | S45 | #277 | T2 | J-03 | Quick Start and Default Execution Rule with a three-question intake | Phase 2 | planned |
| 3.2 | S15 | #50 | T3 | J-10 | Resume, Retry, Rewind, Redo, Replay with per-unit incremental persistence and the Run Continuation Checkpoint | S13 | planned |
| 3.2a | S13-f1 | #281 | T2 | J-04 | Read every material plan field from durable state; revert path and durable supersession for pending Plan Revisions; settle the dead `inspect` trigger kind (advisory review of #48) | S13 | planned |
| 3.3 | S13b | new | T3 | J-04 | Restart-safe Clarification Requests with choice-first answers (prompt contract v2) | S15 | Issue opened when reached |
| 3.4 | S16 | #51 | T2 | J-10 | Run Budget Ceiling termination, Provider Account Limit recovery, ambiguous outcomes | S15 | planned |
| 3.5 | S14 | #49 | T3 | J-09 | Concurrent Book work without focus or scope leakage | S16 | planned |
| 3.6 | S39 | #95 | T3 | J-09 | Background Analysis Enrollment and revocation | S14 | planned |

## Phase 4 — learning and knowledge

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 | S38 | #94 | T2 | J-11 | Analysis feedback Quality Signals and the versioned Analysis Quality Metric | S44 | planned |
| 4.2 | S26 | #61 | T3 | J-11 | Optional feedback capture and Book-first learning eligibility | S38 | planned |
| 4.3 | S27 | #62 | T3 | J-11 | Learning Lineage, exclusion, remediation | S26 | planned |
| 4.4 | S28 | #63 | T3 | J-13 | Series membership and versioned Series Knowledge promotion | Phase 2 | planned |
| 4.5 | S29 | #64 | T3 | J-13 | Series and Cross-project scope pins and immediate retrieval exclusions | S28, S18 | planned |

## Phase 5 — ecosystem and dialogue

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5.1 | S17 | #52 | T3 | J-16 | Interactive Editorial Dialogue streaming without authority mutation | Phase 3 | planned |
| 5.2 | S34 | #90 | T3 | J-16 | Book-bound DSH Agent Workspace | S17 | planned |
| 5.3 | S30 | #65 | T3 | J-15 | Capture and govern a reusable procedure candidate | S45 | planned |
| 5.4 | S31 | #66 | T3 | J-15 | Resolve, pin, reuse, and retire exact procedure versions | S30 | planned |
| 5.5 | S33 | #89 | T2 | J-15 | Reconcile and adopt foreign Skill updates | S31 | planned |
| 5.6 | S25 | #60 | T3 | J-07 | Publication Versions and Maintenance Cases | S24 | Owner confirmation |

## Recording under ADR 0044

The human-attended `sample1` recording is scheduled after the Phase 1 exit criterion, when the unit, cross-unit, and factual contracts have stopped changing. Its sequence is: an ADR for the `fixture-recording` policy successor (transmissions equal to the frozen unit count, per-unit Sessions, the development-interval binding), the recording Issue, and the admission Issue. Until then every fixture comes from S41 generation or hand-writing, and no recording Issue is opened.

## Deferred and out of scope

Packaging, signing, notarization, release, `dev` to `main` promotion, Word integration, additional platforms, private manuscripts in any development scope, and the self-hosted Gate remain outside this plan and need their own Owner decisions.
