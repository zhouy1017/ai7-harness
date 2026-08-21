# Architecture Exploration Control Board

Status: **active**
Commander issue: [#3 — Freeze v1 design and prepare v2 architecture exploration](https://github.com/zhouy1017/ai7-harness/issues/3)
Last updated: **2026-08-21**

This file records repository-development coordination only. It is not an AI7 product workflow or a replacement for the canonical architecture.

## Freeze point

- Canonical baseline: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
- Commander branch: `docs/3-design-freeze-v2-exploration`
- Main remains canonical. Neither v1 Worker branch is approved for merge.
- No product implementation, implementation issue decomposition, pull request, merge, or release is authorized by this control run.

## Task registry

| Task | App task ID | Repository role | Branch / worktree | State | Write boundary | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| `Commander — AI7 Design Freeze` | `01a02273-a4f7-7fa1-8d66-7130f7566cd4` | Commander | `docs/3-design-freeze-v2-exploration` / `worktrees/6bbc` | `active` | Control and curation files only | Freeze audit, curated packet, integration recommendation |
| `Worker — Freeze V1 UI UX` | `01a02240-c432-7600-8fdf-008858cae447` | Worker | `docs/2-ai7-ui-ux@587d645` / `worktrees/062a` | `frozen` | Its branch only | Reviewed local V1 UI/UX reference; candidate/evidence-only assets |
| `Worker — Freeze V1 Platform and Phase 0` | `01a005a7-019f-7203-ba38-2a367a667db8` | Worker | `docs/1-windows-macos-phase0@9606891` / saved-project checkout | `frozen` | Its branch only | Reviewed local V1 platform/Q16/Phase-0 reference; Phase 0 remains NOT PASSED |
| `Architecture Reviewer — Prepare V2 Exploration` | `01a02278-cdc5-7c81-a08d-490b8b76bc26` | Reviewer | read-only `main@c8cbe26` / `worktrees/1d24` | `exploring` | No repository writes | [Round 1](./ROUND-1-REVIEW.md) and [candidate delta](./CANDIDATE-DELTA-REVIEW.md) complete; A1–A3 prepared |

The function label “Architecture Reviewer” does not create a fourth repository role. It is an independent Reviewer assignment under ADR 0015.

## Commander directives in force

1. Both v1 Workers stop after already-materialized work is cleaned, validated, independently reviewed, summarized, and locally committed.
2. Neither Worker may add a new architecture assumption, consume the other candidate branch as truth, push, open a pull request, merge, publish, or dispatch further work.
3. The Architecture Reviewer reads normalized conclusions from canonical `main`, not either legacy task history or active worktree.
4. Worker handoffs enter the review packet only after Commander audit.
5. A future v2 candidate receives an independent T3 hostile challenge before an owner decision.

## Candidate fork inputs

These inputs are material but are not canonical on this branch:

- The owner instructed the platform candidate task to revise the Windows-only target into one Windows+macOS product. This is an owner-stated candidate input, not a canonical `main` decision until integration.
- The UI/UX Worker began from the current Windows-only baseline and produced a candidate requirements/prototype line.
- The platform candidate affects packaging, local storage, credentials, IPC, sandbox claims, signing, release evidence, and UI platform conventions; it is not a runner-label edit.

The Commander must preserve both lines as candidate/evidence-only unless the owner later accepts a specific architecture change and the normal integration path promotes exact records.

## Expected freeze evidence

### UI/UX line

- **Frozen at consolidated local head `587d6455f6a578d3df8a39f534ec7a057c07a18c`; exact-head T3 Standards and Spec reviews both passed with zero findings.**
- Worktree is clean; QA scratch is outside the branch; no push, PR, merge, Figma continuation, publication, or further design expansion occurred.
- `docs/ui-ux/V1-FREEZE-HANDOFF.md` records 79 requirements, fourteen journeys, reusable state/authority semantics, Windows-specific assumptions, migration cost, unknown cross-branch conflicts, and safe-resume boundaries.
- Earlier exact-head attempts exposed successively narrower candidate-authority, Policy visibility, preferred-term, state-set, external-Figma, commit-metadata, and freeze-history findings. `587d645` corrects only those items and consolidates the unpublished Issue #2 line into one commit above `c8cbe26`; all obsolete tips are non-ancestors and recoverable through reflog.
- Reviewers `/root/consolidated_head_standards_t3` and `/root/consolidated_head_spec_t3`, both Reviewer/T3/OpenAI/`gpt-5.6-sol`/`xhigh`, reported PASS, zero findings, no post-review changes, and `same-provider review — independence reduced`. The Commander independently confirmed the exact head, merge base, one-commit history, clean worktree, clean diff check, and one-line `CLAUDE.md`.
- Worker validation reports 79/79 traceability, eleven Markdown files with valid local links, JavaScript/PowerShell parsing, clean diff checks, and browser console 0 errors / 0 warnings.

### Platform / Phase-0 line

- **Frozen at local commit `960689172bcf54eb3f27b57045a4ce4e9f20695d`; exact-head T3 Standards and Spec reviews both passed with zero findings.**
- Worktree is clean and no push, PR, merge, release, implementation, dependency, CI, or issue decomposition occurred.
- `kick-in/37-v1-platform-freeze-handoff.md` records exact accepted Q16/platform inputs, affected decisions, reusable assets, incompatibilities, migration cost, and open risks.
- The review explicitly bound to `23df3c8` failed on the Agent Data Root definition, a design-note count, and nonstandard compound ADR statuses. Corrective head `16a6ff1` fixed those items; its review found one stale `PROGRESS.md` next action. Final head `9606891` fixed only that checkpoint and passed both fresh reviewers over `c8cbe26...9606891`.
- Reviewers Aquinas (Standards) and Wegener (Spec), both Reviewer/T3/Codex/`gpt-5.6-sol`/`xhigh`, reported zero findings, no post-review changes, and `same-provider review — independence reduced`. The Commander independently confirmed the exact head, merge base, clean worktree, clean diff check, and one-line `CLAUDE.md`.
- Worker validation reports 46 Markdown files, 27 ADRs, 38 design notes, 151/151 glossary ownership, zero broken links, and no forbidden artifacts.

### Architecture review

- **First round received from a clean read-only `main@c8cbe26` worktree with the contamination boundary intact.**
- [Round 1 review](./ROUND-1-REVIEW.md) records the v1 assumptions, seven root tensions, twelve proposed principles, inheritance dispositions, a fourteen-stage exploration order, and freeze exit criteria.
- [Candidate delta review](./CANDIDATE-DELTA-REVIEW.md) confirms the root tensions/principles, refines asset disposition, and recommends A1 product consistency, A2 exact Harness composition, then A3 truthful isolation.

## Next control events

1. Commit and exact-head review the Commander's control/runbook/packet unit; do not use a mutable checkout as the packet authority.
2. Keep both candidate branches local and noncanonical; neither is a merge candidate as a whole.
3. Begin A1 one-product consistency/UI parity only as a separately dispatched read-only, noncanonical investigation using the sealed packet.
4. Follow with A2 exact Harness composition and A3 truthful isolation under the dependency order in the delta review.
5. Dispatch a separate independent T3 hostile challenge only after one coherent v2 candidate exists.

The old lines do not need to finish every originally planned document before architecture exploration can advance.
