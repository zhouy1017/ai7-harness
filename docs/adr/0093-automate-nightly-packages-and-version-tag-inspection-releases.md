---
status: accepted
---

# Automate nightly packages and version-tag inspection releases

On 2026-10-21 the Owner requested automatic builds after the nightly Gate passes, releases triggered by version tags, and consistent software version, Data Version and build number in GitHub and the running executable. [#1009](https://github.com/zhouy1017/ai7-harness/issues/1009) implements delivery and [#1015](https://github.com/zhouy1017/ai7-harness/issues/1015) implements identity. This replaces the manual draft-only workflow introduced in the same unmerged documentation/build wave.

## One identity, three meanings

Software version is the release SemVer in root `package.json`; an eligible tag is exactly `v` followed by that version, using the repository's `vX.Y.Z` or `vX.Y.Z-rc.N` syntax. Data Version retains [ADR 0079 §1](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md)'s compatibility meaning. Its later freeze at 1 was implemented by [#968](https://github.com/zhouy1017/ai7-harness/pull/968) and is recorded in the integrated [milestone scope](../development/milestone-1.0.0-scope.md); this decision preserves that freeze. A release, tag or new build does not itself change data compatibility, schema revision or protocol.

Build number is the count of commits reachable from the exact source commit in complete Git history. It is deterministic across local and hosted builds of that commit; shallow history is refused, never interpreted as a smaller build number. The full source commit disambiguates branches with the same count. A local modified checkout is visibly marked; release packaging requires clean source. GitHub run ID and attempt identify a packaging occurrence separately and never replace the source build number. [Versioning](../development/versioning.md) owns the executable format, validation and platform mappings.

Build tooling captures this identity once and carries it into the package, runtime display, diagnostics, native executable/bundle metadata and release provenance. There is no manually maintained second version in a workflow and no fallback to Electron's version. Rebuilding the same source does not create a new source build number; publication must still use the exact stored, verified artifact bytes from its selected nightly occurrence.

## Automatic delivery boundary

The existing nightly merge queue resolves final `dev` to one immutable commit after candidate processing. Both platforms of the existing full Gate test that commit. Only their joint success permits native packaging of that same commit. This adds a delivery phase, not another hosted Gate or permission to merge an unreleased PR.

An eligible version tag selects the already built nightly artifacts at its exact commit. Publication verifies the software/Data Version/build identity, successful final-dev Gate/package occurrence, complete platform asset set and checksums. It does not rebuild from the tag or use candidate-PR artifacts. An early tag can wait for the matching nightly packages; a completed nightly occurrence reconciles the current tag automatically. Forced/deleted push events do not directly publish. A current, unpublished tag can reconcile later only if its exact commit has the required nightly evidence; this is not a repository-wide tag-protection rule. Existing releases are immutable: retries may verify the same publication, but cannot overwrite its assets or move its tag, and a published tag's changed target is refused. Missing or inconsistent evidence blocks publication with an actionable result.

The initial automatic channel is explicitly labeled **unsigned inspection prerelease**, for Windows installer/portable and macOS DMG artifacts. It is not a signed production distribution or a claim of macOS signing/notarization. The workflow and release notes disclose that boundary. Only named package outputs, checksums and build provenance are admitted; product data, private manuscripts, credentials and test-result payloads are excluded. [Releasing](../development/releasing.md) owns the operator procedure and recovery behavior.

## Exact amendments and preserved decisions

- [ADR 0052, Distribution and update posture](0052-select-the-macos-v1-distribution-and-data-location-profile.md): retain Developer ID signing, hardened runtime and notarization for the end-user production DMG. The separate inspection-prerelease channel may publish clearly labeled unsigned DMGs; it grants no signing-secret or notarization authority.
- [ADR 0054, Boundary expiry and macOS re-entry](0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md): authorize the described nightly inspection packaging/publication before the separately recorded production release re-entry. Both native nightly Gate results remain required for these artifacts. Preserve the milestone definition, production re-entry requirement, main-promotion boundary and all historical evidence limits.
- [Incremental development, Version iteration](../agents/incremental-development.md#version-iteration): the final sentence's re-entry requirement has the same narrow inspection packaging/publication exception as ADR 0054 above. Its requirements for product integration, creating/moving tags, production distribution and promotion to `main` remain unchanged.
- [Git conventions, Tags and releases](../agents/git-conventions.md): this request supplies standing scope for the specified automatic package/inspection-publication events. Creating or moving a real version tag is not part of this implementation task. Production signing, notarization and promotion to `main` remain separate Owner decisions.

This does not alter product manuscript publication/Export authority, the provider-free Gate, supported Journeys, model-provider policy or repository merge receipts. Implementing the workflow does not attest that it has executed successfully on GitHub; the exact runtime evidence belongs in the implementing PR.
