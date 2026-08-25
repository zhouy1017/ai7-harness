# Windows and macOS product-platform revision

Status: **accepted product target and consistency contract; concrete macOS mechanics remain deferred**

On 2026-08-21 the owner revised the post-interview product target from Windows-only to Windows and macOS with a consistent product outlook. On 2026-08-25 the owner directed all product-scope documents to be unified on that target. This hard-to-reverse architecture decision is recorded in [ADR 0028](../docs/adr/0028-support-windows-and-macos-as-one-product.md) and is not a new interview question. The original 36-question history remains evidence; its Windows-only clauses no longer state current intent.

## Accepted consistency contract

“Consistent product outlook” means one product rather than two platform editions. Windows and macOS share:

- the exact **AI7** product identity and Chinese-first publishing role;
- one renderer, visual system, information architecture, and core feature set;
- the same Task, workflow, editorial, learning, authority, privacy, and Effect semantics;
- equivalent document import/export fidelity and long-manuscript scale obligations;
- one release version and explicit compatibility contract; and
- the same professional-editor acceptance outcomes.

The product may follow native platform conventions for menus, keyboard shortcuts, window chrome, dialogs, accessibility behavior, paths, protected credential facilities, local IPC, packages, signing, notarization, and security prompts. Those differences are named and remain subject to the same product outcomes. For existing-file collisions, native save/copy workflows may use platform wording and layout but normalize to exact rename, cancel, or replace results; AI7 still owns Local Export Preparation, approval before commit, per-file receipt, reconciliation, and history. The contract does not require pixel-for-pixel rendering, identical installers, or suppressing useful native behavior.

## Preserved decisions

- Standalone-only V1; Word integration remains excluded.
- Electron main + isolated renderer + separate Node service.
- ProseMirror over bounded manuscript windows and the 500K/1M/10M scale tiers.
- TypeScript and Node only; no embedded Python.
- No TCP listener for local product IPC.
- Windows zip portable folder and NSIS installer.
- One logical provider-free E2E Functional Gate runs the same supported journey IDs on Windows and macOS; workflow naming or release automation creates no second product-proof surface.
- Exact Harness pins, a narrow package/tool surface, and AI7 ownership of editorial and business authority.

## Platform adapter boundary

| Concern | Windows accepted/current evidence | macOS required peer | Current status |
| --- | --- | --- | --- |
| Local IPC | stdio or named pipe | stdio preferred; Unix-domain socket is one candidate | Three-process/no-TCP invariant accepted; exact macOS carrier and protocol adaptation open |
| Application data | portable sibling `data/` or `%LOCALAPPDATA%\AI7` | platform application-support location or an explicitly designed self-contained channel | macOS decision open |
| Secrets | Credential Broker over Windows Credential Manager/DPAPI | Credential Broker over Keychain | macOS provider and transfer proof open |
| Distribution | zip folder + NSIS | native package/archive and update behavior | macOS decision open |
| Trust | Windows signing deferred; SmartScreen cost recorded | Gatekeeper plus signing/notarization policy | must be decided independently |
| Filesystem confinement | Harness Windows ACL path is partial | Harness Seatbelt path covers file writes only and depends on deprecated `sandbox-exec` | neither proves the accepted Agent Data Root target |
| Existing-file collision | Native Windows save/copy rename, cancel, or replace interaction | Native macOS save/copy rename, cancel, or replace interaction | presentation differs; both feed the same exact AI7 preparation/approval/commit/receipt semantics and no roaming filesystem |
| Standing E2E | Windows launch and complete journeys | macOS launch and the same supported outcomes | one logical provider-free E2E Functional Gate on both platforms; no separate certification programme |

## Deferred platform implementation decisions

The following must be decided before the corresponding implementation is complete, but none reopens the accepted product scope:

1. the exact cross-platform consistency boundary;
2. supported macOS version and Apple Silicon/Intel policy;
3. macOS package, update, and Agent Data Root model;
4. Apple signing/notarization and Gatekeeper posture;
5. the smallest CI topology that executes the one logical E2E Functional Gate on both targets;
6. per-platform Agent Data Root enforcement or an explicit revision of that guarantee;
7. Keychain-backed credential storage and user-initiated legacy credential transfer; and
8. the native-input, shortcut, accessibility, dialog, local-export collision, document-fidelity, and long-manuscript adaptations on both systems.

Harness is reference evidence, not the product answer. Its platform helpers do not by themselves establish a whole-process privacy/egress boundary. AI7 capability and service facades remain authoritative, and the Credential Broker requires platform adapters for Windows Credential Manager and macOS Keychain.

Issue #8 Batch 5 records the local-export collision refinement in [ADR 0039](../docs/adr/0039-delegate-local-export-collisions-to-native-os-workflows.md). Native cancellation attempts no file Effect; a changed final target or disposition invalidates preparation and approval; uncertainty stops automatic retry; and a successful local receipt proves neither external sending nor publication.
