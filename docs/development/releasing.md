# Preparing an unsigned inspection draft

`.github/workflows/release.yml` prepares Windows x64 and macOS arm64 inspection assets as a **draft GitHub release**. It has only a manual trigger. It does not publish, create or move a tag, promote `main`, sign, notarize or run another Gate. Its packaged macOS output is **unsigned inspection-only**, not the end-user distribution required by [ADR 0052](../adr/0052-select-the-macos-v1-distribution-and-data-location-profile.md).

Implementing this workflow does not authorize executing it. The [milestone/re-entry status](../../PROGRESS.md) and [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) remain controlling: consolidated re-entry and separate exact Owner authorization for packaging/upload/draft creation must precede a run. Actual publication and signed macOS distribution remain separate work. No execution of this workflow is part of Issue #1009.

## Manual workflow

Once authorized, select **Prepare unsigned inspection draft** on branch **dev** and supply:

| Input | Required value |
| --- | --- |
| `sha` | Full lowercase 40-character SHA of the selected current `dev` commit |
| `version` | Exact `package.json` version, `X.Y.Z` or `X.Y.Z-rc.N` |
| `gate_run` | Existing successful directly dispatched **E2E Nightly Full Gate** run ID for that exact SHA, with both platform jobs successful |

The separately authorized tag `v<version>` must already exist and resolve to the same SHA, whether lightweight or annotated. A missing/moved tag, existing visible release, version mismatch, dirty checkout, non-`dev` workflow ref, different workflow/source SHA, incomplete Gate run, or absent platform result stops preparation. Drafts require push access to see: the read-only validation job can reject published releases, and the final write job checks the paginated release listing for every matching release, including partial drafts, before creating anything. The default-branch workflow discovery requirement must be satisfied through normal authorized integration/promotion; this feature does not justify changing `main` just to expose the Run workflow button.

An equivalent CLI invocation, **only after that separate execution authorization**, is:

```text
gh workflow run release.yml --ref dev -f sha=<exact-commit> -f version=<exact-version> -f gate_run=<existing-run-id>
```

The helper reuses `hostedGatePassed` from the existing Gate owner. It accepts the existing direct full-Gate occurrence whose run title binds the selected commit, and checks both Windows and macOS jobs. A PR head status or a queue run's outer `head_sha` is not sufficient proof of the final integrated tree. It neither dispatches tests nor queries Actions usage. Obtain any missing verification under the existing separately authorized verification process.

The workflow checks out only its own exact `dev` workflow SHA, passes inputs through environment variables rather than executable shell text, and uses full-SHA-pinned actions. Validation has read-only contents/Actions access. Native package jobs have read-only contents access and no signing/product/provider secrets. Only the final isolated job receives contents-write for draft creation, after both package jobs succeed. Checkout never persists credentials. One concurrency group serializes draft attempts.

## Outputs and publication boundary

The native jobs run `doctor`, `bootstrap` and `release:prepare`. Preparation delegates clean build and packaging to `tools/package.mjs --build-only`, which skips the packaged executable self-check; the existing package command without that option retains its self-check behavior. The packager stages the explicit production runtime closure and uses its existing offline builder configuration with publication disabled. Bootstrap's non-GUI runtime probe still occurs. No product Journey or live model call is added.

Only these newly staged, explicitly named files are uploaded:

| Platform | Files |
| --- | --- |
| Windows x64 | `AI7-<version>-win-x64-setup-unsigned-inspection.exe`, `AI7-<version>-win-x64-portable-unsigned-inspection.zip`, `SHA256SUMS-win-x64.txt`, `provenance-win-x64.json` |
| macOS arm64 | `AI7-<version>-mac-arm64-unsigned-inspection.dmg`, `SHA256SUMS-mac-arm64.txt`, `provenance-mac-arm64.json` |

Preparation requires an empty/absent `release/` before packaging. It rejects unexpected top-level outputs, redirected directories, linked/empty assets and populated portable `data/`; it never recursively uploads the checkout, `release/`, `.builder/`, `.stage/`, unpacked application, self-check report, product data, logs or credentials. The Windows portable archive is created from the pristine folder before any product launch. These artifact uploads expire after seven days; draft release assets are separate and remain until explicitly managed.

Each SHA-256 file covers its platform's packages and provenance JSON. Provenance records the source commit/version/tag, platform/architecture, package/lock/artifact-manifest hashes, the existing Gate run, workflow run/attempt, asset sizes/digests and explicit unsigned/not-notarized/inspection-only flags. This is descriptive build provenance, **not a signed attestation or proof of reproducible binary output**. The final job verifies all downloaded bytes, identities and the exact file set, then rechecks the existing tag and Gate before creating a new draft with `--verify-tag --draft --prerelease --latest=false`. It never overwrites an existing release.

A network/upload failure may leave a partial draft. Stop and inspect it; do not treat it as complete, publish it, automatically delete it or rerun with overwrite. Recovery of that existing draft needs a separate explicit action. Tags remain mutable until protected; repository tag protection is an operational prerequisite for keeping the independently authorized tag fixed through preparation.

Windows signing remains deferred under the existing distribution profile. macOS end-user delivery requires Developer ID signing, hardened runtime and notarization; none is implemented by this workflow. Unsigned macOS artifacts may be blocked by Gatekeeper and are not claimed launchable on an end-user machine. The workflow has no signed mode and refuses a changed signing configuration until that future release path is deliberately implemented and reviewed.

## Local preparation and inspection

For fast source inspection use [local inspection](local-inspection.md). It requires no tag, packaging or GitHub upload.

The release helper's side-effect-free help is:

```text
pnpm run release:prepare -- --help
```

After separate packaging authorization, on a supported clean checkout at the exact commit, run `doctor` and `bootstrap`, then:

```text
pnpm run release:prepare -- --sha <exact-commit> --version <exact-version> --gate-run <existing-run-id>
```

This builds only the current native platform and writes named files under ignored `release/upload/`. Local preparation records the supplied Gate ID but makes no GitHub request to verify it; only the manual workflow validates remote tag/Gate evidence and creates the draft. It does not remove a stale `release/` directory: use a fresh checkout or consciously move/delete only known generated outputs after inspecting their contents. No local preparation output is release authority.

## Technical references

The implementation follows GitHub's [manual trigger, permissions and concurrency syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [release-create draft and existing-tag flags](https://cli.github.com/manual/gh_release_create), [artifact upload file selection](https://github.com/actions/upload-artifact/tree/v4.6.2), and [workflow run/job API](https://docs.github.com/en/rest/actions/workflow-runs). Signing configuration is checked against the pinned major version's [electron-builder v26 macOS options](https://www.electron.build/v26/docs/mac/) and [notarization requirements](https://www.electron.build/v26/docs/features/code-signing/notarization/); newer-major signing schemas are not substituted into this repository.
