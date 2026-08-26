---
status: accepted
---

# Allow Owner-designated Public SampleBooks in repository and CI

This ADR supersedes only the blanket repository and hosted-CI prohibition in [ADR 0016](./0016-proprietary-license-and-local-only-sample-manuscripts.md) for the narrow class defined here. ADR 0016 remains historical evidence and continues to govern private sample Books and every manuscript not expressly admitted by this decision.

## Context

AI7 needs public manuscript-shaped material for provider-free journey tests. The existing rule correctly keeps real and private editorial material out of repositories and hosted CI, but its blanket wording also excludes sample manuscripts that the Owner has expressly made public for test use. Treating every file placed in a directory as automatically public would be unsafe; continuing the blanket prohibition would contradict the Owner's clarified grant.

The current J-01 tracer already generates a public-synthetic DOCX in a disposable external temp root. This decision does not change that implementation or claim full J-01 authority.

## Decision

### Public SampleBook admission

A **Public SampleBook** is a manuscript-shaped test input that satisfies both conditions:

1. it is located under exact repository root `SampleBooks/`; and
2. the Owner explicitly designates that exact material for public test use through an authorized GitHub Issue and pull request.

Directory placement, filename, format, Git visibility, or a general project-use grant alone is not admission. The authorizing records must identify the selected material closely enough for the Commander to verify that the pull request contains only what the Owner designated.

Once admitted, a Public SampleBook may be tracked in the repository and used as provider-free input to local and hosted-CI tests. A scenario that consumes it must name the exact admitted input in its own authorized Change Brief. The same input and journey meaning apply on Windows and macOS.

### Boundaries that remain closed

Public SampleBook admission grants no authority to:

- print or copy raw manuscript payload into logs, diagnostics, screenshots, traces, videos, uploaded build/test artifacts, or other evidence;
- include the material or a runtime derivative in an application package, installer, shipped product, release asset, or other distribution;
- make a live model/provider call, supply a provider credential, or permit outbound product network access;
- use the material for production learning, House Editorial Memory, adaptation, export, external delivery, or publication; or
- admit any other manuscript, derivative, or private sample Book.

Runtime copies, imports, indexes, journals, databases, and generated derivatives stay in the disposable external E2E Agent Data Root and are cleaned under the existing lifecycle. Provider Processing Policy v1 remains zero-allow. External Export Policy and Public Release Permission remain separate authorities.

### Repository mechanics

The root `.gitignore` continues to ignore manuscript document formats everywhere by default and negates those patterns only beneath exact root `SampleBooks/`. That technical exception does not authorize a commit: the Issue/PR admission record is the authority. No SampleBooks content is added by this decision.

## Consequences

- Public test material can be reviewed, versioned, and used identically in provider-free local and hosted-CI journeys.
- Private or unpublished material remains fail-closed regardless of repository visibility.
- Reviewers must verify designation, exact path, and Change Brief binding when a later pull request first adds or consumes a Public SampleBook.
- CI reports scenario identity, state, and failure location without retaining editorial payload.
- The one logical E2E Functional Gate, current J-01 tracer, and full-J-01 authority boundary do not change.

## Rejected alternatives

- **Keep the blanket prohibition.** Rejected because it contradicts the Owner's explicit Public SampleBooks exception.
- **Treat every file under `SampleBooks/` as public.** Rejected because placement is not provenance or authority.
- **Permit Public SampleBooks only as local untracked inputs.** Rejected because the Owner expressly permits repository and hosted-CI use.
- **Extend the exception to logs, artifacts, distributions, providers, learning, export, or publication.** Rejected because none is necessary for provider-free test input and none was authorized.
- **Rewrite ADR 0016.** Rejected because the successor must preserve the original decision as historical evidence and supersede only its now-narrowed clause.

## Authority and stop boundary

This decision implements the Owner's clarification recorded in Issue #30. It authorizes only the classification and repository/CI admission rule above. It does not add any Public SampleBooks content, change product/test behavior, select a journey, install a dependency, authorize a provider or export, release, publish, or promote `main`.
