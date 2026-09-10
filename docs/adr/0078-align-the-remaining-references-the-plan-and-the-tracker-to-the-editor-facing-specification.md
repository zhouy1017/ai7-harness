---
status: accepted
date: 2026-09-10
deciders: Owner (chooow.yang@gmail.com)
supersedes: none
amends: ADR 0077 §8 (the clause list is extended by §1 below); the clauses named in §1; the development plan (§2); the tracker (§3)
---

# 0078 · Align the remaining design references, the development plan and the tracker to the editor-facing surface specification

## Context

[ADR 0077](./0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md) adopted [`docs/ui-ux-v2/editor-surfaces.md`](../ui-ux-v2/editor-surfaces.md) as the execution standard and named the clauses the second half of the design session changed. On 2026-09-10 the Owner merged it (PR #404, `dev@28cc1dd800cf55b17947cceb64a3bce4d81ccfef`) and directed: 「根据新设计更新对齐所有已存在文档和github issues， 如果是过时文档，处理方法是归档旧文档创建新文档，并对应更新所有仓库级指引文档如progress agent等，把所有更新放在一个PR中一次性合并。如果是更新github issues，方法是关闭旧issue（理由outdated）产生新issue，并正确确立关系，这一步直接gh操作，无须pr」.

Reading every reference against the specification found four kinds of residue. Clauses still described a per-deliverable Delivery Package and Milestone Versions for any deliverable where ADR 0077 §6 keeps 发稿, 交付 and the 图书交付包 apart. Clauses still described a Quick Start with a three-question intake, an automation projection of deferred placement, explicit-only source retention and Rewind and Replay as primary Run controls where ADR 0076 and ADR 0077 decided otherwise. Two routers, `PROGRESS.md` and the development plan, still routed renderer work to a handoff document that will never exist. The tracker's slice Issues encoded the old shapes. Under ADR 0064 the frozen references change only through an ADR that names the clause. This record makes no new product decision: every change below applies a decision ADR 0076 or ADR 0077 already records.

## Decision

### 1 · Clauses re-read or rewritten

- `docs/domain/editorial/CONTEXT.md`: Editorial Deliverable (the Manuscript and the Production Documents), Editorial Deliverable Revision, Milestone Version (a Manuscript Revision), Delivery Package (the manifest rules now belong to the Book Delivery Package alone; no per-deliverable package exists), Publication Version (over a Manuscript milestone), Maintenance Case (bound to the Publication Version and its Manuscript Revision), Correction Proposal (shown as a 修改建议).
- `UBIQUITOUS_LANGUAGE.md`: the rows Milestone Version, Delivery Package, Publication Version and Maintenance Case; the Book and deliverable relationship bullets; the qualified senses of 版本; three rows added (Production Document, Delivery Record, Book Delivery Package).
- `docs/ui-ux-v2/journeys.md`: the delivery invariant, the J-07 row of the journey map, the J-07 and J-10 reshaping notes.
- `docs/ui-ux-v2/information-architecture.md`: Milestone Versions, Publication Version, Post-designation Maintenance Cases, Delivery Package Preparation (now the 图书交付包) and Local Export and Document Representations.
- `docs/ui-ux-v2/interaction-spec.md`: the milestone table's Deliverable row, Delivery Package Preparation, the package rows of Local Export Formats and Fidelity, and Post-designation Maintenance Cases.
- `docs/ui-ux-v2/CONTEXT.md`: Delivery Package Preparation, Delivery Package Purpose, Delivery Package Manifest Preview.
- `docs/ui-ux-v2/migration-from-v1.md`: a new section `## ADR 0076 / ADR 0077 successor normalization` listing the earlier V2 assumptions that are no longer current; two Reshape rows annotated.
- `docs/ui-ux-v2/DECISION-QUEUE.md` and `docs/ui-ux-v2/HANDOFF.md`: pointers only.
- `docs/architecture-v2/ARCHITECTURE.md` (what AI7 owns; Workflow and delivery), `docs/architecture-v2/MIGRATION.md` (two rows), `docs/architecture-v2/README.md` (decision state).
- `docs/prd/ai7-v2-prd.md`: stories 44, 88, 90 and 94, the delivery implementation decision, and a dated refresh note.
- `docs/agents/project-constraints.md` (the delivery paragraph) and `docs/agents/README.md` (the Proposal, Apply, export, publication row).
- `requirements.md` is not rewritten: the specification's §0.1 already ranks residual clauses below the named ones; DPKG-001 to 015 are read as Book-level (ADR 0077 Consequences), MILE-001 to 013 as Manuscript-only (MILE-014), and the J-10 continuation family as reached from the Run's record rather than as primary controls (AUTH-010).
- `kick-in/` is interview history and is not edited (ADR 0076, ADR 0077). The Policy Documents are not edited: External Export Policy v1 stays pinned; a v2 that names a Manuscript version, a Production Document version and a 图书交付包 as export objects, and any policy for search-engine egress under `ordinary-production` (REV-010), are Owner decisions recorded as pending in `PROGRESS.md`.

### 2 · The development plan is re-cut from §11

`docs/development/development-plan.md` is replaced; the outgoing plan and the outgoing `PROGRESS.md` are archived as one node, [`docs/archive/editor-surfaces-standard-2026-09-10/`](../archive/editor-surfaces-standard-2026-09-10/INDEX.md). Phase 1 is closed service-side and its three surface halves move under the specification (S42b and S44b → S71, S18b → S69, S18c → S70). Phase 2 is the manuscript surface, review, files and delivery (B1, B2, B3, B5, B6, B14 to B17, B26 to B28 and the analysis surfaces); Phase 3 the Task Drawer and run governance (B4, B8 to B12, B13, B18, B30 and the kept S13-f1, S16, S14, S39); Phase 4 the knowledge base, evaluation and learning (B7, B19, B21 to B23 and the kept S38, S26 to S29; B20 stays with S28 and S29); Phase 5 ecosystem, dialogue and writing (S17, S34, S30, S31, S33, B29). B24 and B25 wait for the storage ADR that DSTO-013 requires. Product authority does not change; the order does, under ADR 0077 §7.

### 3 · The tracker

Slice Issues whose outcome the specification re-cut are closed as outdated with a comment naming the successor: #50 (S15) → S76, #53 (S18b and S18c) → S69 and S70, #54 (S19) → S58, S59 and S70, #55 (S20) → S58, #56 (S21) → S59, #58 (S23) → S66, #59 (S24) → S64, #60 (S25) → S65 and S68, #277 (S45) → S75, #322 (S55) → S55a. Issues whose work completed are closed as completed: #276 (S44a; S44b → S71), #304, #307, #321. New slice Issues S55a and S57 to S86 carry the specification's screen, clause IDs and §11 row; every kept slice Issue carries an alignment block naming its plan slot and what the specification changes around it; #28's phase lists are rewritten. Historical planning text stays on the closed Issues. The numbers are in the development plan.

## Consequences

- The tracker and the plan agree with the specification; a Worker reading any open slice Issue reaches the screen it implements in two links.
- `PROGRESS.md` returns to the shape the lifecycle rules require — durable status, the next slice, one Resume Prompt — with the wave-by-wave record preserved in the archive node.
- Three Owner decisions gate three slices and are recorded as such rather than assumed: the storage ADR (S85, S86), ADR 0074 amended (S70), External Export Policy v2 (S64).
- The two proposed ADRs are unchanged by this record; `PROGRESS.md` carries their evaluation against the specification.

## Rejected alternatives

- Rewriting `requirements.md` and the long references wholesale: rejected; the specification's precedence rule already subordinates residual clauses, and rewriting nearly a thousand clauses would replace an audited text with an unaudited one.
- Keeping the superseded slice Issues open with a note: rejected by the Owner's instruction; a closed Issue with a named successor is unambiguous, an open one with a note is not.
- Editing kick-in or the Policy Documents to match: rejected; the former is history, the latter are runtime records the Owner reviews byte by byte.
