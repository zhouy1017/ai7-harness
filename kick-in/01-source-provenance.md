# Source Provenance

Status: **audited snapshot**

Audit date: 2026-08-15 (Asia/Shanghai)

## Pinned sources

| Source | Visibility and lineage | Audited revision | License at revision | Planning role |
| --- | --- | --- | --- | --- |
| [AI7 Reborn](https://github.com/zhouy1017/ai7-reborn-ai) | Private, independent repo; default branch `dev` | `3e6e9ac772b7f07832154fa39d7de8a4deca51b1` | No `LICENSE`, `COPYING`, `NOTICE`, or package license | Product/domain reference, selective migration source, behavioral evidence |
| AI7 Redesign (local `codebase/ai7-redesign`) | Private; branch `main`; **strict ancestor of AI7 Reborn** | `fc2f4d85afd2a5372c89f3c755727df54b1b2cb0` (2026-07-04) | Same — no declared license | Authorized copy source, but holds nothing unique |
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
- **`0.1.0-rc.5` was never published to npm.** Verified 2026-08-17: the ladder runs `0.0.1-rc.1 → rc.2 → rc.3 → rc.5 → 0.1.0-rc.2 → rc.3 → rc.6`, skipping rc.4 and rc.5 of the 0.1.0 line. The audited commit is therefore not installable, and Question 30 sets the **consumed baseline to `0.1.0-rc.6`** while retaining `47f9438` as the audited reference. These are two different artifacts and must not be conflated.
- The local upstream audit on 2026-08-21 identifies the rc.6 package-release commit as `15148dbd9a1d1f1ef1a26e5749b32af0cd663935`. GitHub now exposes pre-release tags/releases `dsh-v0.1.0-rc.7` at `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` and `dsh-v0.1.0-rc.8` at `141eb6fef83422698aef7a981029e843e8161534`. AI7 has adopted neither. Commit `7e95a00c8a5eed37fc8d16487b6a1a9b772b075c` in the later line contains a replay-state alignment fix relevant to max-token tool-call Sessions; it is upgrade evidence only.
- The broad source audit was performed at rc.5, not at the accepted rc.6 package artifact. Phase 0 therefore requires an exact rc.5-to-rc.6 selected-package and extension-seam delta audit before dependencies are installed; the accepted pin is not permission to skip that comparison.
- At the audited source, `packages/sandbox/sandbox-windows-acl/README.md` classifies Windows enforcement as partial. `packages/sandbox/sandbox-local/README.md` limits its sandbox vocabulary to file-write modes: the macOS Seatbelt backend does not restrict reads, network, or process visibility and relies on deprecated `sandbox-exec`. `packages/credentials/credentials-local/README.md` explicitly does not provide an OS-keychain security boundary. These are source constraints, not AI7 platform implementations.
- The earlier no-tags/no-releases finding is superseded: upstream created the two pre-releases above on 2026-08-17 and 2026-08-19. They improve provenance visibility but do not make a moving release name an AI7 dependency contract.
- Registry dist-tags remain inconsistent. On sampled AI7-relevant packages, `next = 0.1.0-rc.8`; `latest` remains `0.0.1-rc.1` for Session, sandbox-local, and credentials-local, while agent-loop is `0.1.0-rc.6`. Pins must be exact versions, never ranges or dist-tags. `@deepseek-ai/cordis` publishes separately.
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

**Partially accepted on 2026-08-17.** By owner instruction, this design room was initialized with a fresh unrelated history and published as private `zhouy1017/ai7-harness` on branch `main`. Neither input repository's history was merged and no product source was copied; the initial commit contains 58 Markdown documents.

**Fully accepted at Question 27.** AI7 is proprietary with all rights reserved to the sole rights-holder (`LICENSE`), and that same owner is the sole rights-holder of the private predecessor and authorizes reuse of its code, documentation, tests, and fixtures for AI7. Source copying is no longer blocked on authority — the per-asset provenance ledger below, sanitization review, and provider-terms checks all still apply, and upstream third-party obligations must be verified per component rather than assumed to extend to an AI7-branded distribution.

Sample manuscripts are authorized separately and more narrowly: real manuscripts, usable for AI7 while never committed, distributed, or publicly released without permission. Sending their content to a configured Model Provider is permitted controlled processing under the Provider Processing Policy and Plan Envelope; it is not public release. See [ADR 0016](../docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md).

### Authorized copy sources

Both local predecessor checkouts may be read and copied from as needed: `C:\Users\Chooo\codebase\ai7-reborn-ai` and `C:\Users\Chooo\codebase\ai7-redesign`.

`ai7-redesign@fc2f4d8` was verified to be a **strict ancestor** of `ai7-reborn-ai@3e6e9ac` — its HEAD commit is reachable from the reborn HEAD, and `ai7-reborn-ai/package.json` still declares `"name": "ai7-redesign"`. AI7 Reborn is therefore the continuation of the same line, not an independent project, and everything in the redesign checkout already exists in the reborn history at or before that commit. Prefer the audited `ai7-reborn-ai` pin; use the redesign checkout only as a convenient earlier snapshot.

**AI7 Redesign was never audited.** No keep/adapt/drop analysis, capability inventory, or behavioral-evidence review was performed against it. Its authorization to be copied from is not a statement that its contents have been evaluated.

Manuscripts are excluded from this grant. They are governed by [ADR 0016](../docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md) and never enter any repository.

The upstream-consumption strategy is accepted by Question 30 and ADR 0020: exact public npm pins, no fork or vendored source, and only the justified package subset. The candidate subset, rc.5-to-rc.6 seam delta, and two-platform installed closure remain mandatory Phase 0 audit outputs rather than permission to bootstrap this repository.

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
