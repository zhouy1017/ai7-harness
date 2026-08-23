# A2 exact closure-subject decision

Status: **Commander selected X2 and exact stable `0.149.0` App Server x64 package; version-bound support mapping and artifact probe remain open; no candidate re-score yet**

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

The completed [exact-artifact evidence record](./A2-EXACT-ARTIFACT-EVIDENCE.md) found two coherent candidates: stable `0.149.0` and prerelease `0.150.0-alpha.7`. Both map official npm packages and Windows variants through SLSA provenance to an annotated release tag, source commit, and published Windows App Server assets.

Under the Commander's recorded `DQ-A2-02` authority, select the stable `rust-v0.149.0` App Server release and `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz`, SHA-256 `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28`, source commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`, as the exact X2 subject. No alpha-only requirement, support-classification difference, or unaccepted cost triggers owner escalation. The arm64 package remains identified evidence rather than a new platform promise. No candidate edit or re-score follows from selection.

One required identity remains explicitly incomplete: exact source snapshots warn only about WebSocket, while moving current documentation also warns that the App Server command is unsupported for production. No official source retrieved binds that broader warning to `0.149.0`. U2 applies it conservatively to the selected artifact for risk control but cannot turn the missing vendor-version mapping or any evidence row into Proven.

## Relationship to owner U2

[Clarification 0003](./clarifications/0003-accept-bounded-unsupported-codex-risk.md) accepts the unsupported App Server classification as a bounded owner risk. X2 makes that exception auditable by binding it to an exact shippable subject. Neither decision turns the surface into supported or Proven; evidence maturity and owner risk acceptance stay separate.

## Next authority boundary

The next eligible task is a separately authorized, temporary-directory artifact probe of only the selected x64 package and its matching standalone executable. Until such a brief exists, no download, install, extraction, execution, schema generation, behavioral probe, candidate edit, matrix re-score, closure/gap claim, A3, DeepSeek runtime inspection, maintenance-form selection, or implementation is authorized. A later Commander brief must name exact inputs, checks, output boundary, and stop conditions before any Worker acts or the Issue #4 Worker consumes a result.
