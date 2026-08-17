# Source Provenance

Status: **audited snapshot**

Audit date: 2026-08-15 (Asia/Shanghai)

## Pinned sources

| Source | Visibility and lineage | Audited revision | License at revision | Planning role |
| --- | --- | --- | --- | --- |
| [AI7 Reborn](https://github.com/zhouy1017/ai7-reborn-ai) | Private, independent repo; default branch `dev` | `3e6e9ac772b7f07832154fa39d7de8a4deca51b1` | No `LICENSE`, `COPYING`, `NOTICE`, or package license | Product/domain reference, selective migration source, behavioral evidence |
| [Zhou DeepSeek Harness fork](https://github.com/zhouy1017/deepseek-harness) | Public fork of `deepseek-ai/deepseek-harness`; no fork-only commits at audit | `47f943859bef60e4160492346772ded9b24f765a` | MIT, plus third-party notices and separately licensed vendored/native content | Candidate execution foundation |
| [DeepSeek Harness upstream](https://github.com/deepseek-ai/deepseek-harness) | Public upstream | Same revision as the fork at audit | MIT at this revision | True upstream and upgrade source |

## Repository facts that affect architecture

### AI7 Reborn

- It is already a second-generation, concept-preserving redesign; the still-older product under `docs/reference/current-ai7/` is another legacy layer.
- The audited tree contains 842 tracked files, including 360 tests, 198 docs, 13 built-in skill manifests, an Electron surface, a Python shared runtime, Windows installation components, and a C# Word COM add-in.
- Its history is active and moving: 426 commits from 2026-07-04 through the audited revision. Design documents must always name an exact source SHA.
- `dev` is the meaningful branch; `master` and `release` were roughly 300 commits behind at audit.
- No declared license means ownership must be recorded before copied implementation or visual assets enter a separately licensed or public repository.

### DeepSeek Harness

- The audited package family is `0.1.0-rc.5`; its README explicitly warns of compatibility-breaking changes.
- It is a large pnpm monorepo with roughly 241 package manifests and a pluginized Host/Client split.
- The current fork adds no value beyond an owner-controlled pointer; maintaining a deep fork would inherit a large upstream merge burden.
- The source history includes older BSD-3-Clause snapshots, current MIT material, a BSD-licensed native component, third-party notices, and vendored payload-specific obligations. Copying source is more complex than consuming current published packages.
- Some official third-party payload authorization may be identity/distribution scoped and must not be assumed to cover a newly branded AI7 distribution.

## Compatibility observations

- Both projects use ESM TypeScript 6.0.3.
- Their Node requirements overlap at Node 22.19.x: AI7 requires `>=22.12.0`; Harness requires `^22.19.0 || >=24.0.0`.
- Build governance does not align: AI7 uses npm/package-lock, Electron, Python, C#/VSTO, and Windows packaging; Harness uses pnpm, Host/Client faces, many public packages, and web/headless/ACP entry points.
- Git histories have no shared commits. A history merge is optional provenance machinery, not a technical upgrade path.

## Planning default

Start a fresh, initially private AI7 repository and record both pins as external sources. Consume pinned Harness packages or a pinned build artifact before considering source vendoring. Keep the private AI7 history outside any public fork network until visibility, license, and reuse authority are accepted.

This is a recommendation, not an accepted decision.

## Source-copy rules

No product source should be copied during design. In implementation, every migrated asset should add a row to a provenance ledger containing:

| Field | Meaning |
| --- | --- |
| Target path | Location in the new project |
| Source repository and path | Exact origin |
| Source commit | Immutable SHA |
| Treatment | Reused, adapted, rewritten from contract, fixture-only, or documentation-only |
| Authorization/license | Why reuse and redistribution are permitted |
| Behavioral evidence | Test, journey, or contract that proves intent |

## Accepted legacy-data transfer boundary

Source reuse and runtime-data migration are separate. The new production store receives no legacy Books, manuscripts, histories, indexes, memory, workflows, decisions, Effects, or UI/application state. The only runtime-data exceptions are a user-initiated protected API-credential transfer, reviewed mock-provider evidence, and explicitly selected test-only sample Books, as specified in [Legacy Data Migration Boundary](./24-legacy-data-migration-boundary.md). Every other source artifact remains documentation/evidence or requires normal source-code authorization rather than a data importer.

## History options

| Option | Benefit | Cost / risk | Initial recommendation |
| --- | --- | --- | --- |
| Fresh repo + provenance ledger + pinned dependency | Clean AI7 identity, no accidental private-history disclosure, narrow upgrade boundary | Requires disciplined traceability | **Recommended** |
| Fork Harness and add AI7 packages | Preserves upstream GitHub network and full ancestry | AI7 appears Harness-first; large merge burden; private AI7 history still separate | Reserve as fallback |
| Merge unrelated histories | All commits available in one graph | Huge graph; can expose private history; licensing and authorship complexity | Do not use by default |
| Copy both source trees | Fast apparent start | Worst upgrade, provenance, duplication, and security posture | Reject |
