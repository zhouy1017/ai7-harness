---
status: accepted — proposed by the Commander on 2026-10-24 at the Owner's request (「现在开始给本项目制定一套x.y.z为基础的版本号管理机制，并且确保在打包发布与内部管理都统一」) and accepted by the Owner the same day (「同意建议并开始工作」) with every recommended choice, which this record names as its acceptance
date: 2026-10-24
deciders: Owner
amends: ADR 0093 §One identity, three meanings (adds when the software version is raised and the version ledger; identity and publication rules unchanged); ADR 0054's Initial v1.0.0 Development Milestone Boundary (clarified as a development record that is not software version 1.0.0); the development plan's programme naming; Git conventions §Tags and releases; Change Brief §Pull-request closure; Orca dispatch §5
---

# 0098 · Adopt one x.y.z version across releases and internal management

On 2026-10-24 the Owner asked for an x.y.z-based version-management scheme that is the same for packaging and releases as for internal management, and accepted the scheme below with every recommended choice. Until this record three namings coexisted: root `package.json` 0.1.0 with the build identity and the `vX.Y.Z` tag rule of [ADR 0093](0093-automate-nightly-packages-and-windows-version-tag-releases.md) (no tag, release or GitHub milestone had ever been created), the development plan's "v3.2-R2" and "Wave N" names, and the historical "Initial v1.0.0 Development Milestone" boundary of [ADR 0054](0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md), which is a development record and not a release. One version now names the software everywhere.

## Decision

### 1 · One version, owned by `package.json`

The software version is the SemVer-shaped `x.y.z` in root `package.json` (`version`), as ADR 0093 already states. It is the one name used by the source, the build identity and native package metadata, the GitHub Release tag (`vX.Y.Z`, prerelease `vX.Y.Z-rc.N`), the development plan's wave targets, PROGRESS's checkpoint, GitHub milestones and the placement of feature and slice Issues. Data Version keeps its separate compatibility meaning ([ADR 0079 §1](0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md)) and is shown beside the software version, never folded into it. The build number (commit count) and the source commit identify a build of a version; a nightly build has no version of its own.

### 2 · What raises which component

- **x (major)** — a new product generation the Owner declares, or an incompatible Data Version change that needs migration with backup. Pre-1.0 the product is `0.y.z`.
- **y (minor)** — one integrated wave. Every wave's final integration PR into `dev` raises `y` by one; features enter the software only through a minor increment.
- **z (patch)** — a fix-only integration between waves, or a hotfix of a released version. A patch never carries a feature.
- **`-rc.N`** — the release candidates that precede a stable tag of the same `x.y.z`, as ADR 0093 publishes them.

### 3 · The route to 1.0.0

The product stays `0.y.z` until Wave 23's acceptance: **Wave 21 → 0.2.0**, **Wave 22 → 0.3.0**, **Wave 23 → 1.0.0**, with `1.0.0-rc.N` before the Owner accepts. The "v3.2" planning name is retired; the plan names its programme by these versions. The Initial v1.0.0 Development Milestone Boundary of ADR 0054 (`c2f4fff3`, 2026-10-18) keeps its name as a historical development record and is not software version 1.0.0; nothing in it is renamed, and nothing about it changes.

### 4 · Process

- **Wave integration raises the version.** The Commander's wave-to-`dev` integration PR raises `package.json` to the wave's version, adds the row to the version ledger in [versioning](../development/versioning.md) (version, status, wave or scope, integrated `dev` commit, tag/release state), states the version in PROGRESS and in the Change closure's `Version` line, and the nightly queue packages that commit under that version as ADR 0093 already does.
- **The Owner tags.** A stable or rc tag is created only by the Owner (or under an authorization the Owner records), at the exact integrated commit whose `package.json` carries that version, and publication follows ADR 0093 unchanged.
- **`main` is the release line.** After each stable tag, `main` fast-forwards to the tagged commit; promotion remains the Owner's action or the Owner's recorded delegation, and `main` carries nothing but released versions.
- **Internal management uses the same names.** A GitHub milestone named by version (0.2.0, 0.3.0, 1.0.0) groups the feature and slice Issues of its wave; a milestone closes when its version is integrated. The development plan and PROGRESS name waves with their target versions.
- **A local check keeps the names in agreement.** `tools/check-version.mjs`, run by `pnpm run check`, fails when `package.json` disagrees with the ledger's newest integrated row, when PROGRESS does not state that version as integrated and the ledger's first planned row as next, or when the plan lacks a planned row's wave → version pair. It is a developer command, not a hosted gate ([ADR 0062](0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md)).

## Consequences

- Version 0.1.0 names everything integrated through Wave 20 and the governance wave that carries ADR 0097 and this record; Wave 21's integration PR is the first to raise `package.json`, to 0.2.0.
- Readers see one number: a release note, an installer's properties, 设置 › 数据与存储, PROGRESS, the plan and a milestone all say the same version, and Data Version stays beside it as the compatibility fact.
- A hotfix on a released version takes a patch number and its own tag; the nightly queue, the publication helper and the identity checks need no change for it.
- Planning names that were not versions ("v3.2", "Wave N" alone) disappear from current documents; history keeps them.

## Clauses amended

| Owner | Affected clause and replacement |
| --- | --- |
| [ADR 0093](0093-automate-nightly-packages-and-windows-version-tag-releases.md) §One identity, three meanings | Unchanged identity; this record adds when `package.json` is raised (§2, §4) and the version ledger. |
| [ADR 0054](0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) Initial v1.0.0 Development Milestone Boundary; [milestone record](../development/milestone-1.0.0-scope.md) | A development record, not software version 1.0.0 (§3); the term and the record are unchanged. |
| [Development plan](../development/development-plan.md) programme naming and wave items | Waves carry their target versions; "v3.2" is retired (§3); the integration contract states the bump-and-ledger rule (§4). |
| [Versioning](../development/versioning.md) | Gains the scheme and the version ledger (§4). |
| [Git conventions](../agents/git-conventions.md) §Tags and releases; [Change Brief](../agents/change-brief.md) §Pull-request closure; [Orca dispatch](../agents/orca-dispatch.md) §5 | The tagged version equals `package.json` at that commit, raised at wave integration; `main` is the release line; the closure records the version; the Commander raises the version in the integration PR (§4). |
| [PROGRESS](../../PROGRESS.md), [README](../../README.md), documentation routers | State the integrated and next versions and route to this record. |

## What this record does not do

It creates no tag, release, milestone or `main` promotion by itself; it changes no build identity, native projection, nightly or publication mechanics; it does not rename the historical milestone record or ADR 0054's term; it grants no product authority.
