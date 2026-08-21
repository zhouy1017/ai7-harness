# Known Problems for Architecture Exploration

Status: **curated investigation input, not an accepted v2 design**

Each item distinguishes verified canonical facts from candidate branch input. A problem is not permission to reopen unrelated accepted decisions.

## KP-001 — Product-platform contract fork

**Status:** verified conflict plus Commander-audited candidate owner revision; frozen local reference head `docs/1-windows-macos-phase0@9606891` passed exact-head review but remains noncanonical.

Canonical `main` repeatedly defines Windows as the only product and evidence platform in [`AGENTS.md`](../../AGENTS.md), [ADR 0014](../adr/0014-verify-on-one-windows-gate.md), [ADR 0023](../adr/0023-portable-release-with-self-contained-data-root.md), and related design notes. The active platform Worker was explicitly asked to revise this to one Windows+macOS product.

**Why a patch is insufficient:** the change crosses shell behavior, menus and shortcuts, file dialogs, storage roots, secret stores, IPC, confinement, packaging, signing, CI runners, release receipts, and UI conventions.

**Required exploration:** define the platform-neutral product contract, native adapter seams, per-platform evidence, and explicit ADR supersession set.

## KP-002 — Filesystem-isolation claim exceeds current evidence

**Status:** verified open item.

[`AGENTS.md`](../../AGENTS.md) states that the agent has real filesystem permission inside the Agent Data Root and none outside it. [`HANDOFF.md`](../../HANDOFF.md) records Windows sandbox enforcement as unverified and prohibits describing it as enforced without proof.

**Why a patch is insufficient:** semantic capability checks, partial write confinement, and OS-enforced read/write/process/network isolation are different guarantees.

**Required exploration:** threat and authority boundary, Windows and macOS enforcement experiments, bypass cases, fail-closed behavior, and wording that matches measured enforcement.

## KP-003 — Harness audited and consumed baselines are different

**Status:** verified open item.

[`AGENTS.md`](../../AGENTS.md), [ADR 0020](../adr/0020-consume-pinned-harness-package-subset.md), and [`kick-in/30-upstream-consumption-and-upgrade-contract.md`](../../kick-in/30-upstream-consumption-and-upgrade-contract.md) distinguish the audited but unpublished `0.1.0-rc.5` reference from the consumed `0.1.0-rc.6` packages.

**Why a patch is insufficient:** AI7's authority and replay claims depend on actual package seams, dependency closure, Cordis composition, Session compatibility, and tool exposure—not version labels alone.

**Required exploration:** exact package subset, rc.5-to-rc.6 seam delta, composed configuration, transitive capability exposure, replay/session behavior, notices, and Electron/Node ABI evidence.

## KP-004 — UI candidate and platform candidate were produced from different assumptions

**Status:** verified cross-candidate tension; both structured handoffs Commander-audited.

The UI/UX line began from the canonical Windows-only design. Consolidated head `587d645` is frozen locally after exact-head Standards and Spec review passed with zero findings; it is the branch's only commit above base. The platform line changes the product contract to Windows+macOS and is frozen locally at `docs/1-windows-macos-phase0@9606891`. Neither candidate may silently repair the other, and neither is canonical.

**Why a patch is insufficient:** the durable UI value is likely in user outcomes, journeys, state distinctions, information architecture, and Chinese-first interaction—not fixed shell geometry or platform-specific controls.

**Required exploration:** retain the UI candidate's authority/state distinctions, Book-first journeys, negative guarantees, and usability gates as hypotheses; classify its information architecture and visual system for revalidation; treat its HTML/Figma geometry and Windows-specific onboarding, accessibility, IME, packaging, and viewport behavior as high-cost disposable or adapter-bound evidence.

## KP-005 — “Design complete” includes claims deliberately deferred to spikes

**Status:** verified.

The 36-question interview is complete, while [`HANDOFF.md`](../../HANDOFF.md) still lists retrieval strategy, ProseMirror confidence, latency budgets, and isolation evidence as open. [`kick-in/34-first-tracer-slice.md`](../../kick-in/34-first-tracer-slice.md) places the store-and-index spike before the first product slice.

**Why a patch is insufficient:** an accepted direction, an implementation hypothesis, and a measured architecture fact must not share one “complete” label.

**Required exploration:** mark each claim as invariant, reversible choice, hypothesis, or spike-gated decision, with explicit exit evidence.

## KP-006 — Verification and release design is platform-coupled

**Status:** verified consequence of KP-001.

[ADR 0014](../adr/0014-verify-on-one-windows-gate.md) requires one Windows job and Windows-only release evidence. Adding macOS changes runner topology, artifact identity, signing/notarization, native-module evidence, and the meaning of a same-SHA release gate.

**Required exploration:** preserve concise provider-free PR evidence while defining the smallest per-platform build/release proof that can fail closed.

## Guardrails that are not redesign problems by default

The following remain accepted invariants unless the owner explicitly revises them: Chinese-first editorial purpose; manuscripts and derivatives excluded from repositories and hosted CI; Book/revision mutation authority; exact evidence and proposal semantics; named authority and Effect receipts; separate Task and Harness ledgers; no LLM weight training; full Harness engine behind a narrow editorial capability surface; and no implementation before explicit authorization.
