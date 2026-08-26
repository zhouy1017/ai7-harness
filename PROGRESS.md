# Progress

## What's done

- Integrated [Issue #30](https://github.com/zhouy1017/ai7-harness/issues/30) through [PR #31](https://github.com/zhouy1017/ai7-harness/pull/31). Successor [`ADR 0043`](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md) and the updated current owners now carry the Owner-designated Public SampleBooks repository/provider-free-CI exception.
- Corrected [Issue #28](https://github.com/zhouy1017/ai7-harness/issues/28) and its first human-review comment so the PRD projection no longer treats the exception as an unresolved repository/CI conflict.
- Added no file under `SampleBooks/` and changed no product behavior, E2E scenario, dependency, provider/export authority, domain owner, test gate, release state, or `main` state.
- Archive sweep: none. ADR 0016 and historical kick-ins remain immutable evidence; the successor ADR and current owners carry the clarified rule, and the prior root routing remains recoverable in Git history.

## What's next

- Human-review Issue #28 and its linked summary against the accepted authority owners.
- Start one next bounded implementation outcome only after separate Owner authorization and an implementation-planning Change Brief that extends existing owners.
- Any exact Public SampleBook addition or consumption still requires Owner designation through its authorized Issue/pull request and, for test consumption, the applicable bounded Journey Change Brief.

## Key decisions made

- A Public SampleBook is material under exact root `SampleBooks/` that the Owner explicitly designates for public test use through an authorized Issue and pull request; placement alone grants no authority.
- Admission permits repository tracking and provider-free local/hosted-CI test input only. It grants no raw-payload logging/artifact/distribution, live-provider, learning, export, or public-release authority.
- Every other manuscript, derivative, and private sample Book remains prohibited from repositories and hosted CI. Root `.gitignore` continues to ignore document formats elsewhere.
- The current J-01 tracer remains runtime-generated and unchanged; this clarification is not full-J-01 or further implementation authority.

## Unresolved matters or blockers

- No Public SampleBooks content is present or selected. There is no remaining repository/CI rule conflict about the authorized exception.
- The next bounded implementation outcome has not been selected or authorized. Provider, export, release, `main` promotion, and unimplemented J-01 branches remain outside current authority.

## Resume Prompt

Human-review Issue #28 and its summary; preserve the Public SampleBooks admission boundary and bounded Issue #24 tracer, and start only one separately authorized implementation outcome under its own planning Change Brief.
