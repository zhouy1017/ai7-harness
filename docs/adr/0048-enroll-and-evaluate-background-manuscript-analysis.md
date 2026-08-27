---
status: accepted
---

# Enroll and evaluate background manuscript analysis

This ADR records the Owner-approved background-analysis and quality boundary for Issue #86. It extends [ADR 0019](./0019-editorial-quality-metrics-and-behavior-evaluation-gate.md) rather than replacing delivery-quality semantics. It is repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. It authorizes no Provider call, scheduler, analysis implementation, learning or manuscript mutation.

## Background Analysis Enrollment

A versioned **Background Analysis Enrollment** is the sole standing authority origin for a new autonomous Provider-backed manuscript-analysis dispatch. It is disclosed and revocable and applies by exact Book, Series or all-Books scope, selected analysis kinds, Provider/data categories, budget, prospective/backfill choice, pause/revoke state and restart semantics. Each dispatch still creates an exact Plan, Provider Binding, Run Authorization, Run Source Scope, declared operation classes, usage/cost provenance and immutable Result Set Revision.

A Default Execution Rule remains limited to a newly user-initiated matching Task and never becomes background authority. An already authorized Run may continue asynchronously inside its unchanged envelope; a new idle, scheduled, post-checkpoint, import-triggered or cross-Run Provider dispatch requires the active Enrollment.

Provider onboarding may offer a separate explicit Enrollment action, but Provider setup, manuscript import, artifact discovery/install/enablement, DSH Session or Plugin membership never creates or activates an Enrollment. No matching newly user-initiated Task or active Enrollment means no Provider call or cost.

Enrollment grants only the selected non-mutating analysis work. It grants no Effect, formal Manuscript Apply, factual decision, Series Knowledge promotion, learning, publication or Public Release Permission.

## Baseline and optional analysis

The product-built exact-versioned **Baseline Manuscript Analysis Contract** covers manuscript-internal structure/Coverage Manifest, structural-unit synopsis, entities/aliases/terms, events and chronology, relationships, internal-setting claims, exact ranges, confidence, conflicts and unresolved items. It performs no external truth adjudication, interpretive editorial review, mutation, Series promotion or learning.

Baseline analysis is the default selection inside an active Enrollment. All eight built-in Editorial Dimensions remain independently selectable optional analysis kinds, with an all-eight shortcut. Plugin- or user-provided analysis kinds require explicit selection; artifact installation or enablement enrolls none of them.

A background batch may share one authorized Run where compatible, but each analysis kind retains an independent Manuscript Analysis Result Set, coverage/freshness/failure state, feedback and update lifecycle.

Successful Manuscript import is independent of analysis. A matching active Enrollment may queue Baseline and other selected work after import. Without one, import still succeeds and displays analysis pending with no Provider call or cost. An analysis failure never rolls back a successful import.

## Feedback and analysis-quality evaluation

Every persisted analysis family accepts immutable **Quality Signals** attributed to the exact Book, Manuscript Pin, Result Set Revision, analysis kind or Editorial Dimension, DSH Skill/Plugin and effective execution/model provenance. A signal may target a whole set, synthesis node, item or omitted range and may contain a typed disposition plus free text. Silence is never approval.

Feedback never overwrites historical model output, establishes factual truth, enters learning automatically or changes an artifact. A structured user correction creates a provenance-marked successor Result Set Revision and recomputes affected synthesis. Requested selected-range or whole-Book reanalysis creates a newly authorized Run and revision.

Delivery Quality Metrics remain the owner for proposal/delivery outcomes. A separate **Analysis Quality Metric** family aggregates reviewed usefulness, corrections/rejections, discovered omissions, entity merge/split, relationship/chronology and range/evidence corrections, coverage/reducer/freshness closure, conflict/gap preservation, repair after rerun, reuse, cost and latency under exact analysis/contract/model/provider and permitted Book/editor/house scope. The exact metric-snapshot record name and schema remain unresolved. Aggregation grants no cross-Book retrieval authority, and editor judgment remains quality evidence rather than factual proof.

## Retained Policy boundary

No Enrollment, Quality Signal or metric may activate a Policy Document, Artifact Update Rule, behavior revision or learning decision. The stricter existing developer-review rule for Policy revision activation remains in force until separately superseded.

## Deferred details and stop boundary

Enrollment onboarding and compact UI, pause/disable mechanics, exact fields, budget defaults, scheduling, debounce/coalescing, restart continuation, failure recovery, storage, per-kind registration, progress aggregation, notifications, metric windows and retention remain implementation-facing. Background Provider work beyond enrolled manuscript analysis requires a new Owner decision.
