---
status: accepted-candidate
---

# Use purpose-specific DOCX, Markdown, and PDF representations without making Markdown authoritative

AI7 uses three purpose-specific document representations. DOCX is the ordinary editor's primary editable import/export and professional handoff format. Markdown is a bounded or streamed Agent Exchange Projection derived from and pinned to one exact Manuscript Revision; it is also available as an explicitly selected fallback export. PDF is an optional fixed-layout export for reading, printing, or handoff. No representation replaces the Manuscript Revision as text authority.

An agent may read a current Markdown projection through AI7's bounded domain Capabilities. Agent-authored Markdown changes are interpreted only as an exact-source-revision Proposal or typed change set. Proposal Decision and a separately approved, atomic Apply Effect remain necessary before a new Manuscript Revision exists. A stale projection is re-derived or explicitly rebound; it never overwrites current manuscript text through fuzzy reconciliation.

Every user-facing export binds one exact milestone/package/version and format. Export Fidelity Review discloses preservation, degradation, or unavailability for applicable rich-document classes before export. DOCX carries the editable round-trip contract, Markdown makes its structural and rich-content losses explicit, and PDF carries no editable round-trip promise. A local export still requires exact Effect Approval and produces an Effect Receipt; it grants neither delivery nor Public Release authority.

## Considered options

- DOCX only was rejected because it serves professional editorial exchange but is a poor, unstable interchange boundary for agents and offers no lightweight fallback.
- Making Markdown the manuscript storage or mutation authority was rejected because it cannot faithfully carry every rich-document semantic and would bypass exact Manuscript Revision, Proposal, and Apply boundaries.
- Treating all three formats as equivalent user-facing exports was rejected because it hides their different purposes and fidelity contracts.
- Purpose-specific DOCX, Markdown, and PDF representations were accepted despite the additional projection freshness, conversion, and fidelity-disclosure work because each serves a distinct professional or agent need without weakening manuscript authority.

## Consequences

The document pipeline must keep exact revision pins, derivation identity, freshness, and Proposal remapping for Markdown projections. Long manuscripts require bounded or streamed projections rather than whole-manuscript prompt material. Export preparation must present format-specific fidelity by content class, never fall back silently, and publish local files atomically with receipts. The detailed Markdown serialization, extension syntax, and file layout remain architecture decisions rather than UI/UX commitments.
