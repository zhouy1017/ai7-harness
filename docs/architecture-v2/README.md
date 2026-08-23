# AI7 V2 architecture candidate

Status: **coherent noncanonical design; no implementation authority**

This candidate replaces the proof-oriented A2 line with one simple architecture:

- AI7 owns the product, domain model, UI/UX, policies, authority, capabilities, Effects, Task Ledger, providers, persistence, and lifecycle.
- Codex is the assumed sole **Primary Agent Harness**, behind an AI7-owned adapter in the Node service.
- DeepSeek Harness is a **Development Reference Framework** only: development rules, design patterns, and documentation experience, with no product dependency or runtime role.
- Codex Desktop-like interaction principles inform task, progress, interruption, history, and review interactions; AI7 copies no brand, layout, source, assets, or coding-agent purpose.
- Adapter and public-extension seams are preferred when convenient. A small maintained Codex source build or fork is allowed when direct secondary development is the simplest coherent answer.
- Unknown Codex behavior is an implementation assumption with a design response, never a capability-closure or proof blocker.
- The only standing engineering CI surface is Windows E2E functional completeness and regressions for observed bugs.

The design remains candidate-only until explicit owner acceptance and Commander integration. It selects no exact dependency or source pin and authorizes no implementation, issue decomposition, installation, source copy, fork, push, merge, or release.

## Reading order

1. [Architecture](./ARCHITECTURE.md) — product and component boundaries, runtime topology, ownership, flows, persistence, and failure/continuation semantics.
2. [Codex Integration](./CODEX-INTEGRATION.md) — adapter contract, session/task/effect separation, providers, capabilities, lifecycle, and secondary-development policy.
3. [Migration](./MIGRATION.md) — retain/discard/rewrite decisions and staged direction after later authorization.
4. [Assumptions](./ASSUMPTIONS.md) — explicit implementation assumptions and the response if each proves false.
5. [ADR 0001](./adr/0001-codex-first-ai7-owned-architecture.md) — the accepted V2-candidate decision and rejected alternatives.
6. [Decision Queue](./DECISION-QUEUE.md) — only future material owner choices; none blocks this design.
7. [Execution context](./domain/execution/CONTEXT.md) and [candidate glossary](./GLOSSARY.md) — candidate role definitions and retained canonical term boundaries.

## Retained historical references

- [A1 Product Consistency](./A1-PRODUCT-CONSISTENCY.md) preserves the shared product invariants and native-variation discipline. Its former Windows+macOS option packet and evidence language are historical and non-gating; current scope is Windows-only.
- [A1 Evidence Crosswalk](./A1-EVIDENCE-CROSSWALK.md) preserves useful requirement and journey mappings. It is reference material, not a completeness claim, proof plan, or CI input.

The deleted A2 capability matrix, evidence register, gap register, and old conditional seam/ADR were superseded by Clarification 0004 and ADR 0027. Historical commits retain them if later context is needed.

## Authority basis

This rewrite consumes the Commander authorities at control head `f33052c152cbdc79da7f6a9d4c94423491a92ad0`:

- ADR 0027 and `kick-in/35-minimal-e2e-validation.md` make Windows E2E functional/regression coverage the only standing engineering verification surface.
- Clarification 0001 supplies the single Codex / guidance-only DeepSeek role split.
- Clarification 0002 preserves Codex secondary development, no automatic DeepSeek fallback, and no dual-loop boundaries.
- Clarification 0004 removes capability-closure proof as a precondition and directs design-first continuation with explicit assumptions.
- `CODEX-HARNESS-DIRECTIVE.md` supplies the AI7 ownership and Codex Desktop-like reference boundaries, as narrowed by those clarifications.

## Candidate decision state

The architecture is internally decided for V2 candidate purposes. There is no current owner-choice blocker. Future changes that materially expand platform scope, authority, the Codex maintenance burden, or DeepSeek's role return to the owner through [Decision Queue](./DECISION-QUEUE.md). No such future choice delays the present design.
