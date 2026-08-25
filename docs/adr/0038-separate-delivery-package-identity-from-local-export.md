# Separate Delivery Package identity from local export

AI7 versions a Delivery Package as a destination- and format-independent prepared content manifest bound to one exact immutable Editorial Deliverable Revision, optionally identified by an exact Milestone Version, plus its stated purpose, included Editorial Artifacts, applicable gate/signoff references, exclusions, and limitations. Each local export separately creates a Local Export Preparation that binds its format, filename, final path, fidelity disposition, payload digest, create-or-replace disposition, and applicable External Export Policy before exact Effect Approval, followed by one per-file Effect Receipt or classified outcome. Changing an export format or destination never mutates or re-versions the package. The package copies no gate, signoff, export, delivery, or publication authority and may be exported repeatedly without becoming proof of sending, handoff, release, or publication.

## Considered options

A format-bound package would require a new package version for DOCX, PDF, or Markdown even when its editorial content was unchanged. A path-bound package would make filesystem placement part of editorial identity. Keeping both concerns in Local Export Preparation preserves one stable content package while retaining exact authority and outcome evidence for every concrete file Effect.
