# Migration from the frozen V1 UI/UX semantics

Status: **frozen design reference as of `dev@4c50ce31b0f15ff2bfadd2af17fc914c317e0f22` under [ADR 0064](../adr/0064-reweight-repository-development-toward-value-first-delivery.md); design and provenance only**

## Authority and purpose

- Frozen reference input: exact Git object `587d6455f6a578d3df8a39f534ec7a057c07a18c` under `docs/ui-ux/`.
- Frozen V2 architecture provenance input: exact Git object `247b7dacb267ba2f4076ca8461c95e5f0508b343`; it is input evidence only, not current authority.
- Current target authority must be resolved from an exact integrated `dev` commit through [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md), root [`docs/adr/`](../adr/) and [`architecture-v2`](../architecture-v2/README.md). Root ADR 0028's Windows-and-macOS one-product contract overrides the frozen reference.

This document records how individually accepted portable V1 meanings were reshaped into the target V2 baseline and then identifies the bounded Issue #86 V2-to-V2 successor normalization. It does not migrate screens, code, components or test evidence; authorize adjacent implementation, prototypes or Figma work; or claim that any journey has been implemented or validated.

## Mapping vocabulary

- **Retain — V1 Semantic Retention**: keep the user outcome, state distinction, negative guarantee or journey identity; placement and wording may still change.
- **Reshape — V1 Interaction Reshaping**: keep the underlying professional need but express it through V2 objects, authority, navigation or language.
- **Drop — V1 Artifact Drop**: do not use the old artifact or assumption as a V2 baseline. Dropping a screen or gate does not silently drop a retained user outcome.

## Issue #86 V2-to-V2 successor normalization

This table does not invent V1 antecedents. It records which earlier V2 presentation/runtime assumptions are no longer current in the Issue #86 successor revision while preserving their ADR/history provenance:

| Earlier V2 assumption | Issue #86 successor disposition |
| --- | --- |
| Parallel AI7 Task Skill package/candidate/admission/enablement/activation runtime | Retire as current ownership. Preserve native DSH Skill/Plugin/Bundle/Profile/Agent Preset identities; DSH Skill is the semantic unit, Plugin/Bundle is packaging, and AI7 supplies separate compatibility/authority/scope/update/per-Run boundaries without finalizing their record schemas. |
| Standalone AI7 Workflow Profile definition owner | Retain AI7 Workflow Profile only as a product projection/selector over an exact native DSH definition carrier; AI7 still owns durable Workflow Instances, phases, Gates, Signoffs and business transitions. The built-in Manuscript baseline maps to exact read-only declarative native Profile `manuscript-editorial@1.0.0`, with native ID derived from the carrier-directory basename, and separate AI7 projection `ai7.manuscript.editorial.zh-CN@2.0.0`; mappings for other Workflow definitions remain deferred. |
| Development-only rare/static Plugin model with fixed repository popularity/freshness thresholds | Retire as universal ecosystem authority. Use staged native-artifact discovery/acquisition/validation/install/scoped enablement/update/rollback while leaving catalog sources, trust tiers and sandbox mechanics unresolved. |
| Fixed global `自动化中心` ownership and placement | Retain one consolidated typed native-artifact/Rule/proposal management projection, but defer its final global label and placement; Background Analysis Enrollment remains outside that projection and separately disclosed, with its own entry/label/controls also deferred, and none becomes a generic automation runtime. |
| Retrieval candidates as sufficient whole-manuscript analysis | Preserve ranked retrieval plus Exact Fetch for targeted work and add separate deterministic Coverage Manifest/Analysis Unit/immutable Result Set contracts with independent coverage, reducer closure, freshness and assurance axes. |
| Provider setup or a Default Execution Rule as possible low-ceremony background authority | Provider setup remains non-authorizing; a Rule can match only a newly user-initiated Task. New autonomous Provider-backed manuscript analysis requires an active exact Background Analysis Enrollment, while the same existing authorized Run may continue backgrounded unchanged. |
| Manuscript Apply described mainly inside Proposal-specific interaction | Keep the Proposal path and make it the universal formal agent-originated mutation boundary: one single-use AI7 Apply bound to exact Book/base pin/diff/targets, drift recheck, explicit editor confirmation and verified receipt. Direct typing and deterministic import/domain commands remain separate. |

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
| Fourteen stable journey IDs `J-01`–`J-14` | Retain every frozen journey identity and underlying business outcome; J-15 now owns native DSH artifact lifecycle/reuse and J-16 retains contextual interactive dialogue/Agent Workspace hosting as V2 features | [`journeys.md`](./journeys.md) |

## Reshape

| Frozen V1 expression | V2 reshaping |
| --- | --- |
| Candidate A/B/C three-column shell hypotheses | Book-anchored AI7 Workbench with one collapsible contextual sidebar, dominant active work object, contextual side surface, dedicated workspaces and detached manuscript-page transfer |
| Work queue organized around old screen assumptions | Action-first Global Attention groups: exceptions/results, exact decisions, running/paused and recent outcomes |
| Selection-aware task entry as a mostly manual review flow | Exact Task Intent/target/source scope plus Native DSH Artifact Recommendation/manual exact revision, Plan Preview, Quick Start, user-initiated Default Execution Rule matching and exact Plan Revision boundary |
| No frozen centralized reusable-automation/version-management baseline | Add one carrier-neutral native-artifact/Rule/proposal management projection with typed exact revision history, linked work/deliveries and history-preserving removal; keep Enrollment outside and separately disclosed, defer both presentations' final label/placement and create no generic automation runtime |
| No frozen foreground contextual-question-answering presentation contract | Add Book/work-object-bound Interactive Editorial Dialogue with Waiting Only as the product default, a foreground-only Interactive Stream exception, background `等待回答`, durable answer history, and explicit promotion into governed objects |
| No frozen Book-bound DSH-composed agent surface | Add explicit Agent Workspace as a contained AI7-shell presentation that preserves Book/safety/prior work-object context and grants no DSH-owned product authority |
| No frozen whole-revision covered-analysis persistence contract | Add deterministic coverage/reduction, immutable Result Set revisions, three explicit update meanings, separate feedback/metrics and a separately explicit, revocable Background Analysis Enrollment whose compact controls remain deferred |
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

All fourteen V1 IDs survive. Their target-qualified V2 mappings are in [`journeys.md`](./journeys.md); J-15 and J-16 remain the two V2 feature journeys and no J-17 is introduced. No frozen journey is removed merely because its old screen or validation method is dropped.

Question 60 and Issue #8 history remain unchanged: they close durable import evidence, Series membership/shared scope, Book/import identity and restart safety, exact `Task Input / 任务输入` pins, budget/Resume lifecycle, explicit Source acquisition, Series Knowledge/exclusions and post-milestone package/export/maintenance. Issue #86 then normalizes J-15 to native DSH artifacts, extends J-01/J-03/J-04/J-09/J-11/J-14/J-16 in place, and makes J-05 the universal formal agent Apply path without changing any journey identity. These remain design contracts, not permission to infer implementation or inherited validation evidence.
