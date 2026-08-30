---
status: accepted
---

# Support Windows and macOS as one AI7 product

## Decision

AI7 V1 supports Windows and macOS as one Chinese-first Standalone desktop product. This is one product identity and one product contract, not separate Windows and Mac editions. Both platforms share the exact **AI7** name, professional-publishing purpose, domain and authority semantics, workflows, core feature set, document-fidelity and data-compatibility contracts, long-manuscript obligations, and user-visible UI/UX outcomes.

Native variation is explicit and bounded. Menus, shortcuts, window chrome, dialogs, accessibility integration, filesystem locations, Protected Secret Store adapters, local IPC carriers, packages, signing/notarization, and OS security prompts may follow each platform's conventions. Such variation may not remove a core journey, weaken authority or privacy, introduce silent document loss, change data meaning, or create a lower undisclosed support tier. Pixel identity and identical installers are not required.

The accepted Electron three-process architecture, ProseMirror bounded editor, TypeScript/Node runtime, Standalone-only scope, Word exclusion, and no-TCP local boundary apply on both platforms. Windows retains its zip-portable and NSIS channels. [ADR 0052](./0052-select-the-macos-v1-distribution-and-data-location-profile.md) selects macOS 15+ on Apple Silicon arm64, stable bundle identifier `io.github.zhouy1017.ai7`, a direct-download Developer ID-signed/hardened/notarized DMG, manual application replacement, and the OS-resolved per-user Application Support Agent Data Root with no silent fallback. macOS Keychain remains the Protected Secret Store; credential operations are separately governed. Private stdio remains the current local IPC carrier.

Engineering validation remains minimal under ADR 0027: one logical provider-free E2E Functional Gate executes complete supported journeys and observed-bug regressions on Windows and macOS. Adding macOS does not authorize separate unit, integration, contract, accessibility, performance, security, package, signing, or release-proof gates.

AI7 capability and service facades remain the enforceable product boundary on both platforms. No current Harness sandbox mechanism is assumed to provide whole-process filesystem, network, or process confinement merely because a platform adapter exists.

## Later refinement

[ADR 0039](./0039-delegate-local-export-collisions-to-native-os-workflows.md) applies the native-variation rule to local-export collisions: Windows and macOS may use their own save/copy wording and layout, but both normalize to exact rename, cancel, or replace outcomes while AI7 retains the same preparation, approval-before-commit, per-file receipt, and ambiguity semantics.

[ADR 0052](./0052-select-the-macos-v1-distribution-and-data-location-profile.md) resolves the macOS V1 distribution and data-location mechanics previously deferred here. It preserves this ADR's one-product contract and does not authorize packaging, signing-secret access, release, or a new platform gate.

## Supersession

This ADR supersedes every active Windows-only product-scope clause in ADRs 0013, 0014, 0023, and 0024 and in their dependent design notes. Historical quotes and frozen artifacts may retain the old decision only when clearly labeled as superseded evidence. It does not change Windows-specific channel decisions; ADR 0052 supplies the accepted later macOS refinement.

The Phase-0 source branch originally allocated this platform decision as ADR 0027. The `design-doc` aggregate renumbered it to ADR 0028 because ADR 0027 was already the active minimal-E2E decision; the original path and content remain reachable at `docs/1-windows-macos-phase0@9606891`.
