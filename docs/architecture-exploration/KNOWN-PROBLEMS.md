# Known Problems for Architecture Exploration

Status: **historical investigation input; KP-001, KP-002, KP-004 and KP-006 are resolved on `design-doc` by ADRs 0027/0028 and V2 document integration**

Each item distinguishes verified canonical facts from candidate branch input. A problem is not permission to reopen unrelated accepted decisions.

## KP-001 — Product-platform contract fork

**Status:** resolved on `design-doc` on 2026-08-25; source branches remain historical.

ADR 0028 now defines one Windows-and-macOS product with shared semantics and explicit native adapters. ADR 0027 defines one logical provider-free E2E Functional Gate on both. `main` is unchanged until separately authorized integration, but this is no longer an unresolved cross-session choice on `design-doc`.

**Why a patch is insufficient:** the change crosses shell behavior, menus and shortcuts, file dialogs, storage roots, secret stores, IPC, confinement, packaging, signing, CI runners, release receipts, and UI conventions.

**Resolution:** shared product identity, domain/authority, workflows, core features, fidelity, data meaning, and UI/UX outcomes are fixed; concrete macOS floor/CPU/package/data/Keychain/IPC/signing mechanics remain implementation decisions, not product-scope blockers.

## KP-002 — Filesystem-isolation claim exceeds current evidence

**Status:** design wording resolved; concrete native defence-in-depth mechanisms remain implementation details.

[`AGENTS.md`](../../AGENTS.md), ADR 0017, and ADR 0028 now state that AI7 capability/service facades are the enforceable boundary on both platforms. The Agent Data Root is intended, and no whole-process OS confinement is claimed before a concrete mechanism supports it.

**Why a patch is insufficient:** semantic capability checks, partial write confinement, and OS-enforced read/write/process/network isolation are different guarantees.

**Resolution:** fail closed through AI7 capabilities and Run Source Scope. Native controls may add defence in depth later without creating a separate validation gate.

## KP-003 — Harness audited and consumed baselines are different

**Status:** verified open item.

[`AGENTS.md`](../../AGENTS.md), [ADR 0020](../adr/0020-consume-pinned-harness-package-subset.md), and [`kick-in/30-upstream-consumption-and-upgrade-contract.md`](../../kick-in/30-upstream-consumption-and-upgrade-contract.md) distinguish the audited but unpublished `0.1.0-rc.5` reference from the consumed `0.1.0-rc.6` packages.

**Why a patch is insufficient:** AI7's authority and replay claims depend on actual package seams, dependency closure, Cordis composition, Session compatibility, and tool exposure—not version labels alone.

**Required exploration:** exact package subset, rc.5-to-rc.6 seam delta, composed configuration, transitive capability exposure, replay/session behavior, notices, and Electron/Node ABI evidence.

## KP-004 — UI candidate and platform candidate were produced from different assumptions

**Status:** resolved on `design-doc`; frozen V1 remains Windows-specific historical reference.

The V2 UI/UX candidate now applies ADR 0028 explicitly: shared objects, journeys, state meaning, authority, fidelity, and negative guarantees with native Windows/macOS menus, shortcuts, dialogs, notifications, accessibility, paths, credentials, and distribution presentation. The exact frozen V1 package remains historical evidence and is not rewritten.

**Why a patch is insufficient:** the durable UI value is likely in user outcomes, journeys, state distinctions, information architecture, and Chinese-first interaction—not fixed shell geometry or platform-specific controls.

**Resolution:** V2 retains semantic outcomes and drops frozen geometry/prototypes. Windows-specific mechanisms are adapter evidence, and no standalone usability/accessibility/performance gate survives ADR 0027.

## KP-005 — “Design complete” includes claims deliberately deferred to spikes

**Status:** verified.

The 36-question interview is complete, while [`HANDOFF.md`](../../HANDOFF.md) still lists retrieval strategy, ProseMirror confidence, latency budgets, and isolation evidence as open. [`kick-in/34-first-tracer-slice.md`](../../kick-in/34-first-tracer-slice.md) places the store-and-index spike before the first product slice.

**Why a patch is insufficient:** an accepted direction, an implementation hypothesis, and a measured architecture fact must not share one “complete” label.

**Required exploration:** mark each claim as invariant, reversible choice, hypothesis, or spike-gated decision, with explicit exit evidence.

## KP-006 — Verification and release design is platform-coupled

**Status:** resolved by ADRs 0027 and 0028.

[ADR 0014](../adr/0014-verify-on-one-windows-gate.md) is historical. One logical provider-free E2E Functional Gate runs complete journeys and observed-bug regressions on Windows and macOS; package, signing, same-SHA, and platform-certification proof programmes are not active.

**Resolution:** platform-native setup may differ inside the single E2E gate and creates no separate build/release proof gate.

## Guardrails that are not redesign problems by default

The following remain accepted invariants unless the owner explicitly revises them: Chinese-first editorial purpose; manuscripts and derivatives excluded from repositories and hosted CI; Book/revision mutation authority; exact evidence and proposal semantics; named authority and Effect receipts; separate Task and Harness ledgers; no LLM weight training; full Harness engine behind a narrow editorial capability surface; and no implementation before explicit authorization.
