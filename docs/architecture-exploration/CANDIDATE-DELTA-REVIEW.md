# Candidate Handoff Delta Review

Status: **independent delta review complete; no architecture decision made**
Inputs: Commander-curated summaries of initial platform head `docs/1-windows-macos-phase0@23df3c8` and UI head `docs/2-ai7-ui-ux@f877816`
Review task: `01a02278-cdc5-7c81-a08d-490b8b76bc26`

The Reviewer did not read either Worker transcript, branch, or worktree and made no repository or external change. Phase 0 remains **NOT PASSED**.

After this delta report, exact-head review found bounded freeze-integrity defects in both inputs. Platform final head `9606891` and consolidated UI final head `587d645` corrected only those defects and each passed fresh exact-head Standards and Spec review with zero findings. These corrections do not change this report's cross-candidate architecture analysis; both lines remain local and noncanonical.

## Changes to Round 1

- Root tensions and proposed principles are unchanged, but the two candidate handoffs provide stronger evidence.
- Platform-neutral domain/execution contracts are reusable across both lines.
- The UI candidate no longer needs wholesale revalidation: requirements, journeys, and state separation divide into Keep, Revalidate, and Evidence-only units.
- Windows+macOS remains a candidate premise until canonical promotion; native mechanisms remain Revalidate/Spike.
- Candidate admissibility is complete. Product consistency/UI parity is now first, exact Harness `rc.6` composition is second, and OS isolation is third because isolation must test the actual executable/tool/process surface.
- Freeze criteria now explicitly include professional-editor usability, native accessibility, and the Policy Document visibility/activation boundary.

## Cross-candidate matrix

| Platform candidate | UI/UX candidate | Relationship | Required resolution |
| --- | --- | --- | --- |
| One Windows+macOS product; parity undefined | Windows paths, NSIS/portable, Narrator, dialogs, DPI, and IME assumptions | Direct tension | Define product-wide outcomes versus OS adapters; universalize none of the Windows mechanics. |
| Platform-neutral Book/proposal/Effect/Plan/ledger contracts | Separate evidence, authorization, proposal/review, receipt, signoff, and release states | Reinforcement | Preserve as shared product semantics. |
| IPC, secrets, isolation, and outbound enforcement open | Exact scope and outbound-data visibility are UI hypotheses | Dependency | UI can display only what runtime enforcement proves. |
| Electron, ProseMirror, process, store, and IPC need revalidation | Editor-first and long-manuscript journeys are reusable | Dependency | Preserve outcomes while revalidating mechanisms. |
| Packaging, data, update, signing, and notarization open | Windows portable/path behavior appears in the prototype | Contradiction | Replace channel/path assumptions with platform-neutral concepts plus native adapters. |
| Cross-platform verification open | Browser prototype is internally clean | Evidence mismatch | Browser health is not native behavior, security, performance, accessibility, usability, or release evidence. |
| Native platform mechanics open | Raw Figma frames; no native component system | Dependency | Define parity/accessibility contracts before native components. |
| Editor, performance, and retrieval open | IME/accessibility/long-manuscript journeys lack professional sessions | Evidence gap | Separate native technical proof from professional-editor usability. |
| Policy contracts reusable | Policy visibility/activation conflict remains | Semantic tension | Separate editor-visible decisions/notices from developer-only assets and composition. |
| Q16 evidence classes recorded in the candidate | UI separates evidence from authority/outcome | Reinforcement | Preserve exact evidence-class distinctions through review workflows. |

## Packet disposition

### Keep as constraints or hypotheses

- Q16 evidence-class record and platform-neutral invariant/disposition table;
- 79-requirement traceability ledger and fourteen-journey catalog;
- evidence/authorization/proposal/review/receipt/signoff/release separation;
- exact scope/outbound-data visibility;
- proposal-first exact-pin mutation and recovery/task distinctions; and
- Chinese IME, accessibility, long-manuscript, and usability-gate requirements.

“Keep” means retain in the review packet, not silently promote candidate wording into canonical documents.

### Revalidate

- Windows+macOS product target and parity proposal;
- Electron/ProseMirror/three-process/local-IPC assumptions;
- exact `rc.6` package subset;
- packaging/data/update/signing/notarization options;
- Book-first/global-queue and editor-first/contextual-inspector hypotheses;
- information architecture, state tables, microcopy, visual tokens, and platform interactions; and
- Policy Document visibility/activation.

### Evidence-only

- candidate commit identities and reduced-independence review reports;
- 79/79 trace, journey coverage, link/syntax/diff/browser checks;
- raw Figma/HTML/A-B-C design history; and
- candidate risk/open-question registers.

### Reject as v2 inheritance

- fixed A/B/C geometry or raw Figma as product/component contracts;
- Windows-specific paths, installer/portable behavior, Narrator, dialogs, DPI, or IME as cross-platform rules;
- UI-derived runtime, persistence, or security claims;
- browser-clean results as native product evidence;
- any claim that either candidate passed Phase 0; and
- any equivalence between audited `rc.5` and selected `rc.6`.

## First three investigations

### A1 — One-product consistency and UI parity

**Question:** What must be identical across Windows and macOS for there to be one AI7 product, and what may vary through native adapters?

**Permitted:** map the 79 requirements and fourteen journeys to canonical records; build shared-versus-native, support-version/CPU/channel, parity, accessibility, Policy visibility, contradiction, and non-goal matrices.

**Prohibited:** implementation/decomposition; selection of Electron, ProseMirror, IPC, store, or packaging; treating geometry or Windows behavior as architecture; canonical edits.

**Evidence:** requirement/ADR/state crosswalk, shared-versus-native contract, support/parity options, Policy visibility conflict analysis, explicit contradictions/non-goals.

**Exit:** a decision-ready product-consistency contract names shared semantics, allowed OS differences, support options, and remaining owner choices.

### A2 — Exact Harness `rc.6` composition and seam closure

**Blocked by:** A1's stable invariant list; late work may overlap.

**Question:** Does the exact proposed `rc.6` subset preserve every Harness seam AI7 relies on relative to audited `rc.5`?

**Permitted:** read-only artifact/source comparison; disposable non-product composition/schema/replay probes; dependency/native-ABI inspection; Session, replay, guards, capability exposure, subagent, compaction, notices, and transitive-package inspection.

**Prohibited:** repository dependencies/lockfiles; vendoring/forking; product implementation; generic-tool activation; treating compilation as acceptance; CI/release changes.

**Evidence:** exact package/version/integrity manifest; semantic delta; effective composition and capability diffs; Session/replay/guard results; Node/Electron/OS/CPU ABI; notices/licensing delta; seam gaps and isolation implications.

**Exit:** every relied-on seam is proven, failed, or explicitly unsupported, yielding a known executable/process/tool surface for A3.

### A3 — Truthful OS isolation and local-authority boundary

**Blocked by:** A1 and A2.

**Question:** What actually confines service/agent operations to the Agent Data Root on each target, and what remains AI7 capability/Run Source Scope enforcement?

**Permitted:** disposable adversarial probes on representative Windows/macOS hosts covering read/write/create/rename, links/junctions/symlinks, races, subprocess/helper escape, network, restart/update, IPC permissions, and secret adapters.

**Prohibited:** product integration or shipping claims; equating Electron renderer sandbox with service confinement; weakening Run Source Scope; UI safety delegation; real manuscript/credential fixtures.

**Evidence:** threat/trust diagram, reproducible per-OS/CPU probes, operation enforcement matrix, bypass/failure log, IPC/secret findings, and compensating-control options.

**Exit:** one viable enforced design is decision-ready, or the architecture truthfully declares OS confinement advisory and presents required compensation.

## Missing packet data

Blockers before the applicable investigation:

- immutable packet manifest mapping retained content units to path/hash;
- exact Q16 evidence-class wording;
- actual 79-requirement and fourteen-journey extracts;
- candidate UI authority/state mapping;
- exact owner wording and intended force of Windows+macOS as exploration premise versus canonical proposal;
- proposed `rc.6` subset or an explicit statement that A2 must derive candidates; and
- any existing support/parity/OS-floor/CPU/channel options.

Full validation logs, raw screenshots/recordings, A/B/C rationale, exhaustive component/token/microcopy inventories, unmeasured performance figures, packaging art, and implementation module proposals are useful but deferrable.

### Commander resolution after the delta review

The blocking packet fields are now closed without promoting either candidate:

- [Packet Manifest](./PACKET-MANIFEST.md) pins every admitted canonical and Worker object by commit, path, blob, and byte count.
- [Architecture Review Packet](./REVIEW-PACKET.md) records the exact five Q16 evidence rules and exact owner wording.
- The manifest admits the exact 79 requirements, fourteen journeys, traceability, interaction/state, information-architecture, usability, and visual-reference objects.
- The review packet includes the candidate UI authority/state mapping.
- No `rc.6` subset is silently inherited; A2 must derive candidate subsets.
- No parity, OS/CPU floor, channel, or native-exception option is silently inherited; A1 must produce the options and owner choices.

## Owner-decision boundary

No owner decision is needed before A1–A3 begin as read-only, noncanonical exploration. The Windows+macOS request is sufficient as a working premise. Owner acceptance becomes necessary after A1 to choose the exact product parity/support contract, and later before any candidate architecture becomes canonical.

Dispatch: Architecture Reviewer | OpenAI | `gpt-5.6-sol` | `ultra` | T3-par | authorship-independent and contamination-clean; `same-provider review — independence reduced`.
