---
status: accepted
---

# Automate nightly packages and Windows version-tag releases

On 2026-10-21 the Owner requested automatic builds after the nightly Gate passes, releases triggered by version tags, and consistent software version, Data Version and build number in GitHub and the running executable. The Owner then selected **Windows releases only**, holding macOS publication until signing is configured. [#1009](https://github.com/zhouy1017/ai7-harness/issues/1009) implements delivery and [#1015](https://github.com/zhouy1017/ai7-harness/issues/1015) implements identity. This replaces the manual draft-only workflow and the initial unsigned-inspection-prerelease assumption in the same unmerged documentation/build wave.

## One identity, three meanings

Software version is the release SemVer in root `package.json`; an eligible tag is exactly `v` followed by that version, using the repository's `vX.Y.Z` or `vX.Y.Z-rc.N` syntax. Data Version retains [ADR 0079 §1](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md)'s compatibility meaning. Its later freeze at 1 was implemented by [#968](https://github.com/zhouy1017/ai7-harness/pull/968) and is recorded in the integrated [milestone scope](../development/milestone-1.0.0-scope.md); this decision preserves that freeze. A release, tag or new build does not itself change data compatibility, schema revision or protocol.

Build number is the count of commits reachable from the exact source commit in complete Git history. It is deterministic across local and hosted builds of that commit; shallow history is refused, never interpreted as a smaller build number. The full source commit disambiguates branches with the same count. A local modified checkout is visibly marked; release packaging requires clean source. GitHub run ID and attempt identify a packaging occurrence separately and never replace the source build number. [Versioning](../development/versioning.md) owns the executable format, validation and platform mappings.

Build tooling captures this identity once and carries it into the package, runtime display, diagnostics, native executable/bundle metadata and release provenance. There is no manually maintained second version in a workflow and no fallback to Electron's version. Rebuilding the same source does not create a new source build number; publication must still use the exact stored, verified artifact bytes from its selected nightly occurrence.

## Automatic delivery boundary

The existing nightly merge queue resolves final `dev` to one immutable commit after candidate processing. Both platforms of the existing full Gate test that commit. Only their joint success permits native packaging of that same commit. This adds a delivery phase, not another hosted Gate or permission to merge an unreleased PR.

An eligible version tag selects the already built nightly artifacts at its exact commit. Publication verifies the software/Data Version/build identity, successful paired final-dev Gate and both native package jobs, complete Windows release asset set and checksums. It does not rebuild from the tag or use candidate-PR artifacts. An early tag can wait for the matching nightly packages; a completed nightly occurrence reconciles the current tag automatically. Forced/deleted push events do not directly publish. A current, unpublished tag can reconcile later only if its exact commit has the required nightly evidence; this is not a repository-wide tag-protection rule. Existing releases are immutable: retries may verify the same publication, but cannot overwrite its assets or move its tag, and a published tag's changed target is refused. Missing or inconsistent evidence blocks publication with an actionable result.

The automatic release assets are the **Windows installer and portable package**, with their named checksums and build provenance. A stable `vX.Y.Z` tag produces a normal GitHub release; `vX.Y.Z-rc.N` produces a prerelease. The workflow and release notes disclose that Windows packages are unsigned. A normal release designation does not imply signing or promotion to `main`.

Unsigned macOS DMGs remain **nightly inspection artifacts only**. No macOS package, macOS checksum file or macOS provenance file goes to GitHub Releases. macOS publication remains held until Developer ID signing, hardened runtime and notarization are configured under ADR 0052; this Windows-only workflow neither supplies that configuration nor grants access to signing secrets. Both native nightly builds remain required, without claiming unsigned macOS launch or distribution evidence.

Only named package outputs, checksums and build provenance are admitted to their respective artifact/release channels; product data, private manuscripts, credentials and test-result payloads are excluded. [Releasing](../development/releasing.md) owns the operator procedure and recovery behavior.

## Exact amendments and preserved decisions

- [ADR 0052, Distribution and update posture](0052-select-the-macos-v1-distribution-and-data-location-profile.md): preserve Developer ID signing, hardened runtime and notarization for the end-user macOS DMG, with no unsigned macOS publication exception. Nightly inspection artifacts are not that distribution.
- [ADR 0054, Boundary expiry and macOS re-entry](0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md): authorize the described nightly native packaging and Windows publication before the separately recorded consolidated re-entry. Both native nightly Gate results and package builds remain required. Preserve the milestone definition, product-integration and macOS production re-entry requirements, tag-creation and main-promotion boundaries, and all historical evidence limits.
- [Incremental development, Version iteration](../agents/incremental-development.md#version-iteration): the final sentence's re-entry requirement has the same narrow nightly-packaging/Windows-publication exception as ADR 0054 above. Its requirements for product integration, creating/moving tags, macOS production distribution and promotion to `main` remain unchanged.
- [Git conventions, Tags and releases](../agents/git-conventions.md): this request supplies standing scope for the specified automatic nightly-package and Windows-publication events. Creating or moving a real version tag is not part of this implementation task. Signing, notarization, macOS publication and promotion to `main` remain separately scoped actions.

This does not alter product manuscript publication/Export authority, the provider-free Gate, supported Journeys, model-provider policy or repository merge receipts. Implementing the workflow does not attest that it has executed successfully on GitHub; the exact runtime evidence belongs in the implementing PR.
