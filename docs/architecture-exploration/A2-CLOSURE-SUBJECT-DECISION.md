# A2 exact closure-subject decision

Status: **Commander selected X2; exact obtainable artifact not yet identified; evidence dispatch required**

Recorded: **2026-08-23**

Decision owner: **Repository Development Commander**

This is a repository-development scope decision for `DQ-A2-02`, not a product dependency selection, technical capability result, owner risk decision, or implementation authorization.

## Decision

Select **X2**: re-score A2 against one exact published release, package version, or binary that AI7 could actually obtain and ship.

Do not use:

- **X1**, research commit `44e95c857f37f81a5731eab72c32a3d334d0e2c4`, because the owner-direction evidence explicitly records it as research evidence rather than a dependency pin; or
- **X3**, whatever is current at evaluation time, because a moving target cannot support reproducible closure, packaging, schema compatibility, or release evidence.

## Required artifact identity

Before any matrix re-score, a separately authorized evidence task must identify and provenance-label:

1. the exact published release, package version, or binary distribution name and immutable version;
2. the official obtainability channel and platform/architecture coverage relevant to AI7;
3. the source commit corresponding to that artifact, or an explicit finding that no official mapping is published;
4. the exact App Server protocol/schema identity or a reproducible fingerprint method;
5. license and `NOTICE` material attached to the artifact;
6. the official support/maturity warning that applies to that exact artifact; and
7. any difference between the artifact, current official documentation, the research snapshot, and locally observed `codex-cli 0.147.0`.

If no exact obtainable artifact can be mapped to one coherent App Server surface, report that result and keep `CC-01`, A2 continuation, and A3 blocked. Do not substitute a branch head, local installation, unversioned documentation, SDK wrapper, or `codex exec` surface.

## Relationship to owner U2

[Clarification 0003](./clarifications/0003-accept-bounded-unsupported-codex-risk.md) accepts the unsupported App Server classification as a bounded owner risk. X2 makes that exception auditable by binding it to an exact shippable subject. Neither decision turns the surface into supported or Proven; evidence maturity and owner risk acceptance stay separate.

## Next authority boundary

The next task is factual artifact discovery from official OpenAI sources and read-only package/release metadata. It may not edit the candidate, install or execute a new artifact, copy source, run a behavioral probe, rescore any row, claim closure or gap, enter A3, inspect DeepSeek runtime, choose a maintenance form, or implement. A later Commander brief must name the exact admitted evidence and write boundary before the Issue #4 Worker may consume the result.
