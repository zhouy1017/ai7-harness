# AI7 V2 PRD review handoff

Start with root [`AGENTS.md`](AGENTS.md), verify the exact current `dev` tip, and read current [`PROGRESS.md`](PROGRESS.md). This file is a cold-start router, not a product or domain authority owner.

## Current review subject

[Issue #28](https://github.com/zhouy1017/ai7-harness/issues/28) synthesizes the accepted AI7 V2 design into a product-level PRD. Its [human-review summary](https://github.com/zhouy1017/ai7-harness/issues/28#issuecomment-5420437858) provides the rapid review route. Review the product boundary, authority separations, J-01–J-16 coverage, current-versus-future status, testing seam, explicit exclusions, and unresolved matters.

The PRD is an index over existing authority owners. It does not supersede contexts, ADRs, Policy Documents, V2 architecture/UI/UX, or source-checkout owners; its `ready-for-agent` label does not authorize implementation or issue decomposition.

## Current implementation boundary

Immutable Issue #24 integration checkpoint `4ef62ac1d1de37c2cc644fd17669bd4669ec8441` proves only the provider-free J-01 new-Book happy-path tracer: public-synthetic DOCX, Review Before Import, atomic initial Book graph, bounded ProseMirror window, one edit, and durable Edit Journal acknowledgement. It is not full J-01.

The single standing acceptance seam is the launchable-product E2E Functional Gate. An admitted Journey ID runs through the built Electron product on Windows and macOS and observes user-visible, domain, authority, and durable-data consequences. Issue #28 creates no lower-level or additional gate.

## Unresolved input

The Owner states that original manuscript material intended for public synthetic-data generation exists under a `samplebooks` directory and may be used publicly for test authoring. The directory is absent from the PRD's exact `dev` base, and current rules prohibit manuscripts and derivatives in the repository, hosted CI, fixtures, and corpora. Issue #28 reads, copies, and authorizes none of that material. A future exact Change Brief must resolve path, provenance/public-use grant, transformation, sanitization, and current-rule reconciliation before use.

## Next safe action

Human-review Issue #28 and its linked summary. Any implementation, issue decomposition, provider/export work, or broader J-01 claim requires separate Owner authorization and an implementation-planning Change Brief for one bounded outcome that extends existing owners.

Archive sweep: none. The PRD and review comment are active external review records; prior routing remains recoverable in Git history.
