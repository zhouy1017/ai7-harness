---
status: accepted-v2-candidate
---

# Codex-first, AI7-owned architecture

This ADR is accepted inside the noncanonical V2 candidate. It records the owner's V2 direction but does not edit canonical `main` or authorize implementation.

## Decision

AI7 V2 assumes Codex as its sole **Primary Agent Harness**. Codex supplies the generic agent loop—conversation, context assembly, turns, model interaction, tool dispatch, streaming, compaction, subagents where used, and in-turn recovery—behind the AI7-owned `PrimaryAgentHarness` adapter in the Node service.

AI7 retains sole ownership of product requirements, Books and manuscripts, workflows, UI/UX, Policy Documents, authority, Task/Run records, providers and credentials, capabilities, Effects and receipts, persistence, learning, factual review, packaging, and product lifecycle. Codex technical records correlate through Execution Bindings and Harness Execution Spans but never become AI7 business truth.

DeepSeek Harness is a **Development Reference Framework** only. Its useful rules, patterns, and documentation experience may be re-expressed in AI7-owned assets. It contributes no package, process, Session, tool, fallback, capability grant, runtime authority, or product branding.

Codex Desktop-like interaction is a principle-level UI/UX reference. AI7 does not copy its branding, layout, source, assets, generic chat structure, coding presets, or coding-agent purpose.

Implementation starts adapter/extension-first when convenient. A small maintained Codex source build or fork is allowed when direct source development is the simplest local way to remove defaults or add lifecycle, capability, provider, credential, storage, or event behavior. This is a pragmatic implementation assumption, not a capability-gap proof, maintenance-form gate, or new owner decision.

Unknown Codex behavior is recorded in `ASSUMPTIONS.md` with a bounded design response. It does not block architecture on audits, probes, scores, exact hashes, prototypes, or closure proof.

Engineering CI consists only of Windows E2E functional completeness and regressions for observed bugs, under ADR 0027. Product Factual Verification, named authority, Effect Receipts, recovery, privacy, and related behaviors remain functional requirements rather than separate proof systems.

## Consequences

- AI7 has one generic loop implementation and may run many isolated instances of it.
- The Node service is the only product authority; the renderer and Codex are projections/executors.
- The adapter becomes the locality boundary for Codex protocol, process, source, storage, event, provider, and tool differences.
- AI7 exposes only domain capabilities and rechecks every call at the Capability Facade.
- Codex approvals and successful turns never create Run Authorization, Effect Approval, Proposal Decision, Review Decision, Public Release Permission, Task Outcome, or Effect Receipt.
- Local editing and recovery remain available offline without Codex, provider, authentication, or network.
- An implementation may maintain a small Codex source difference without reopening architecture. A broad independent platform or authority expansion returns to the owner.
- DeepSeek runtime reconsideration requires a new explicit owner decision; there is no automatic fallback or dual-loop path.
- No exact Codex dependency, version, protocol, process form, or fork is selected by this ADR.

## Canonical records affected after owner acceptance

| Record | Candidate disposition |
| --- | --- |
| Execution context and root glossary | Add the vendor-neutral V2 roles and bind the technical-session implementation to Codex. |
| ADR 0011 | Keep the two-ledger and continuation model; vendor-qualify the technical ledger mapping. |
| ADR 0017 | Keep narrow AI7 capabilities; replace DeepSeek composition with the Codex adapter. |
| ADR 0020 | Supersede the pinned DeepSeek npm-package decision. |
| ADR 0021 | Keep single execution authority and AI7 scheduling; identify Codex as the sole loop. |
| ADR 0024 | Keep the three AI7 process topology; place the adapter and any private Codex child lifecycle behind the Node service. |
| ADR 0027 | Keep as the engineering-verification authority. |
| `AGENTS.md` and dependent `kick-in/` notes | Replace DeepSeek production language and proof-first clauses while preserving product and safety behavior. |

## Rejected alternatives

- **Retain DeepSeek as production runtime or fallback.** Rejected because it creates a second harness role and contradicts the owner's guidance-only disposition.
- **Run Codex and DeepSeek as interchangeable or mixed generic loops.** Rejected because Run identity, continuation, tools, and technical history would have competing authorities.
- **Implement an AI7-owned generic agent loop.** Rejected because AI7 should own publishing intelligence and authority, not duplicate generic turn machinery.
- **Keep capability closure as an architecture gate.** Rejected as superseded by Clarification 0004 and ADR 0027.
- **Forbid all Codex source changes.** Rejected because a small maintained source change can be simpler and more coherent than layered workarounds.
- **Clone Codex Desktop as the product shell.** Rejected because AI7 is a manuscript-centered specialist product with its own identity and domain authority.

## Authority and stop boundary

This candidate decision derives from Clarifications 0001, 0002, and 0004 plus the Codex-first directive at Commander control head `f33052c152cbdc79da7f6a9d4c94423491a92ad0`. It supersedes the candidate's former conditional ADR, not canonical project records.

No implementation, dependency installation, source copy, fork, prototype, issue decomposition, pull request, push, merge, or release follows from this ADR.
