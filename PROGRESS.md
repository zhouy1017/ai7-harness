# Progress

## What's done

- Issue #30's documentation Worker implemented the Owner-designated Public SampleBooks exception on branch `docs/30-public-samplebooks-exception` from exact `dev@85c4a098e6809ce94bb8aaa97d5648e378166db3`.
- Added successor [`ADR 0043`](docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md) and updated the current rule owners: [`AGENTS.md`](AGENTS.md), [`.gitignore`](.gitignore), [`README.md`](README.md), [`docs/agents/project-constraints.md`](docs/agents/project-constraints.md), [`docs/agents/ci-test-boundaries.md`](docs/agents/ci-test-boundaries.md), [`docs/agents/source-checkout-buildability.md`](docs/agents/source-checkout-buildability.md), [`docs/agents/git-conventions.md`](docs/agents/git-conventions.md), and [`docs/architecture-v2/MIGRATION.md`](docs/architecture-v2/MIGRATION.md).
- Added no file under `SampleBooks/` and changed no product code, E2E scenario, dependency, provider/export policy, domain owner, test gate, release state, or `main` state.
- Archive sweep: none. ADR 0016 and historical kick-ins remain immutable evidence; the successor ADR and current owners carry the clarified rule, and the prior root routing remains recoverable in Git history.

## What's next

- Commander reviews the exact Worker diff and authority, creates the Issue #30 pull request, and alone integrates it to `dev` if accepted.
- After integration, the Commander corrects Issue #28's PRD projection and first human-review comment so they no longer describe the Public SampleBooks exception as unresolved.
- Adding or consuming any exact Public SampleBook still requires its own Owner designation through an authorized Issue/pull request and, for test consumption, a separately authorized bounded journey Change Brief.

## Key decisions made

- A Public SampleBook is material under exact root `SampleBooks/` that the Owner explicitly designates for public test use through an authorized Issue and pull request; placement alone grants no authority.
- Admission permits repository tracking and provider-free local/hosted-CI test input only. It grants no raw-payload logging/artifact/distribution, live-provider, learning, export, or public-release authority.
- Every other manuscript, derivative, and private sample Book remains prohibited from repositories and hosted CI. Root `.gitignore` continues to ignore document formats elsewhere.
- The current J-01 tracer remains runtime-generated and unchanged; this clarification is not full-J-01 or further implementation authority.

## Unresolved matters or blockers

- No implementation blocker exists inside Issue #30. No Public SampleBooks content is present or selected by this change.
- Issue #28 external records remain for the Commander to correct after integration; the Worker has no external-action authority.

## Resume Prompt

Review and integrate Issue #30's narrow Public SampleBooks governance change to `dev`; then correct Issue #28's PRD projection, while treating every exact SampleBook addition or use as separately designated input and preserving the bounded J-01 tracer boundary.
