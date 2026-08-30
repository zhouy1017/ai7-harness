---
status: accepted
---

# Select the macOS V1 distribution and data-location profile

On 2026-08-28 the Owner selected the macOS V1 profile that ADRs 0023 and 0028 had left open. AI7 supports macOS 15 or later on Apple Silicon arm64 under the stable bundle identifier `io.github.zhouy1017.ai7`. This is the macOS adapter for the same AI7 product, data meaning, authority model, and supported journeys as Windows; it is not a Mac edition.

## Distribution and update posture

The end-user macOS distribution is one direct-download DMG containing the AI7 `.app`. A distributable build must be Developer ID signed, use the hardened runtime, and be notarized. Updating is a manual replacement of the application while preserving product data. V1 has no Mac App Store channel, PKG channel, portable-data mode, or automatic updater.

This selection records product and release requirements; it does not itself authorize access to a signing secret, packaging, signing, hardening, notarization submission, upload, publication, release, or promotion to `main`. A source-checkout runtime identifies itself truthfully and never claims to be the packaged/notarized DMG.

## Product Data Location

Product Data Location is the user-facing projection of the one canonical Agent Data Root shared by one running AI7 application/service instance and all of its windows. It contains AI7-controlled persistent business and technical state, including governed manuscript derivatives. Application binaries, OS-disposable state, and the Protected Secret Store remain outside it.

On macOS the canonical Agent Data Root is the operating-system-resolved per-user Application Support location for bundle identifier `io.github.zhouy1017.ai7`. It is never placed beside the `.app`. An unavailable, redirected, or otherwise noncanonical location fails closed with exact remediation guidance; there is no silent fallback, arbitrary/custom/network root picker, or cross-channel migration protocol.

`设置 > 数据与存储` presents the actual platform, runtime/distribution form, actual Product Data Location, bounded local-footprint information, and credential separation. `查看数据位置` asks Electron main to reveal the already-owned root in Finder. The renderer supplies no path, and reveal grants no location edit, migration, export, broader filesystem scope, or backup guarantee.

Model Service secrets remain outside product data in macOS Keychain behind the Credential Broker. This decision requires the separation disclosure only; credential references, Keychain item operations, role-first setup, and Provider behavior remain owned by their separate authority.

## Compatibility and consequences

Windows retains ADR 0023's zip-portable and NSIS channels, writable-portable placement, `%LOCALAPPDATA%\AI7` installed/fallback placement, and Windows Credential Manager separation. Native adapters may differ while the Book, Revision, Product Data Location, privacy, durability, and supported-journey meaning remains equivalent.

The private stdio service transport and no-TCP topology remain unchanged. This decision creates no URL scheme, file association, external deep link, data migration, credential operation, package implementation, release action, or new validation gate. ADR 0027's one provider-free E2E Functional Gate remains the sole standing automated engineering test surface.
