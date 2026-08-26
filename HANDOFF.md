# Public SampleBooks exception handoff

Start with root [`AGENTS.md`](AGENTS.md), verify the exact branch/head and intended `dev` target, then read current [`PROGRESS.md`](PROGRESS.md) and [Issue #30](https://github.com/zhouy1017/ai7-harness/issues/30). This file is a cold-start router, not product or domain authority.

## Current change

Issue #30 records the Owner's clarification that the general repository/hosted-CI manuscript prohibition governs other manuscripts, while exact Owner-designated Public SampleBooks are a narrow public test-input exception. The Worker branch adds root [ADR 0043](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md) and aligns the current repository, CI, buildability, migration, ignore, and entry-point owners.

No `SampleBooks/` content, product code, scenario, dependency, provider/export path, domain definition, or test gate was added. The current J-01 tracer still generates its public-synthetic DOCX under an external disposable temp root and remains only the bounded Issue #24 outcome, not full J-01.

## Exact boundary

A Public SampleBook requires both exact-root `SampleBooks/` placement and explicit Owner designation of the selected material through an authorized Issue and pull request. Placement alone is not admission. The exception permits repository tracking and provider-free local/hosted-CI test input only; raw payload remains prohibited from logs, diagnostics, screenshots, traces, videos, uploaded build/test artifacts, and distributions. It grants no live-provider call, credential, outbound product network, learning, export, external delivery, publication, or public-release authority.

All other manuscripts, derivatives, and private sample Books remain excluded from repositories and hosted CI. Document formats remain ignored elsewhere in the tree.

## Next safe action

The Commander reviews the Worker diff against Issue #30, creates and integrates the pull request to `dev` if accepted, then corrects Issue #28's body and first review comment as the authorized external records. A later Public SampleBook addition or consumption starts only under its exact Owner designation and applicable bounded Change Brief.

Archive sweep: none. ADR 0016 and historical kick-ins remain unchanged as historical evidence; ADR 0043 supersedes only their blanket repository/hosted-CI prohibition for the exact admitted class.
