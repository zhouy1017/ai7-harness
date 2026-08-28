# Use deliverable-owned workflow profiles

AI7 keeps the Book as the source, privacy, and mutation authority, but assigns each Editorial Deliverable its own Workflow Instance pinned to a versioned Workflow Profile instead of one scalar Book-wide publication stage. V1 profiles for Manuscript, Promotion Article, News Report, and Review Article compose seven shared phases with profile-defined artifacts, evidence gates, and signoff; narrow Effect-safe commands own authoritative transitions. This permits related deliverables to progress concurrently while preserving the useful legacy lifecycle semantics, without inheriting its universal eleven-stage enum, pseudo-skills, fixed UI, or immature handler behavior as architecture.

## Later refinements

[ADR 0038](./0038-separate-delivery-package-identity-from-local-export.md) keeps Delivery Package content identity separate from format/path-bound local exports. [ADR 0040](./0040-preserve-post-designation-maintenance-as-versioned-cases.md) gives the maintenance phase stable versioned cases without rewriting Publication Versions or claiming external recall.

[ADR 0045](./0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) partially supersedes only the Workflow definition and technical-logic carrier: the general rule for external and user-authored workflows still selects no Profile/Bundle/Plugin mapping, while its Issue #38 refinement selects the exact built-in `manuscript-editorial@1.0.0` native Profile exception. Deliverable ownership, the durable AI7 Workflow Instance, phases, gates, artifacts, signoff and deterministic Effect-safe transitions remain unchanged.
