# Public SampleBooks review handoff

Start with root [`AGENTS.md`](AGENTS.md), verify the exact current `dev` tip, then read current [`PROGRESS.md`](PROGRESS.md). This file is a cold-start router, not product or domain authority.

## Current state

[Issue #32](https://github.com/zhouy1017/ai7-harness/issues/32) is integrated through [PR #33](https://github.com/zhouy1017/ai7-harness/pull/33). Root [`SampleBooks/`](SampleBooks/) tracks the six exact Owner-designated Public SampleBooks—6,755,431 bytes total—plus their [`README.md`](SampleBooks/README.md) provenance, integrity, permitted-use, and closed-boundary manifest.

The original local source, repository destinations, and raw committed Git blobs have matching SHA-256 identities. [ADR 0043](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md) remains the admission authority.

No test or Journey currently consumes these inputs. The Issue #24 J-01 tracer still generates its public-synthetic DOCX at runtime and remains a bounded happy-path tracer, not full J-01.

## Next safe action

Update and human-review PRD [Issue #28](https://github.com/zhouy1017/ai7-harness/issues/28) and its concise review projection to reflect the integrated inputs.

Any later consumption requires a separately authorized bounded Journey Change Brief naming an exact admitted input and extending existing owners. Archive sweep: none. No blockers remain for the admission itself.
