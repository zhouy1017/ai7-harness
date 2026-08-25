# AI7 V2 architecture baseline

Status: **Owner-accepted `dev` implementation-facing architecture baseline; design authority only**

This package describes one simple architecture:

- AI7 owns the product, domain model, UI/UX, policies, authority, capabilities, Effects, Task Ledger, scheduling, providers, persistence, and lifecycle.
- **DeepSeek Harness (DSH)** is the sole production **Primary Agent Harness**, composed inside the AI7 Node service from the ADR 0020 baseline `0.1.0-rc.6` and an exactly pinned public npm package subset — full composition capability behind a narrow AI7 tool surface, never the `@deepseek-ai/dsh` CLI aggregate.
- **DeepSeek is primary but not exclusive.** Task Skills declare provider-neutral Model Roles; the accepted defaults are V4 Flash for Fast Interaction, V4 Pro High for Main Editorial, and V4 Pro Max for Difficult Escalation and, by default, the Frontier Model Role. The user may explicitly configure another eligible frontier provider, which enters the same loop, plan, credential brokering, exact Run Budget Ceiling state, and egress gate. No model is a factual authority.
- **Codex is not a production runtime.** It remains the **Codex Interaction Model Reference**: a non-runtime interaction and engineering reference. AI7 ships no Codex package, process, session, adapter target, provider invoker, fallback, or source build, and copies no Codex branding, GUI source, layout, assets, or coding presets.
- Electron, ProseMirror, the renderer, domain services, and the AI7 service process remain AI7-owned and unchanged by the harness decision.
- Missing product behavior is implemented cheaply: AI7-owned adapters and capability implementations first, then documented DSH extension seams, and only for an identified need an admitted third-party DSH plugin under an immutable local pin.
- Unknown DSH behavior is an implementation assumption with a design response, never a capability-closure or proof blocker.
- The only standing engineering CI surface is one logical provider-free E2E Functional Gate, executed on Windows and macOS, covering complete supported journeys and regressions for observed bugs.

The Owner accepted this package into the `dev` development baseline through the exact Issue #20 allowlist. It retains ADR 0020's exact DSH version baseline but selects no final package list, plugin, provider endpoint, or credential. Acceptance does not itself authorize adjacent implementation, GitHub search, installation, source copy, fork, external action, release, or promotion to `main`.

## Reading order

1. [Architecture](./ARCHITECTURE.md) — product and component boundaries, runtime topology, ownership, Model Roles, flows, persistence, and failure/continuation semantics.
2. [Harness Integration](./HARNESS-INTEGRATION.md) — composition contract, session/task/effect separation, providers, capabilities, lifecycle, pinning, and extension policy.
3. [Migration](./MIGRATION.md) — retain/reshape/discard/rewrite decisions and staged direction after later authorization.
4. [Assumptions](./ASSUMPTIONS.md) — explicit implementation assumptions and the response if each proves false.
5. [Root ADR 0041](../adr/0041-dsh-first-deepseek-primary-architecture.md) — the accepted harness, provider, and model-routing decision.
6. [Root ADR 0042](../adr/0042-admit-and-pin-third-party-dsh-plugins.md) — third-party plugin admission thresholds and immutable local version management.
7. [Decision Queue](./DECISION-QUEUE.md) — only future material owner choices; none blocks this design.
8. [Root Execution context](../domain/execution/CONTEXT.md) and [root glossary](../../GLOSSARY.md) — canonical role definitions and bilingual routing.

## Historical references

The former A1 crosswalks, A2 capability/proof material, Codex-first integration document, and architecture-exploration clarifications remain source-qualified Git history only. They are deliberately absent from the current tree and ordinary reading route. ADR 0027, ADR 0028, root ADRs 0041/0042, and this package own the accepted current outcomes.

## Authority basis

This rewrite consumes Clarification 0005 — `docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md` at exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391` — as its sole new decision input:

- DeepSeek Harness owns the one production generic agent loop; AI7 owns business, domain, and authority state.
- DeepSeek is the primary but not exclusive provider, with the four accepted Model Role defaults.
- Codex is retained as the Codex Interaction Model Reference and engineering reference only.
- Third-party open-source DSH plugins may be used need-based, under admission thresholds and immutable local version management.

Clarification 0004's minimal-validation decision remains active, so ADR 0027 and `kick-in/35-minimal-e2e-validation.md` keep one provider-free E2E functional/regression surface on Windows and macOS as the only standing engineering verification. ADR 0028 supplies the accepted two-platform product contract. Clarifications 0001–0003 and the Codex-first clauses of Clarification 0004 are historical evidence only.

## Decision state

The architecture is accepted for development on `dev`; there is no current owner-choice blocker inside this package. Issue #8 Batches 1–5 fix explicit import and Book identity, Task exactness and continuation, Book-targeted Source Version acquisition, reviewed Series Knowledge promotion and current exclusions, immutable destination-independent Delivery Package identity, native-OS local-export collision handling under AI7 authority, and versioned post-designation maintenance. These refine AI7 domain and capability-facade behavior without changing the one-loop topology or adding external send/publication/recall authority. Windows and macOS are both in scope; concrete macOS distribution and adapter mechanics remain implementation decisions. Future changes that would fork the generic loop, replace the harness, relax plugin admission, add another platform or surface, or expand product authority return to the Owner through the [Decision Queue](./DECISION-QUEUE.md).
