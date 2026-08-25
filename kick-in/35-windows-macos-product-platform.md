# Windows and macOS product-platform revision

Status: **accepted product target; consistency contract and dependent platform mechanics remain proposed**

On 2026-08-21 the owner revised the post-interview product target from Windows-only to Windows and macOS with a consistent product outlook. This is a hard-to-reverse architecture change, recorded in [ADR 0027](../docs/adr/0027-support-windows-and-macos-as-one-product.md), and is not a new interview question. The original 36-question history remains evidence; its Windows-only clauses no longer state current intent.

## Recommended consistency contract — owner confirmation required

The recommended reading of “consistent product outlook” is one product rather than two platform editions. Under that proposal, Windows and macOS share:

- the exact **AI7** product identity and Chinese-first publishing role;
- one renderer, visual system, information architecture, and core feature set;
- the same Task, workflow, editorial, learning, authority, privacy, and Effect semantics;
- equivalent document import/export fidelity and long-manuscript scale obligations;
- one release version and explicit compatibility contract; and
- the same professional-editor acceptance outcomes.

The product may follow native platform conventions for menus, keyboard shortcuts, window chrome, dialogs, accessibility behavior, paths, protected credential facilities, local IPC, packages, signing, notarization, and security prompts. Those differences would be named and tested. The recommendation does not require pixel-for-pixel rendering, identical installers, or suppressing useful native behavior. None of these details becomes accepted merely because it appears here.

## Preserved decisions

- Standalone-only V1; Word integration remains excluded.
- Electron main + isolated renderer + separate Node service.
- ProseMirror over bounded manuscript windows and the 500K/1M/10M scale tiers.
- TypeScript and Node only; no embedded Python.
- No TCP listener for local product IPC.
- Windows zip portable folder and NSIS installer.
- Two concise provider-free GitHub workflow names, `pr` and `release`; no Ubuntu product or production lane.
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
| Required evidence | old single `windows-2025` job | required macOS native proof | concise two-platform topology open |

## Decisions reopened by the target change

Before Phase 0 can pass, decide:

1. the exact cross-platform consistency boundary;
2. supported macOS version and Apple Silicon/Intel policy;
3. macOS package, update, and Agent Data Root model;
4. Apple signing/notarization and Gatekeeper posture;
5. the smallest `pr` and `release` topology that produces required evidence on both targets;
6. per-platform Agent Data Root enforcement or an explicit revision of that guarantee;
7. Keychain-backed credential storage and user-initiated legacy credential transfer; and
8. native-input, shortcut, accessibility, dialog, document-fidelity, and long-manuscript acceptance evidence on both systems.

Harness is reference evidence, not the product answer. At the audited pin its local sandbox offers Windows ACL and macOS Seatbelt backends, but neither is a whole-process privacy/egress boundary, and Harness has no accepted OS-keychain credential provider for AI7 to inherit.
