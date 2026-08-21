# V2 Architecture Dispatch

Status: **active, A1 only**

This is a repository-development dispatch record, not a product architecture decision. All V2 outputs remain noncanonical until owner acceptance and normal integration.

## Exact authorities

- Canonical baseline: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
- Commander-reviewed control and sealed packet: `c383afd2fdb5f08342cde277b7babced6c1207fc`
- V2 work item: [Issue #4](https://github.com/zhouy1017/ai7-harness/issues/4)
- V2 design branch: `docs/4-v2-architecture-candidate`, created at `c383afd2fdb5f08342cde277b7babced6c1207fc`
- Platform/Q16/Phase-0 frozen candidate: `960689172bcf54eb3f27b57045a4ce4e9f20695d`, noncanonical
- UI/UX frozen candidate: `587d6455f6a578d3df8a39f534ec7a057c07a18c`, noncanonical
- Evidence inventory: [PACKET-MANIFEST.md](./PACKET-MANIFEST.md)
- Later owner direction and external evidence: [Codex-First V2 Harness Directive](./CODEX-HARNESS-DIRECTIVE.md)
- Commander-owned owner resolution: [Clarification 0001 — Codex and DeepSeek Harness production roles](./clarifications/0001-primary-agent-harness-role.md)

## Design Worker

- App task: `AI7 V2 架构设计（Issue #4）`
- App task ID: `01a022de-f781-7d31-9a77-c3ce9ee1ce50`
- Repository role: Worker with Chief Architect responsibilities
- Task class: T3-par
- Worktree: `worktrees/1649`
- Write boundary: its Issue #4 branch only

The first turn is limited to A1 one-product consistency and UI parity. It must map the 79 requirements and fourteen journeys, define shared semantics versus bounded native variation, expose support/parity/accessibility/Policy-visibility options, and stop where an owner choice is required. It may not select implementation mechanisms. A2 is blocked on stable A1 invariants, not on the owner's exact parity/support choice; that choice gates canonical product promises and the coherent candidate. A3 is blocked on A1 and A2.

The Worker reads `PROGRESS.md` only for operational status. Inherited V1/candidate context and A1 architecture evidence are limited to the sealed packet and exact objects in its manifest. Later A2/A3 phases may collect separately Commander-authorized, exact, provenance-labeled direct evidence and probes; they still never consume another task's transcript, active worktree, or unlabeled context.

The 2026-08-21 owner directive changes the future A2 working premise from DeepSeek-only to AI7-owned, Codex-first, and DeepSeek-comparative. The current A1 turn records that supersession and the revised phase gate but does not select or implement an integration.

## Clarification protocol

When an ambiguity could change product scope, platform promises, AI7/Codex/DeepSeek ownership, the single execution authority, Policy or Effect authority, privacy/data boundaries, UI business semantics, or A2/A3 evidence scope, the Worker must not infer an answer.

First, the Worker investigates whether canonical artifacts, authorized exact source evidence, or an approved probe can answer the factual part. An evidence-answerable question is resolved in the candidate with exact provenance and does not consume owner interview time. Only a residual policy, priority, risk, or product trade-off enters the decision queue.

For each residual choice, the Worker records one entry with the exact question, why it is load-bearing, the already-explored evidence, two or three mutually exclusive options, its recommended answer, and the failure caused by leaving it vague. The Commander then uses `grill-with-docs`—one question at a time—to resolve it with the owner.

The Commander writes the exact question, answer, acceptance status, provenance, interpretation, and canonical-integration boundary into an immutable record under `docs/architecture-exploration/clarifications/`. The Worker receives an exact Commander commit and path, consumes that Git object rather than a transcript, cites it, and writes the resulting candidate `CONTEXT.md`, glossary, qualifying ADR disposition, and architecture changes on its own branch. A decision becomes an ADR only when it is hard to reverse, surprising without context, and the result of a real trade-off. Until that exact resolution is supplied, the affected design path stops while unrelated evidence work may continue.

Clarification 0001 resolves one branch now: if A2 proves Codex Harness Capability Closure, Codex is the only Primary Agent Harness and DeepSeek Harness is a Development Reference Framework with no production dependency or fallback role. It does not claim closure and does not authorize A2 before the A1 gate.

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
