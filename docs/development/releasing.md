# Nightly packages and Windows version-tag releases

The nightly queue automatically packages its final tested `dev` commit on Windows x64 and macOS arm64. A matching version tag publishes **only the existing Windows installer and portable ZIP**. Stable `vX.Y.Z` tags create normal releases; `vX.Y.Z-rc.N` tags create prereleases that are never marked latest. Windows remains unsigned. macOS packages remain unsigned inspection artifacts in the nightly run; macOS releases are deferred indefinitely until the Owner explicitly requests resumption. Signing, hardened-runtime and notarization readiness do not automatically lift this hold.

[ADR 0093](../adr/0093-automate-nightly-packages-and-windows-version-tag-releases.md) owns this prospective automatic lane and its scoped authorization. It does not promote `main`, create tags, bump versions or authorize signed macOS distribution. Implementing or reviewing these workflows does not itself execute packaging or publish a release.

## Operator sequence

1. Change the software version in `package.json` through normal review and integration into `dev`; follow [versioning](versioning.md) for software, Data Version and build identity.
2. Let the existing nightly merge queue finish its candidate work. It resolves the final `dev` once, runs the existing full Gate at that immutable SHA on **both** platforms, then packages that same SHA. The queue run's initial `head_sha` can precede its merges and is **not** the tested/package source SHA.
3. Create the separately authorized `v<softwareVersion>` tag at that exact integrated, nightly-packaged commit. Lightweight and annotated tags are supported. Do not tag a pre-squash slice or version-bump commit and expect a newer green `dev` to satisfy it.
4. Tag creation triggers publication from the verified nightly artifacts without rebuilding. An early tag waits for packages; completion of the matching nightly queue automatically reconciles it. If `dev` advances before that tagged commit receives its own nightly build, the tag remains without admissible packages. A newer nightly commit cannot fill that gap. Follow the ordinary development/tag authorization route for a version at an actually packaged commit; do not move a published tag or substitute another build.

`release.yml` has no manual build/draft input path. An authorized retry reruns the publication workflow occurrence; it does not rebuild packages. A queue run with failed PR candidates can still supply packages if its final-dev resolution, both final-dev Gate jobs and both package jobs succeeded in the same attempt. PR, fork, candidate-ref and direct full-Gate runs cannot supply release packages.

The scheduled queue and `workflow_run` completion trigger use GitHub's default-branch discovery. The repository default is `dev`; the workflows become available through normal integration there. This feature does not justify changing or promoting `main`. Branch protections, Orca receipts and queue merge authority remain unchanged.

## Source, identity and artifact verification

`e2e-nightly-queue.yml` resolves final `dev` after the candidates, once, to a full 40-character SHA and software version. Both Gate runners and both native packagers consume those outputs. Full Git history is fetched by every build consumer. `tools/build-identity.mjs` supplies the canonical identity: schema, software version, Data Version, full Git ancestor-count build number, source commit and dirty status. The source must be clean, and `dist/build-identity.json` must equal that identity before assets are staged. Workflow run ID, run attempt and pre-merge workflow SHA are separate provenance fields, never substitutes for build number or source commit.

The canonical identity may admit other valid SemVer forms. Source resolution and the full Gate still run for them; this packaging/publication lane is deliberately limited to the reserved `X.Y.Z` and `X.Y.Z-rc.N` version forms. Other forms skip native packaging and cannot become releases through this lane.

The package phase uses `doctor`, `bootstrap` and the existing native packager through `release:prepare` / `tools/package.mjs --build-only`. It does not launch the packaged application or add a Gate. The existing provider-free Journeys run earlier in the full Gate. No signing or product/provider secret is supplied to packaging.

Each native upload is named `inspection-<source-sha>-<queue-run-id>-<attempt>-<platform>`, with platform `win-x64` or `mac-arm64`. These names identify immutable nightly artifacts; they do not make stable Windows releases prereleases. Upload overwriting is disabled. The artifact retention is seven days.

| Platform | Exact nightly files | GitHub Release |
| --- | --- | --- |
| Windows x64 | `AI7-<version>-win-x64-setup.exe`, `AI7-<version>-win-x64-portable.zip`, `SHA256SUMS-win-x64.txt`, `provenance-win-x64.json` | All four files, unchanged |
| macOS arm64 | `AI7-<version>-mac-arm64-unsigned-inspection.dmg`, `SHA256SUMS-mac-arm64.txt`, `provenance-mac-arm64.json` | None |

Preparation requires an empty/absent `release/`. It refuses unexpected top-level files, redirected directories, linked/empty assets and populated Windows portable `data/`. Only the named files are staged; the checkout, build scratch trees, unpacked apps, self-check output, logs, credentials and product data are not uploaded. The portable archive is made before product launch.

Each provenance file records the canonical identity, repository, platform/architecture, package/lock/dependency-manifest hashes, exact queue run/attempt, workflow SHA, asset sizes and SHA-256 digests, plus explicit signing/notarization flags. Only macOS has `inspectionOnly: true`. These records are descriptive provenance, not signed attestations or reproducible-build claims.

Publication checks GitHub's repository/workflow/event/branch metadata, the exact attempt's final-dev jobs and their successful steps, and ordering from resolution through both Gate jobs to packaging. It separately verifies the artifact run/repository/workflow-head binding, exact source in names and canonical identity, both platforms' complete file sets, input hashes and every file's size/digest. Downloads use immutable artifact IDs. GitHub's archive SHA-256 is verified **before** parsing ZIP entries; digest mismatch is fatal, not a warning. Unexpected ZIP paths, extra/missing/expired/duplicate artifacts and changed bytes fail closed. Both platforms are verified even though only Windows files are published.

The selection job runs with contents/Actions read. Packaging has contents read only. Only the isolated publication job has contents write and Actions read; it executes trusted `dev` helper code pinned by the selection job, reads the candidate checkout as data, installs nothing and never executes downloaded artifacts. All third-party Actions use full commit pins; checkout does not persist credentials.

## Tags, retries and recovery

Direct forced, updated or deleted tag push payloads are refused. Before each release mutation, the helper resolves the current tag (peeling annotated tags) and rechecks both the source commit and tag-object SHA. The automation never creates or moves a tag. For an unpublished tag, a later completion may reconcile its **current** matching, successfully packaged source even if an earlier push was refused. This is current-tag reconciliation, not a guarantee that GitHub tag references themselves cannot be changed by administrators.

Push selection binds `after` to the exact ref object: the annotation object for an annotated tag, or the commit for a lightweight tag. GitHub's [push payload schema](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/push/event.schema.json) distinguishes that object from the peeled commit represented by `head_commit`. Replacing an annotation at the same commit is still a moved tag and is refused for that push occurrence.

The first publication assembly creates a draft bound to the exact source/tag object, canonical identity, queue run/attempt, artifact IDs/archive digests and four Windows asset digests. A serialized retry may upload only missing assets of that same assembly. Existing assets must have the expected name, uploaded state, size and GitHub-recorded digest. An unexpected, failed or changed asset stops recovery; there is no automatic delete, replacement, clobber or switch to a newer nightly build. Once the exact complete set is verified and the tag rechecked, the draft becomes a published release. Stable releases use GitHub's version/date-based latest selection; RC releases explicitly disable latest.

An already published release is a no-op only when its stored binding, current tag, canonical source identity and exact durable Release asset metadata/digests still agree. This verification does not require expired nightly ZIPs or choose a newer build. A moved tag, mismatched record or missing/changed published asset fails instead of repairing or replacing the publication.

An incomplete draft still requires its **original** unexpired nightly archives and successful attempt. Missing or expired originals stop the retry; inspect that draft and obtain an explicit recovery decision. A failed/partial native package attempt is not completed evidence; use the existing authorized queue retry process rather than joining outputs from different attempts. Nothing in this helper relaxes that process or authorizes another hosted verification occurrence.

## Local preparation and inspection

For source inspection use [local inspection](local-inspection.md); it requires no tag, GitHub release or package. Its commands remain unchanged.

Side-effect-free release-helper help:

```text
pnpm run release:prepare -- --help
```

On an authorized, supported clean checkout with full Git history, run `doctor` and `bootstrap`, then:

```text
pnpm run release:prepare -- --sha <exact-commit> --version <exact-version> --gate-run <existing-run-id>
```

This builds only the current native platform and stages named files under ignored `release/upload/`. It records the supplied Gate ID without contacting GitHub or asserting remote verification. It does not remove stale `release/` content. Use a fresh checkout or inspect known generated output before moving/removing it. Local output is never accepted in place of the nightly artifact provenance.

## Technical references

GitHub documents [workflow-run/default-branch events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run), [reusable workflow caller context and token restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations), [attempt-specific workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt), [artifact metadata, expiry and archive download](https://docs.github.com/en/rest/actions/artifacts), [Release asset digests](https://docs.github.com/en/rest/releases/assets), [release flags and latest selection](https://docs.github.com/en/rest/releases/releases#update-a-release), and [existing-tag verification](https://cli.github.com/manual/gh_release_create). GitHub's ordinary artifact download action only warns on digest mismatch; the publication helper enforces its own fatal verification as required here.
