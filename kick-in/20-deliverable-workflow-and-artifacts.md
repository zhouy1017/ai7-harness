# Deliverable Workflow and Editorial Artifact Boundary

Status: **accepted in Question 19**

## Recommendation

Preserve original AI7's durable lifecycle records, evidence-linked gates, typed editorial artifacts, human signoff, and narrow authoritative commands, but do not inherit one fixed Book-wide eleven-stage state machine. Keep the accepted **Book** as the source, privacy, and mutation authority; give each Book-owned **Editorial Deliverable** its own versioned **Workflow Profile** and revision-addressed **Workflow Instance**.

This matches the revised product scope: a manuscript, promotion article, news report, and review article may belong to the same Book while occupying different phases at the same time. In V1, these related deliverables remain Book-owned; an unrelated general-purpose article/news project is outside the current boundary and may be revisited later.

## Pinned original-AI7 evidence

Audit pin: `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`.

| Area | Current truth | Migration finding |
| --- | --- | --- |
| Lifecycle owner | ADR 0019 says one project represents one Book lifecycle. | Keep one Book as the authority boundary, but move phase state to each deliverable so related texts do not falsely share one current stage. |
| Stage catalog | `runtime/publication_lifecycle_commands.py:37-55` fixes `scouting`, `acquisition`, `contracting`, `manuscript-development`, `formal-review`, `copyedit`, `proof`, `production`, `launch`, `post-publication`, and `backlist`. | Retain as an optional Book-publication profile, not universal core enums. |
| Stage record | `runtime/publication_lifecycle_commands.py:1372-1429` stores stage, status, owner, due date, required artifacts, gate status, and next action. | Keep the useful metadata, but current code is not a general configurable transition/gate engine. |
| Editorial artifacts | The PRD names acquisition memo, author query, review opinion, revision letter, style sheet, proof correction log, production metadata, launch copy, errata, rights note, and comparable-title table. Current “typed” command accepts a free-string type. | Keep versioned/provenanced artifacts and replace the free string with an extensible registry of stable type identities. |
| Gates and proof rounds | Current commands fix initial/second/final review, five review outcomes, and first/second/final proof; responsible roles remain free text. | Keep evidence-bearing human decisions and signoff. Make gate/round types profile-specific; roles are attribution labels in V1, not access-control roles. |
| Deterministic command safety | Eight commands—stage, artifact, author query, formal gate, style entry, proof round, production package, and memory decision—share non-mutating Prepare, exact Effect Approval, atomic Commit, and receipt replay contracts. | Keep the narrow command/safety pattern; do not freeze this exact catalog as the new domain model. |
| AI-assisted skill family | Acquisition dossier, developmental review, style-aware annotation, production copy, and memory review manifests are shipped, provider-free, active-Book-only, and proposal/result-only. | Treat them as strong contract tracers, not mature professional AI behavior. Current acquisition output is largely structural metrics/prompts, and production copy contains empty editor-input-required slots. |
| Legacy execution | ADRs 0063/0081 retire executable `ai7.workflow.*` pseudo-skills and retain old Runs as immutable history. | Drop the pseudo-skill names, dispatch, and compatibility layer; old Run records remain only in the old repository/offline archive. |

The historical PRD is useful workflow research, not current architecture authority. Its claims of a complete lifecycle product overstate the maturity of the AI-assisted handlers even though the deterministic record and safety substrate is substantial.

## Accepted domain model

| English canonical term | Preferred Simplified Chinese | Meaning |
| --- | --- | --- |
| **Deliverable Workflow** | 交付成果工作流程 | The revision-addressed editorial process governing one Editorial Deliverable. |
| **Workflow Profile** | 工作流程方案 | A versioned reusable definition of phases, gates, required artifact types, and default responsibilities for one deliverable family. |
| **Workflow Instance** | 工作流程实例 | One deliverable's durable application of an exact Workflow Profile version, including phase history, gates, evidence, and signoff. |
| **Workflow Phase** | 工作阶段 | One named area of work whose status, evidence, responsible actor, and next action are recorded without requiring a universal linear transition. |
| **Workflow Gate** | 工作关口 | A profile-defined point requiring identified evidence and a named Review Decision or signoff before a specified transition or delivery. |
| **Editorial Artifact** | 编辑工作资料 | A versioned, typed, provenance-bearing supporting record around a deliverable, distinct from manuscript/source text and from a public-facing Editorial Deliverable. |
| **Signoff Record** | 签发记录 | The exact human decision that identified workflow evidence and deliverable revision are ready for a stated next use. |
| **Delivery Package** | 交付包 | The exact deliverable revision plus required artifacts, signoffs, destination, and release/export authority prepared for one handoff or publication action. |
| **Editorial Review** | 编辑审读 | Professional assessment of a deliverable or manuscript; it is not itself a publishable review article. |
| **Review Article** | 评论文章 | An Editorial Deliverable discussing a work for readers or publication, with its own evidence, quotation, disclosure, and signoff requirements. |

A Workflow Profile is not an autonomous agent workflow or Harness Workflow. A Workflow Instance is durable editorial business state; Harness may help execute tasks within it but cannot replace it with a Session, Goal, or in-memory Workflow.

## Shared V1 phases

Every V1 deliverable profile composes from these shared phase identities, omitting or reordering them when justified:

| Phase | Preferred Simplified Chinese | Purpose |
| --- | --- | --- |
| `intake` | 立项与简报 | Establish purpose, audience, owner, format, constraints, and initial material. |
| `source-development` | 素材与证据准备 | Assemble authorized sources, claims, quotations, canon, and research questions. |
| `drafting` | 撰写与编辑 | Create or revise deliverable content through human work and governed proposals. |
| `review-verification` | 审读与核验 | Perform editorial review, factual/semantic checks, quotation/citation verification, and required gates. |
| `finalization` | 定稿与签发 | Resolve findings, freeze the intended revision, and record human signoff. |
| `delivery` | 交付与发布 | Prepare the exact Delivery Package for export, handoff, or separately permitted public release. |
| `maintenance` | 更正与归档 | Record corrections, errata, supersession, withdrawal, reissue, and archival status. |

Phases have durable statuses such as not started, active, waiting, completed, skipped with reason, and reopened. A profile may allow overlap—for example source development continuing while drafting starts—and identifies one primary phase only for orientation. Completion never implies factual truth, legal/regulatory approval, public-release authority, or eligibility for Editorial Learning.

## Accepted V1 deliverable profiles

| Deliverable profile | Essential special records and gates |
| --- | --- |
| **Manuscript** | Developmental review, revision letter, author query, style sheet, formal Review Decisions when configured, copyedit findings, proof/correction passes, and final manuscript signoff. |
| **Promotion Article** | Audience/channel brief, approved-claims sheet, Book/Series positioning evidence, brand/tone review, quotation/fact checks, rights/asset checklist, and release signoff. |
| **News Report** | Assignment brief, source and quotation ledger, chronology/fact check, attribution review, editor signoff, and correction record. |
| **Review Article** | Work/edition metadata, quotation/citation ledger, disclosure or conflict note, factual review, editorial signoff, and correction record. |

The first technical tracer slice remains much smaller than this V1 product horizon. These profiles define the target domain and independently deliverable slices; they do not require implementing every profile at once.

## Essential artifact family

The extensible registry starts with stable types for:

- content or assignment brief;
- authorized source/evidence set;
- review findings;
- fact, quotation, and citation verification record;
- editorial/author query;
- revision letter;
- style or voice guidance;
- approved-claims sheet;
- signoff record;
- Delivery Package;
- correction or errata log.

Each Editorial Artifact version records its stable type, owner Book and deliverable, author/actor, status, source/evidence links, exact revision pins, provenance, confidentiality/public-release state, linked Proposal/Review Decisions, linked Effects/receipts, and supersession history. Artifact eligibility for learning remains a separate Learning Eligibility Decision.

## Capability and authority split

1. AI-assisted Task Skills analyze, draft, and produce proposal artifacts. They have no broad lifecycle or Book write authority.
2. Narrow deterministic commands update Workflow Instances, artifacts, gates, signoffs, packages, and correction state through the accepted Effect Intent/Approval/Receipt boundary.
3. A generated proposal can become an authoritative Editorial Artifact version only through an explicit accepted transition; skill output and Run history are not the artifact itself.
4. Memory review moves out of a fixed `backlist` lifecycle skill family and into the already accepted continuous Editorial Learning and Learning Eligibility governance.
5. Public release remains a separate Effect requiring Public Release Permission; workflow completion and Signoff Record do not imply it.

## Keep / adapt / drop

| Legacy element | Recommendation | New-project treatment |
| --- | --- | --- |
| Book-owned local records and source scope | Keep | Book remains evidence, privacy, and mutation authority for its related deliverables. |
| One scalar eleven-stage Book lifecycle | Modify | Optional manuscript-publication profile; deliverable-owned Workflow Instances are the core. |
| Lifecycle metadata, gates, proof/correction history, human signoff | Keep semantics | Profile-defined, revision-addressed, evidence-bearing records. |
| Editorial Artifact family | Keep and deepen | Stable extensible type registry, versioning, provenance, exact evidence, decisions, and Effects. |
| Acquisition dossier | Adapt | Optional acquisition/commissioning profile, not a universal V1 phase. |
| Developmental review | Keep/adapt | Long-form Manuscript capability with real model/evaluation work still required. |
| Style-aware annotation | Adapt | Cross-deliverable style/voice review rather than one copyedit-only fixture. |
| Production copy | Rename/broaden | Publication Communications covering promotion articles, news reports, review articles, jacket/catalog copy, and related deliverables under profile-specific evidence. |
| Memory review at `backlist` | Relocate | Continuous governed Editorial Learning, not a terminal publication stage. |
| Contracting, ISBN/CIP/barcode, print-run, typesetter handoff, awards, rights/backlist automation | Defer from V1 core | Optional later profiles/artifacts; record human notes/checklists only where useful. |
| Mandatory three-review/three-proof sequence for every deliverable | Drop as universal rule | Available in configured Manuscript profiles; never forced onto articles. |
| Automated legal, regulatory, ideological, rights, or publication approval | Drop/prohibit | AI7 may identify questions and track human evidence/decisions, not act as authority. |
| Fixed renderer UI, pseudo-skills, current manifests/handlers as quality proof | Drop as architecture | Preserve contract evidence; redesign UI and implement real editorial evaluation later. |

## Verification direction

Provider-free tests should prove profile version pinning, independent workflows for two deliverables in one Book, phase overlap/reopen/skip history, gate and evidence drift invalidation, artifact version/provenance, distinction between proposal and authoritative artifact, exact signoff/delivery package binding, no public release without permission, and no cross-deliverable stage leakage.

## Decision resolution

Question 19 accepted the Book-owned, deliverable-specific Workflow Profile/Instance model, the seven shared phases, the four V1 profiles, the typed artifact family, and the keep/adapt/drop boundary above. See [ADR 0008](../docs/adr/0008-use-deliverable-owned-workflow-profiles.md).
