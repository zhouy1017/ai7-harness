---
status: accepted
---

# Separate targeted retrieval from covered manuscript analysis

This ADR extends [ADR 0026](./0026-manuscript-retrieval-returns-candidates.md) without weakening it. It is repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. It authorizes no retrieval, index, embedding, analysis, Provider or storage implementation.

## Decision

AI7 uses two distinct long-manuscript execution contracts selected from the Task goal and exact DSH analysis contract, not from a user-facing technical RAG toggle.

**Targeted retrieval** serves ordinary questions and passage finding. Lexical, vector or hybrid search returns ranked approximate candidates; only Exact Fetch against the authorized pinned Manuscript Revision returns authoritative wording for that exact record. Candidate relevance is not coverage evidence.

**Covered manuscript analysis** is required whenever a Task claims whole-manuscript, comprehensive or complete review. It deterministically enumerates the exact pinned Manuscript Revision, persists structured unit results, performs provenance-preserving hierarchical reduction and discloses every failed, skipped or uncovered range. A top-K threshold may never omit a declared range from this contract.

## Coverage and reduction

AI7 derives a deterministic **Coverage Manifest** from the pinned Manuscript Revision. The manifest completely enumerates structure-aware **Analysis Units**, preferring chapters, scenes, headings and Manuscript Blocks, splitting structures that exceed the attention budget and using bounded overlap at boundaries. Unit sizing is an execution budget, not a fixed block count. The tracer's 32-block editor/service window is neither a retrieval chunk nor an Analysis Unit invariant.

An exact DSH analysis contract declares the task-specific structured partial-result schema and compatible reducer stages. AI7 owns the generic coverage/provenance envelope: exact revision and ranges, unit and reducer lineage, persistence, conflicts, gaps and the rule governing any whole-revision claim. Reducers preserve source-unit lineage and unresolved conflicts, and a cross-unit contradiction or continuity pass precedes final prose. Recursive free-text summarization cannot replace that evidence graph or the Coverage Manifest.

Processing every declared range can be evidenced. Semantic completeness and model attention cannot be guaranteed. AI7 therefore presents four independent axes:

- mechanical coverage of manifest units;
- reducer and synthesis closure;
- freshness relative to an exact Manuscript Revision; and
- qualified semantic/evidence assurance, including unresolved conflicts.

No generic absolute `complete` flag may collapse those axes.

## Durable result sets and reuse

Covered analysis produces a Book-bound **Manuscript Analysis Result Set** with immutable Result Set Revisions. Each revision binds one exact Manuscript Pin, Coverage Manifest, exact DSH analysis contract and relevant schema/reducer digests, unit results, synthesis/conflict/gap state, execution provenance, reuse lineage and cost. A Task Outcome links the produced revision; only a separate explicit promotion creates an Editorial Artifact.

Cross-Run reuse lives in this AI7-owned durable, non-authoritative record, never in shared DSH scratch or cache. Prior revisions remain valid history for their original pin and are never rebound to newer manuscript text.

Three distinct updates append new Result Set Revisions:

- `同步到当前稿件` reuses exact dependency-compatible unchanged units and recomputes the invalidation closure;
- `重新分析所选范围` bypasses prior model results for the selected range and its dependency closure; and
- `重新分析全书` bypasses all prior model results and covers the complete current manifest.

Every Manuscript Checkpoint performs local deterministic invalidation and dependency-closure marking only. On-demand synchronization may run inside a newly user-initiated Task. A new autonomous Provider synchronization requires a matching active Background Analysis Enrollment under [ADR 0048](./0048-enroll-and-evaluate-background-manuscript-analysis.md).

Failures, skips, cancellation and invalid outputs persist exact gaps. Missing-only continuation may reuse successful compatible work while disclosing that lineage; it never implies that a model evaluated changed text.

## Deferred details and stop boundary

Retrieval technology, embeddings, chunk boundaries, index generation/storage, context-budget policy, exact Coverage Manifest/Result Set schemas, enum names, retention, reducer implementation, acceptance evidence and compact UI remain deferred. This ADR makes no semantic-completeness guarantee and does not turn analysis output into manuscript, factual, learning or publication authority.
