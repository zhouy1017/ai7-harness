# Series Work Boundary

Status: **accepted in Question 12**

## Why Series is distinct

A Series is more strongly connected than an arbitrary Cross-project Workspace. Member Books may share canon, characters, places, chronology, terminology, themes, positioning, house style, production assets, and continuity obligations. Treating those links only as generic House Editorial Memory would discard useful Book-specific knowledge; granting ambient access across the entire Working Corpus would be too broad.

## Accepted principles

- Series membership is explicit, versioned, and visible; it is never inferred merely from similar titles or authors.
- A Series owns stable Series Knowledge Items and their immutable promoted revisions in addition to each member Book's own state; editor-authored drafts and provenance-bound proposals remain Series Knowledge Candidates until explicit review.
- Unrelated Books continue to share only governed House Editorial Memory unless an explicit Cross-project task selects them.
- Series sharing never grants public-release permission.
- A change to a manuscript or Book-owned deliverable remains a Book-targeted proposal bound to an exact revision, even when a Series task discovered or authored it.
- Historical tasks retain the Series membership and knowledge revisions they used.
- Membership, accepted Proposals, Milestone Versions, Learning Eligibility, and model output never promote Series Knowledge automatically.

## Accepted Series Knowledge lifecycle

Series Knowledge has two entry paths: an editor-authored candidate, or a provenance-bound candidate derived from an exact member-Book Manuscript Revision, Source Version, or reviewed evidence. One explicit Series Knowledge Promotion Decision reviews the exact Series, proposed new or exact existing stable Series Knowledge Item, content, authorship or source provenance, conflicts, and intended future reuse scope. A disclosed conflict must be edited and re-reviewed, explicitly preserved, or cancelled; preservation stores the conflict and never resolves factual truth. `纳入书系知识` creates the item with its first immutable revision or appends one immutable revision to the exact selected item while the originating Book or source remains its source of record; later edits create another revision rather than rewriting the prior one.

Candidate creation, review, or promotion creates no Run Source Scope, authorizes or performs no retrieval, permits no provider transmission, and grants no manuscript mutation, Learning Eligibility, factual verification, Public Release Permission, or membership change. Promotion makes the revision eligible only for later exact selection; a Run may use it solely through its own source-scope, authorization, and provider-data flow.

## Accepted sharing model

A Series-scoped task may use:

1. Promoted immutable Series Knowledge Revisions: canon, character/place dossiers, timeline, terminology, continuity rules, shared style, positioning, shared assets, and accepted cross-Book facts.
2. Exact, provenance-bearing retrieval over current revisions of all member Books, read-only by default.
3. House Editorial Memory, as any ordinary Book task may.

Every exact excerpt identifies its member Book and revision. Removing a Book from a Series stops future automatic Series access but does not rewrite historical task evidence. Cross-Series or unrelated-Book access still requires explicit Cross-project selection.

Users may exclude an exact member Book, Source Version, stable Series Knowledge Item, or stable knowledge class from Series retrieval without erasing Series membership. An item-targeted exclusion covers that item's current and future revisions; a class-targeted exclusion also covers later matching items. Every Series Retrieval Exclusion is versioned and append-only with exact scope, effective time, and optional reason. Once effective it blocks each later affected Series read, including a not-yet-performed read in a queued, authorized, or active Run. That Run stops for Plan Revision plus renewed Run Authorization or cancellation; its frozen authorization, already fetched evidence, and completed history remain immutable, and a later impact marker records the changed restriction where applicable.

Changing or ending an exclusion appends a superseding revision, restores no old authorization, and never auto-resumes work. The restriction governs the Series retrieval path only: it is not global Book/source deletion, a Learning Eligibility exclusion, or an automatic decision about a separately authorized Cross-project path. A Series-scoped task receives relevant retrieved passages rather than placing every complete manuscript into model context.

See [ADR 0002](../docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md).

Issue #8 Batch 4 records the refined lifecycle and exclusion authority in [ADR 0036](../docs/adr/0036-promote-series-knowledge-through-explicit-review.md) and [ADR 0037](../docs/adr/0037-enforce-versioned-series-retrieval-exclusions-immediately.md).
