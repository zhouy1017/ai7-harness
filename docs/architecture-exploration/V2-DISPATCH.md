# V2 Architecture Dispatch

Status: **active, corrected A1 under final exact-head review**

This is a repository-development dispatch record, not a product architecture decision. All V2 outputs remain noncanonical until owner acceptance and normal integration.

## Exact authorities

- Canonical baseline: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
- Commander-reviewed control and sealed packet: `c383afd2fdb5f08342cde277b7babced6c1207fc`
- V2 work item: [Issue #4](https://github.com/zhouy1017/ai7-harness/issues/4)
- V2 design branch: `docs/4-v2-architecture-candidate`, created at `c383afd2fdb5f08342cde277b7babced6c1207fc`
- A1 candidate head: `80c4a6d514e351717bd35f0729c2fe7f91ded16d`, noncanonical and not yet architecture-reviewed
- Platform/Q16/Phase-0 frozen candidate: `960689172bcf54eb3f27b57045a4ce4e9f20695d`, noncanonical
- UI/UX frozen candidate: `587d6455f6a578d3df8a39f534ec7a057c07a18c`, noncanonical
- Evidence inventory: [PACKET-MANIFEST.md](./PACKET-MANIFEST.md)
- Later owner direction and external evidence: [Codex-First V2 Harness Directive](./CODEX-HARNESS-DIRECTIVE.md)
- Commander-owned owner resolution: [Clarification 0001 — Codex and DeepSeek Harness production roles](./clarifications/0001-primary-agent-harness-role.md)
- Commander-owned gap-resolution threshold: [Clarification 0002 — Codex gap closure and DeepSeek runtime re-entry](./clarifications/0002-codex-gap-closure-and-dsh-reentry.md)

## Design Worker

- App task: `AI7 V2 架构设计（Issue #4）`
- App task ID: `01a022de-f781-7d31-9a77-c3ce9ee1ce50`
- Repository role: Worker with Chief Architect responsibilities
- Task class: T3-par
- Worktree: `worktrees/1649`
- Write boundary: its Issue #4 branch only

The authoring Worker completed the five-file A1 candidate and validation, then stopped when its task sandbox could not create the external worktree `index.lock`. Before any replacement writer began, that task was idle and instructed to make no further changes. The Commander then transferred only the mechanical stage-and-commit recovery to Claude Code session `7bfa7b54-9b68-4d30-9d63-a9c3870647de`, Worker/T1, in the same branch and worktree. Requested and actual binding were both `claude-haiku-4-5-20251001` at low effort; no fallback occurred. The recovery Worker was denied content-edit tools, committed exactly the five pre-existing paths at `80c4a6d514e351717bd35f0729c2fe7f91ded16d`, reported a clean tree, and stopped. The candidate's authoring and review class remains T3-par; the T1 recovery does not lower it or authorize A2/A3.

Independent exact-head Standards and Spec review then failed `80c4a6d` on eight bounded findings: stale branch checkpoint; inaccurate commit gates and author trailer; missing exact provenance for the post-packet Codex-first directive; omitted candidate execution context, bilingual glossary, and qualifying ADR disposition required by Clarifications 0001/0002; an incomplete `UX-LEARN-006` canonical mapping and resulting disposition totals; and one false universal alias claim. Mechanical integrity otherwise passed. Both earlier Workers remain stopped. Claude Code session `e91a7cae-2a8b-49fe-a863-c788af4dd90c`, Worker/T3, now exclusively owns only the bounded correction over the five existing A1 paths plus `docs/architecture-v2/domain/execution/CONTEXT.md`, `docs/architecture-v2/GLOSSARY.md`, and `docs/architecture-v2/adr/0001-conditional-primary-agent-harness-and-gap-closure.md`. It may amend the local commit and must stop; it may not choose an owner option, consume Question 3 as decided, enter A2/A3, or alter canonical records.

That Claude Code Worker used the requested `claude-opus-5` high binding and completed successfully without fallback at amended head `92d1089c0ee278d141ec752d98c0e25c2e5a2df5`; the CLI reported `$7.298785` total and a small internal Haiku 4.5 auxiliary call in addition to the requested primary model. The branch remains exactly one commit above `c383afd`, changes exactly the eight authorized paths, and is clean. Commander mechanical verification passed 598 Markdown links, including 528 local targets and 487 anchors, plus the 79-requirement, fourteen-journey, 21-option, I-01–I-13, S60/N5/H10/E4, ten-candidate-only, table, exact-object, path-boundary, and commit-trailer checks. All Workers are stopped while renewed T3-par Standards and Spec review runs; no A2/A3 or external action is authorized.

Renewed Standards and Spec review passed every substantive and mechanical correction except two bounded record-identity defects: the README and candidate ADR wrongly attached the formal pending “Question 3” label to item 3 of the A2 technical-question list, while Commander owns Question 3 as the still-unanswered maintenance-policy choice; and Worker `PROGRESS.md` retained one stale “two exact post-packet owner objects” phrase without qualifying them as the two resolution objects. Claude Code session `f8248fbb-ebce-4b8c-9a2e-50602584bd41`, Worker/T1, now exclusively owns the mechanically specified correction in exactly those three existing paths and may amend the same local commit before stopping. It may not consume later Question 3/seam evidence into A1, alter any other content, enter A2/A3, or take external action. The candidate review floor remains T3-par.

That Haiku session used the requested `claude-haiku-4-5-20251001` low binding without fallback and closed both review findings at `c264c716bd4e59b073abeeeb77e294ad2cb341d5`; the CLI reported `$0.4359874`. Commander pre-review then found two checkpoint-only defects introduced or left in candidate `PROGRESS.md`: its Resume Prompt prematurely says “fully reviewed” before the new exact head has a verdict, and its Key Decisions line credits Haiku only for mechanical recovery rather than both recovery and final wording correction. The same stopped session is reauthorized only for those exact one-file statements and one commit amendment. No architecture content or other path may change.

The same Haiku session completed that one-file continuation without fallback at final candidate head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`; its two passes reported `$0.7211562` total. Commander verification confirms one commit above `c383afd`, exactly the same eight-path candidate diff, a clean worktree/index, `git diff --check`, 598 Markdown links with 528 local targets and 487 anchors, 79 requirements at S60/N5/H10/E4, fourteen journeys, 21 options, I-01–I-13, and ten candidate-only choices. All Workers are stopped and the exact head is ready for final T3-par Standards and Spec review.

The completed authoring turn was limited to A1 one-product consistency and UI parity: map the 79 requirements and fourteen journeys, define shared semantics versus bounded native variation, expose support/parity/accessibility/Policy-visibility options, avoid implementation mechanisms, and stop where an owner choice is required. A2 remains blocked on stable, Commander-reviewed A1 invariants, not on the owner's exact parity/support choice; that choice gates canonical product promises and the coherent candidate. A3 remains blocked on A1 and A2.

The Worker reads `PROGRESS.md` only for operational status. Inherited V1/candidate context and A1 architecture evidence are limited to the sealed packet and exact objects in its manifest. Later A2/A3 phases may collect separately Commander-authorized, exact, provenance-labeled direct evidence and probes; they still never consume another task's transcript, active worktree, or unlabeled context.

The 2026-08-21 owner directive changes the future A2 working premise from DeepSeek-only to AI7-owned, Codex-first, and DeepSeek-comparative. The current A1 turn records that supersession and the revised phase gate but does not select or implement an integration.

## Clarification protocol

When an ambiguity could change product scope, platform promises, AI7/Codex/DeepSeek ownership, the single execution authority, Policy or Effect authority, privacy/data boundaries, UI business semantics, or A2/A3 evidence scope, the Worker must not infer an answer.

First, the Worker investigates whether canonical artifacts, authorized exact source evidence, or an approved probe can answer the factual part. An evidence-answerable question is resolved in the candidate with exact provenance and does not consume owner interview time. Only a residual policy, priority, risk, or product trade-off enters the decision queue.

For each residual choice, the Worker records one entry with the exact question, why it is load-bearing, the already-explored evidence, two or three mutually exclusive options, its recommended answer, and the failure caused by leaving it vague. The Commander then uses `grill-with-docs`—one question at a time—to resolve it with the owner.

The Commander writes the exact question, answer, acceptance status, provenance, interpretation, and canonical-integration boundary into an immutable record under `docs/architecture-exploration/clarifications/`. The Worker receives an exact Commander commit and path, consumes that Git object rather than a transcript, cites it, and writes the resulting candidate `CONTEXT.md`, glossary, qualifying ADR disposition, and architecture changes on its own branch. A decision becomes an ADR only when it is hard to reverse, surprising without context, and the result of a real trade-off. Until that exact resolution is supplied, the affected design path stops while unrelated evidence work may continue.

Clarification 0001 resolves one branch now: if A2 proves Codex Harness Capability Closure, Codex is the only Primary Agent Harness and DeepSeek Harness is a Development Reference Framework with no production dependency or fallback role. It does not claim closure and does not authorize A2 before the A1 gate.

Clarification 0002 resolves the failed-closure threshold: a Codex gap is handled first through verified, costed Codex secondary development. DeepSeek may re-enter runtime comparison only when Codex lacks the exact capability and an exact DeepSeek surface proves a mature substitute; even then it requires comparison and a new owner choice, never automatic fallback. The exact Codex adapter/upstream/patch/fork form remains open.

## Hostile Reviewer

- App task: `AI7 V2 反方审查（只读）`
- App task ID: `01a022df-0d69-7173-ab31-679038c1f446`
- Repository role: independent Reviewer
- Task class: T3 for the charter only; the eventual candidate verdict must use T3-par or higher because the authoring line is T3-par
- Worktree: `worktrees/1be4`, derived from `c383afd2fdb5f08342cde277b7babced6c1207fc`
- Write boundary: none

The first turn produces only a challenge charter: candidate admission criteria, attack matrix, falsification questions, severity/evidence protocol, and a stop until a candidate exists. It must not inspect the design task or issue a V2 verdict before receiving an exact Commander review brief.

The charter turn completed read-only after verifying all 51 manifest mappings. It covers candidate admission, eighteen attack domains, domain-specific falsification questions, P0–P3 Standards/Spec finding format, contamination/no-verdict handling, and exact-head invalidation. It issued no candidate verdict and the task is stopped until a coherent candidate exists.

The future brief must name the exact base, candidate head, diff, evidence manifest, ADR disposition, trade-offs, migration direction, risks, owner choices, validation evidence, and Codex/DeepSeek disposition. A same-provider review must disclose `same-provider review — independence reduced`.

## Phase gates

1. A1 local candidate and exact-head handoff.
2. Commander review and confirmation of the stable A1 invariant list; present the platform-consistency choice to the owner.
3. A2 Codex-first agent-harness selection and composition closure may begin after step 2 even while the owner choice is pending; DeepSeek Harness remains the comparison candidate, not an automatic second runtime.
4. A3 truthful OS isolation/local authority may begin after A1 and revised A2 establish the selected executable/process/tool/network surface.
5. Record the owner platform-consistency choice before exact parity/support becomes canonical or the V2 candidate is declared coherent.
6. Coherent V2 candidate with ADR disposition, trade-offs, migration direction, risks, and evidence.
7. Independent T3-par-or-higher hostile review against the exact candidate head.
8. Owner architecture decision.
9. Separate implementation authorization, if granted.

No earlier gate implies a later one.
