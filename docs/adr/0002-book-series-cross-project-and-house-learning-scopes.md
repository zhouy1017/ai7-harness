---
status: accepted
---

# Separate Book, Series, Cross-project, and House-learning scopes

AI7 uses four explicit scopes because direct manuscript authority and adaptive learning have different safety and editorial meanings. A Book owns its text and mutations; an explicit Series shares versioned knowledge and provenance-bearing read-only retrieval across member Books; a Cross-project task directly selects otherwise unrelated Books for one task; House Editorial Memory shares only derived patterns and feedback across the eligible Working Corpus. Every manuscript mutation remains targeted to one Book and exact revision.

## Consequences

Series membership and exclusions are visible and versioned, task evidence records the exact Book/Series/memory revisions used, and no similarity inference silently creates Series membership or whole-library source access.

## Later refinements

[ADR 0036](./0036-promote-series-knowledge-through-explicit-review.md) requires an explicit promotion review before a Series Knowledge Candidate creates a new stable Series Knowledge Item with its first immutable revision or appends one revision to an exact existing item. [ADR 0037](./0037-enforce-versioned-series-retrieval-exclusions-immediately.md) makes an effective exclusion an immediate guard on later Series-scoped reads without rewriting the original authorization or completed history.
