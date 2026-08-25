# V1 platform revision freeze handoff

Status: **frozen candidate/reference; not canonical `main` and not the v2 architecture line**

## Identity and scope

- Base commit: `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` (`c8cbe26`).
- Working branch: `docs/1-windows-macos-phase0`.
- Artifact purpose: finish the already-accepted Question 16 evidence rules, record the Windows-and-macOS target that is now integrated as [ADR 0028](../docs/adr/0028-support-windows-and-macos-as-one-product.md), and preserve the resulting historical Phase 0 status.
- This branch makes no product implementation, scaffold, dependency, CI, issue decomposition, UI/UX, isolation, retrieval, or Harness-pin choice. It is a reviewable v1 reference candidate only.

## Accepted inputs recorded here

1. Exact quotations are verified against authoritative original text.
2. Source-derived factual claims cite exact Evidence Links.
3. Current or external factual claims use timestamped research evidence.
4. Editorial interpretation is identified as judgment rather than fact.
5. Creative or promotional synthesis remains generated content, while quoted, factual, and canonical subclaims follow their own evidence rules.
6. AI7 targets Windows and macOS with the owner's accepted phrase “consistent product outlook.” The detailed consistency contract and native mechanics remain proposed/open.

## Changed records

- Standing/reference records: `AGENTS.md`, `HANDOFF.md`, `PROGRESS.md`, `GLOSSARY.md`, and `UBIQUITOUS_LANGUAGE.md`.
- Decision records: ADRs 0005, 0012, 0013, 0014, 0017, 0020, 0022, 0023, and 0024, plus new ADR 0027.
- Domain/policy records: Editorial and Execution contexts and the Factual Verification Policy.
- Design records: `kick-in/00`, `01`, `02`, `03`, `04`, `05`, `06`, `08`, `09`, `17`, `21`, `22`, `24`, `25`, `26`, `28`, `30`, `32`, `33`, `34`, `35`, `36`, this freeze handoff, and the kick-in indexes.
- Dated handoff aids: `handoff20260817/KICKOFF-PROMPT.md`, `PROJECT-OVERVIEW.md`, and `SESSION-HANDOFF.md`; their older Windows-only content remains historical where explicitly labeled.

## Reusable assets

- The Q16 textual-fidelity/factual-truth separation, evidence classes, bilingual terms, and Factual Verification Policy rules.
- Platform-neutral Book, manuscript revision, proposal, Effect, Task Ledger/Harness Session Ledger, policy, learning, and authority boundaries.
- The narrow AI7-over-Harness ownership model, exact-pin discipline, custom-composition rule, and no-default-coding-product boundary.
- The documentation checks: one definition owner per glossary term, active-link integrity, accepted/proposed status discipline, and the one-line `CLAUDE.md` wrapper.

These assets may be reused by a later architecture only after checking the later line's accepted ADRs. This candidate does not outrank canonical `main` or a subsequently accepted v2 decision.

## V2-sensitive assumptions and migration cost

The v1 candidate retains Electron + ProseMirror, a three-process local Standalone topology, no TCP listener, an rc.6 package-consumption baseline, Windows zip/NSIS channels, two concise workflow names, and Word exclusion. A v2 architecture that changes the shell/editor, authority location, surface boundary, distribution model, Harness consumption, or supported-platform contract must treat these as incompatible assumptions rather than silently inheriting them.

The earlier Windows-only platform clauses and single-Windows verification topology are superseded inside this candidate. Migrating the candidate to another architecture line would require reconciling standing rules and ADR precedence, redoing platform/package/security evidence, revising phase gates and release records, and retesting document/editor outcomes; the platform-neutral domain and Q16 assets should not be rewritten merely because the shell changes.

The separate UI exploration branch is not canonical. It may depend on the platform-neutral domain contracts and professional-editor outcomes here, but any assumption that its layout, shell, native controls, IPC, package format, or cross-platform parity is already accepted conflicts with this candidate and requires Commander resolution.

## Unresolved risks carried forward

- Windows and macOS process/filesystem isolation and the truthful scope of the Agent Data Root guarantee.
- The exact cross-platform consistency contract and UI/platform implications, including Chinese input, shortcuts, accessibility, dialogs, document fidelity, and long-manuscript evidence.
- macOS minimum version/CPU policy, package/update/data-root model, Gatekeeper signing/notarization, and the concise two-platform CI/release evidence shape.
- Exact local IPC and Protected Secret Store/Credential Broker adapters on each platform.
- The Harness rc.5-to-rc.6 candidate-package, Session/replay/tool-guard, installed-closure, notices, and Electron/Node ABI audit; rc.7/rc.8 remain evidence only.
- Retrieval strategy, calibrated performance budgets, and final editor confidence remain at their existing explicit deferrals.

## Frozen next action

Return this locally committed candidate to the Project Commander. The next activity is separately authorized architecture exploration that resolves or explicitly defers the named risks and reconciles any UI-branch dependency. It is not automatic implementation, scaffolding, issue decomposition, publication, or integration of this branch.
