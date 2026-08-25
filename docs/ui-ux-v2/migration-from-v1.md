# Migration from the frozen V1 UI/UX semantics

Status: **accepted V2 semantic mapping on `dev`; design and provenance only**

## Authority and purpose

- Frozen reference input: exact Git object `587d6455f6a578d3df8a39f534ec7a057c07a18c` under `docs/ui-ux/`.
- Frozen V2 architecture provenance input: exact Git object `247b7dacb267ba2f4076ca8461c95e5f0508b343`; it is input evidence only, not current authority.
- Current authority comes from target-qualified `dev` root owners routed through [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md), accepted root [`docs/adr/`](../adr/), the accepted [`architecture-v2`](../architecture-v2/README.md) package, and the presentation decisions in this directory. Root ADR 0028's Windows-and-macOS one-product contract overrides the frozen reference.

This document records how individually accepted portable V1 meanings were reshaped into the V2 `dev` baseline. It does not migrate screens, code, components or test evidence; authorize adjacent implementation, prototypes or Figma work; or claim that any journey has been implemented or validated.

## Mapping vocabulary

- **Retain — V1 Semantic Retention**: keep the user outcome, state distinction, negative guarantee or journey identity; placement and wording may still change.
- **Reshape — V1 Interaction Reshaping**: keep the underlying professional need but express it through V2 objects, authority, navigation or language.
- **Drop — V1 Artifact Drop**: do not use the old artifact or assumption as a V2 baseline. Dropping a screen or gate does not silently drop a retained user outcome.

## Retain

| Frozen semantic asset | V2 disposition | Candidate destination |
| --- | --- | --- |
| Book-first navigation and manuscript/editor-first work | Retain Book as source/privacy/mutation anchor and Manuscript as the normal dominant work object | `README.md` D-002/D-005; `information-architecture.md` |
| A distinct global work/attention projection | Retain cross-Book awareness without giving the projection authority | Action-first `待我处理` / Global Attention |
| Exact Book, deliverable, revision, selection, source and outbound context | Retain exact bindings before Run Authorization and later Effects | Task, Plan Preview and Apply sections |
| Separate Run Authorization, Proposal Decision, Review Decision, Effect Approval, Effect Receipt and public-release meaning | Retain all named authority and proof distinctions | `CONTEXT.md`; task/proposal/factual/export interactions |
| Separate Reference Integrity, Claim Support and Factual Verification | Retain as three independent factual states | factual-verification lens and evidence comparison |
| Proposal-first model mutation, exact-range margin/inspector anchoring, exact-pin drift/conflict handling and atomic Apply | Retain semantic inline changes and exact anchors as persistent Manuscript-anchored Proposal Cards; reshape V1 geometry through collapsed/virtualized long-manuscript review; retain diff-merge, separate approval and verified receipt | proposal/conflict/apply sections |
| Edit Journal, Manuscript Checkpoint and independent Recovery Snapshot | Retain their separate durability/history/recovery meanings | editing persistence and recovery sections |
| Pause/cancel and Resume/Retry/Redo/Replay | Retain exact continuation meanings; add accepted Rewind | running work and continuation sections |
| DOCX fidelity classification and zero silent loss | Retain preserve/degrade/reject disclosure across supported content classes | import and representation/export sections |
| Chinese IME, keyboard, accessibility appearance, zoom/reflow and long-manuscript windowing | Retain as unconditional professional behavior on Windows and macOS, with native adapters | editor, keyboard, theme and flexible-surface sections |
| Fourteen stable journey IDs `J-01`–`J-14` | Retain every frozen journey identity and underlying business outcome; add J-15 for reusable-procedure/automation management and J-16 for contextual interactive editorial dialogue as new V2 features | [`journeys.md`](./journeys.md) |

## Reshape

| Frozen V1 expression | V2 reshaping |
| --- | --- |
| Candidate A/B/C three-column shell hypotheses | Book-anchored AI7 Workbench with one collapsible contextual sidebar, dominant active work object, contextual side surface, dedicated workspaces and detached manuscript-page transfer |
| Work queue organized around old screen assumptions | Action-first Global Attention groups: exceptions/results, exact decisions, running/paused and recent outcomes |
| Selection-aware task entry as a mostly manual review flow | Exact Task Intent/target/source scope plus Task Skill recommendation, Plan Preview, Quick Start, authorized default execution and exact Plan Revision boundary |
| No frozen centralized reusable-automation/version-management baseline | Add an AI7 V2 Automation Center projection with typed asset sections, exact version history, linked work/deliveries and history-preserving removal; inherit no old UI geometry or generic macro/plugin object |
| No frozen foreground contextual-question-answering presentation contract | Add Book/work-object-bound Interactive Editorial Dialogue with Waiting Only as the product default, a foreground-only Interactive Stream exception, background `等待回答`, durable answer history, and explicit promotion into governed objects |
| Generic model/provider emphasis | Role/capability-first model selection; provider, credential, fallback, budget and usage detail progressively disclosed or opened on demand |
| Detached reading as a separate view hypothesis | One editable manuscript subpage transferred between workbench and Detached Manuscript Window; no parallel editor |
| Formal editor-facing `签发` | User-facing `保存为里程碑版本` while the separate internal Signoff Record remains exact |
| Public Release Permission terminology in ordinary export flow | Explicit exact-version `发稿版本` projection; ordinary local export has no release interaction |
| Signoff-to-delivery journey with external handoff semantics | Milestone Version + destination-/format-independent Delivery Package + separate native-targeted Local Export Preparation/receipt; no direct send, recipient, handoff log or delivery tracking |
| Equal-format export framing | DOCX as primary user format, Markdown as internal/fallback and secondary user option, PDF as optional fixed-layout export |
| No durable post-designation maintenance object | Versioned Maintenance Cases bound to exact Publication Version/Deliverable revision; Correction/Errata/Supersession/Withdrawal/Reissue/Archive preserve history and make Withdrawal/Archive internal-only |
| Broad learning/feedback surface | Quiet contextual reason prompts, Book-first explicit Learning Material eligibility, governed Series/House scope and object-centered bidirectional Learning Audit |
| Implicit source retention or undifferentiated shared Series context | Explicit Book-targeted Source Version acquisition; separate Series membership, knowledge-candidate promotion and immediate append-only retrieval-exclusion interactions |
| Fixed light-first visual values | Codex-referential AI7-owned low-noise language with system-following light/dark themes, native accessibility appearance, adjustable density/typography and semantic state grammar |
| Screen-by-screen accessibility/usability/performance test gates | Retain behavior in complete Windows-and-macOS end-to-end journeys and discovered bug regressions; do not create independent UI/usability/accessibility/performance/platform gates |
| V1 requirement IDs and screen codes as organizing authority | Rehome accepted meanings into V2 requirement IDs and domain-shaped surfaces; old IDs remain provenance only |

## Drop

| Frozen artifact/assumption | Why it is not a V2 baseline |
| --- | --- |
| A/B/C geometry, exact columns, proportions and viewport layouts | No shell variant was selected, and V2 workbench structure was independently decided |
| HTML/CSS/JavaScript prototype and its component behavior | Throwaway reference implementation; it supplies no implementation or prototype authority |
| Figma raw frames, old component tree and handoff geometry | Reference artifacts only; any Figma or native-library work requires separate explicit authority |
| Exact V1 palette, typography sizes, radii, shadows, spacing and token values | V2 has independent theme, density, reading and semantic-state direction |
| Codex brand, assets, copied microcopy, code/repository/terminal or unbound generic-chat hierarchy | Codex supplies interaction principles only; AI7 owns publishing objects and authority. New contextual Interactive Editorial Dialogue remains subordinate to an exact Book/work object rather than reviving chat as the product root |
| Editor-facing Policy/Composition activation or capability-expansion controls | Hidden governed assets remain developer-controlled and cannot become editorial self-service elevation |
| Formal `签发` wording, signature ceremony and generic approval styling | Target-house workflow uses Milestone Version language and keeps exact internal records separate |
| Direct send/handoff/recipient/delivery-confirmation UI | V1 ends at a local Export Effect Receipt |
| Owner walkthrough, 3–5-editor study and standalone UI/accessibility/performance gates | No such independent gates are authorized; only the logical E2E Functional Gate on Windows and macOS and discovered bug regression remain |
| Any claim that frozen checks prove production behavior | Frozen checks establish artifact integrity only and are not V2 implementation evidence |

## Journey continuity

All fourteen V1 IDs survive. Their accepted V2 mappings are in [`journeys.md`](./journeys.md), which also adds J-15 and J-16 as new V2 feature journeys. No frozen journey is removed merely because its old screen or validation method is dropped.

Question 60 closed the two seams identified at that time: `J-01` ends in a durable Manuscript Import Record and `J-13` uses an exact Series membership/shared-scope workspace, impact preview and change record. Issue #8 then completed five batches covering Book/import identity and restart safety, exact `Task Input / 任务输入` pins, budget/Resume lifecycle, explicit Source acquisition, Series Knowledge/exclusions, and post-milestone package/export/maintenance. Batch 5 makes Delivery Package identity destination-/format-independent, keeps every concrete format/path/fidelity choice in a separate Local Export Preparation, delegates existing-target choices to native Windows/macOS workflows with exact Effect evidence, and preserves Correction/Errata/Supersession/Withdrawal/Reissue/Archive through immutable Maintenance Case revisions. Source-only and no-change reimport outcomes correctly produce no Manuscript Revision, while `Task Input / 任务输入` and applied maintenance corrections deliberately can. Later feature deltas add J-15 reusable automation and J-16 response presentation without changing the identity or history of the frozen fourteen. These remain design contracts, not permission to infer implementation or inherited validation evidence.
