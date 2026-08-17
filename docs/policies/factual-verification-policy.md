# Factual Verification Policy

Status: **accepted design baseline; not connected to a runtime**

This is the canonical design-phase Policy Document for deciding what evidence may support or contradict a Manuscript Assertion. It preserves the manuscript as the Textual Source of Record while preventing its exact wording—or a Foundation Model's belief—from being misrepresented as factual proof. Production versions must remain human-reviewable, machine-validatable, versioned, diffable, and snapshot with each task that uses them.

## Authority boundary

1. A manuscript or source revision is authoritative for what that text says, not automatically for whether its assertions are true.
2. The policy classifies assertions and evidence roles before verification. Textual, real-world factual, fictional/canonical, editorial-judgment, and generated-content claims do not share one truth test.
3. A task or user may designate references and their intended authority scope. Such designation can establish an edition, terminology, project convention, or canon without making the reference universally true.
4. The active policy defines admissible evidence kinds, domain-specific precedence, corroboration, freshness, and conflict handling. No evidence kind is universally infallible.
5. Foundation Model knowledge may raise a concern, formulate a verification question, or suggest research; it is not evidence by itself and cannot close a factual finding.
6. AI7 records Reference Integrity, Claim Support, and Factual Verification separately. Passing one never implies another.
7. Insufficient or conflicting evidence remains explicitly unresolved or conflicting. AI7 must not silently choose a convenient answer.
8. A proposed fix remains a revision-bound Correction Proposal, qualified correction, or editor/author query until the applicable manuscript-mutation decision is made.

## Default evidence preference

The active policy may refine precedence by task and subject domain. Its default preference is:

1. user/editor-designated authoritative task references, limited to their stated scope;
2. appropriate primary or official records for the claim domain, captured as immutable evidence;
3. accepted Book or Series canon for fictional and internal-continuity assertions only;
4. approved publishing-house/reference corpus and professionally curated material;
5. authorized secondary or live external research with sufficient provenance;
6. Foundation Model knowledge as a research lead only, never as verifying evidence.

An evidence record must identify its role, source kind, authority scope, title or local identity, author/publisher when applicable, exact supporting passage or data, revision or publication time, retrieval time when external, digest, access provenance, and quality assessment. The policy may require multiple independent records for sensitive or disputed claims.

## Outcomes and conflicts

A verification outcome is one of `supported`, `contradicted`, `conflicting`, `unresolved`, or `not-applicable`; textual and internal-consistency statuses remain separately reportable. Conflicting evidence is retained rather than collapsed, with the applicable precedence rule, contrary evidence, uncertainty, and human disposition recorded.

An Editorial Error Finding and any linked Correction Proposal record the exact manuscript revision/span, assertion, issue type, verification question, evidence for and against, evidence strength, rationale, relevant uncertainty, proposed wording or editor/author query, and eventual human disposition. A scalar model-confidence value cannot substitute for this evidence record.

See the [Source–Generation–Grounding Boundary](../../kick-in/17-source-generation-grounding-boundary.md).
