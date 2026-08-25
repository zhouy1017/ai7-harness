# AI7 V2 architecture candidate

Status: **coherent noncanonical design; no implementation authority**

This candidate describes one simple architecture:

- AI7 owns the product, domain model, UI/UX, policies, authority, capabilities, Effects, Task Ledger, scheduling, providers, persistence, and lifecycle.
- **DeepSeek Harness (DSH)** is the sole production **Primary Agent Harness**, composed inside the AI7 Node service from the ADR 0020 baseline `0.1.0-rc.6` and an exactly pinned public npm package subset — full composition capability behind a narrow AI7 tool surface, never the `@deepseek-ai/dsh` CLI aggregate.
- **DeepSeek is primary but not exclusive.** Task Skills declare provider-neutral Model Roles; the accepted defaults are V4 Flash for Fast Interaction, V4 Pro High for Main Editorial, and V4 Pro Max for Difficult Escalation and, by default, the Frontier Model Role. The user may explicitly configure another eligible frontier provider, which enters the same loop, plan, credential brokering, budget, and egress gate. No model is a factual authority.
- **Codex is not a production runtime.** It remains the **Codex Interaction Model Reference**: a non-runtime interaction and engineering reference. AI7 ships no Codex package, process, session, adapter target, provider invoker, fallback, or source build, and copies no Codex branding, GUI source, layout, assets, or coding presets.
- Electron, ProseMirror, the renderer, domain services, and the AI7 service process remain AI7-owned and unchanged by the harness decision.
- Missing product behavior is implemented cheaply: AI7-owned adapters and capability implementations first, then documented DSH extension seams, and only for an identified need an admitted third-party DSH plugin under an immutable local pin.
- Unknown DSH behavior is an implementation assumption with a design response, never a capability-closure or proof blocker.
- The only standing engineering CI surface is one logical provider-free E2E Functional Gate, executed on Windows and macOS, covering complete supported journeys and regressions for observed bugs.

The design remains candidate-only until explicit owner acceptance and Commander integration. It retains ADR 0020's exact DSH version baseline but selects no final package list, plugin, provider endpoint, or credential, and authorizes no implementation, issue decomposition, GitHub search, installation, source copy, fork, push, merge, or release.

## Reading order

1. [Architecture](./ARCHITECTURE.md) — product and component boundaries, runtime topology, ownership, Model Roles, flows, persistence, and failure/continuation semantics.
2. [Harness Integration](./HARNESS-INTEGRATION.md) — composition contract, session/task/effect separation, providers, capabilities, lifecycle, pinning, and extension policy.
3. [Migration](./MIGRATION.md) — retain/reshape/discard/rewrite decisions and staged direction after later authorization.
4. [Assumptions](./ASSUMPTIONS.md) — explicit implementation assumptions and the response if each proves false.
5. [ADR 0001](./adr/0001-dsh-first-deepseek-primary-architecture.md) — the accepted V2-candidate harness, provider, and model-routing decision.
6. [ADR 0002](./adr/0002-admit-and-pin-third-party-dsh-plugins.md) — third-party plugin admission thresholds and immutable local version management.
7. [Decision Queue](./DECISION-QUEUE.md) — only future material owner choices; none blocks this design.
8. [Execution context](./domain/execution/CONTEXT.md) and [candidate glossary](./GLOSSARY.md) — candidate role definitions and retained canonical term boundaries.

## Retained historical references

- [A1 Product Consistency](./A1-PRODUCT-CONSISTENCY.md) applies the accepted Windows-and-macOS one-product contract and native-variation discipline. Its former evidence counts and proof language remain historical and non-gating.
- [A1 Evidence Crosswalk](./A1-EVIDENCE-CROSSWALK.md) preserves useful requirement and journey mappings. It is reference material, not a completeness claim, proof plan, or CI input. Where it or any other retained record describes a Codex-first runtime, that description is historical evidence only.

The deleted A2 capability matrix, evidence register, gap register, and old conditional seam/ADR were superseded by Clarification 0004 and ADR 0027. The candidate's former Codex-first integration document and ADR were superseded by Clarification 0005. Historical commits retain them if later context is needed.

## Authority basis

This rewrite consumes Clarification 0005 — `docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md` at exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391` — as its sole new decision input:

- DeepSeek Harness owns the one production generic agent loop; AI7 owns business, domain, and authority state.
- DeepSeek is the primary but not exclusive provider, with the four accepted Model Role defaults.
- Codex is retained as the Codex Interaction Model Reference and engineering reference only.
- Third-party open-source DSH plugins may be used need-based, under admission thresholds and immutable local version management.

Clarification 0004's minimal-validation decision remains active, so ADR 0027 and `kick-in/35-minimal-e2e-validation.md` keep one provider-free E2E functional/regression surface on Windows and macOS as the only standing engineering verification. ADR 0028 supplies the accepted two-platform product contract. Clarifications 0001–0003 and the Codex-first clauses of Clarification 0004 are historical evidence only.

## Candidate decision state

The architecture is internally decided for V2 candidate purposes. There is no current owner-choice blocker. Windows and macOS are both in scope; concrete macOS distribution and adapter mechanics remain implementation decisions. Future changes that would fork the generic loop, replace the harness, relax plugin admission, add another platform or surface, or expand product authority return to the owner through the [Decision Queue](./DECISION-QUEUE.md). No such future choice delays the present design.
