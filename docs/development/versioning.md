# Software, data and build identity

Issue [#1015](https://github.com/zhouy1017/ai7-harness/issues/1015) unifies source, build, package and running-app identity. Release orchestration remains in [releasing](releasing.md); compatibility remains in the [Data Version decision](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md).

[ADR 0093](../adr/0093-automate-nightly-packages-and-windows-version-tag-releases.md) authorizes paired nightly native packages and Windows-only version-tag releases. Stable tags publish normal Windows releases and RC tags publish prereleases; unsigned macOS packages remain nightly artifacts until signing, hardened runtime and notarization are configured.

## Canonical inputs

Root `package.json.version` owns the software SemVer, currently `0.1.0`. Root `package.json.ai7.dataVersion` owns the existing Data Version, currently **1**. `src/service/data-version.ts` reads that value and retains the freeze, schema classification and compatibility checks. Database revision **83** and service protocol **161** keep their separate meanings. Build identity never enters a store-version ledger, backup manifest or migration decision; an ordinary rebuild does not create a software upgrade.

`pnpm run version:identity` prints this closed shape:

```json
{
  "schema": 1,
  "softwareVersion": "0.1.0",
  "dataVersion": 1,
  "buildNumber": 1234,
  "sourceCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "dirty": false
}
```

The displayed count/SHA are illustrative. `tools/build-identity.mjs` exports `readBuildIdentity(root, { requireClean = false } = {})`, returning that shape asynchronously. `buildNumber` is `git rev-list --count HEAD`: all reachable ancestors, including merged parents and HEAD itself. It is neither first-parent count nor branch height. The full SHA distinguishes commits with equal counts; the count alone is not a globally unique identifier and can fall on a different history. Detached checkouts give the same identity. No clock, host, CI run/attempt or ambient `BUILD_NUMBER` affects it. Git replacement objects are disabled and grafted history is refused.

Full Git history is a build input. A shallow clone fails with `AI7_BUILD_IDENTITY_SHALLOW_HISTORY`; fetch full history (`git fetch --unshallow` for an existing shallow clone, or checkout `fetch-depth: 0` in the existing workflows). Missing Git/history or malformed/missing package identity fails instead of producing build zero or Electron's version. Background guests receive the complete source Git bundle. No build fetches missing source history itself.

Dirty means staged, unstaged or untracked nonignored files, including submodule changes. Local `build`/`inspect` supports dirty work and labels it `本地修改（未提交）`; ignored generated outputs and dependency caches do not dirty the source. `pnpm run version:identity --require-clean` and every packaging invocation refuse dirty source with `AI7_BUILD_IDENTITY_DIRTY_SOURCE`.

## Build and runtime

`build` validates one identity, writes `dist/build-identity.json`, and embeds the same value in main, service and renderer. Main and service validate the persisted manifest against their compiled identity before opening ordinary product data. Main additionally checks build-embedded SHA-256 digests of the service, preload and renderer outputs before choosing a data root, refusing mixed files even when their software and Data Versions match. Missing, malformed or mismatched manifests or bound outputs fail startup. The service uses this software version for its unchanged compatibility records. Help › About and Settings › Data and Storage show software version, Data Version and build provenance separately; they reject a service software/Data Version mismatch. The full SHA and dirty marker also reach diagnostics and new crash records. Older crash records retain unknown provenance rather than borrowing the current build's identity; contradictory recorded software/build identities also retain unknown provenance. The service IPC shape remains unchanged.

The bound files are `main/preload.cjs`, `service/index.mjs`, `renderer/index.html`, `renderer/renderer.js` and `renderer/styles.css`. Their digests are compiled into main after those outputs are built. This detects missing/stale components at startup, including replacing a renderer with an earlier build of the same software version. It is not signing or an attestation: it does not authenticate the source, cover every dependency or detect files changed after startup validation.

Packaging rebuilds clean source, checks the persisted identity, and copies it unchanged to the packaged `dist/build-identity.json`. The staged application `package.json` also contains `ai7.dataVersion` and `ai7.buildIdentity`. Self-check reports the identity. CI run and attempt belong to release provenance outside the identity, so reruns of one clean source commit do not change it.

## Native versions and unsigned resources

`nativeBuildVersions(identity)` projects the canonical identity into native numeric constraints:

| Field | Projection |
| --- | --- |
| Windows executable/NSIS numeric version | `major.minor.patch.buildNumber` |
| macOS `CFBundleShortVersionString` | Software SemVer's numeric `major.minor.patch` core |
| macOS `CFBundleVersion` | `(1 + floor(n / 10000)).(floor(n / 100) % 100).(n % 100)` for count `n` |

For count 1234, macOS receives `1.12.34`; count 10000 becomes `2.0.0`. This reversible encoding obeys Apple's positive first component and 4/2/2 digit limits, including before software 1.0.0. The complete SemVer (including prerelease), count, Data Version, SHA and dirty flag are retained as `AI7SoftwareVersion`, `AI7BuildNumber`, `AI7DataVersion`, `AI7SourceCommit`, `AI7Dirty` in the macOS plist and in the shared manifest. See Apple's [bundle-version reference](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/TP40009249-SW18).

The admitted software core has at most four digits per component. Windows count is capped at 65535; higher counts fail packaging with `AI7_BUILD_IDENTITY_WINDOWS_VERSION_OVERFLOW`, requiring an explicitly revised encoding instead of truncation. Build identity itself retains the full safe integer count. Both `buildNumber` and `buildVersion` are passed explicitly to electron-builder so hosted environment variables cannot substitute for them.

The actual pinned `electron-builder` / `app-builder-lib` **26.15.3** implementation was inspected: `out/appInfo.js` selects explicit build fields; `out/winPackager.js` skips all editing for `signAndEditExecutable: false`, while `signExecutable: false` preserves resource edits and bypasses signing; `out/util/resEdit.js` edits PE resources through the already-locked `resedit` JavaScript dependency; `out/macPackager.js` uses explicit `bundleVersion` and `bundleShortVersion`; NSIS uses the numeric Windows projection. Thus Windows enables resource editing and disables signing. It acquires no rcedit, signing bundle or new dependency. The existing declared, digested packager archives and offline packaging boundary remain in force. macOS signing/notarization remain disabled in this development package path.

## Verification

Focused unit checks cover full merge ancestry, detached/dirty/shallow/missing source, replacement/grafted/incomplete history, identity validation, persisted/compiled disagreement, missing/stale bound components, editor version mismatch, prerelease diagnostics and historical provenance, native overflow and numeric mapping. The package unit test runs the pinned builder's real Windows resource-editing path on a synthetic PE and reads back its numeric/string resources while refusing any signing call. Run `pnpm exec vitest run tests/unit/build-identity.test.ts tests/unit/package.test.ts tests/unit/help-screen.test.ts tests/unit/diagnostics.test.ts`, then the normal `check` and `build` commands. These are developer checks, not new hosted gates. Actual package inspection and the cumulative guest Journey ladder remain the integration acceptance checks; no foreground Electron is launched for metadata inspection.
