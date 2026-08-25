---
status: accepted-v2-candidate
---

# DSH-first, DeepSeek-primary, AI7-owned architecture

This ADR is accepted inside the noncanonical V2 candidate. It records the owner's V2 direction but does not edit canonical `main` or authorize implementation. It replaces the candidate's former Codex-first ADR.

## Decision

AI7 V2 uses **DeepSeek Harness (DSH)** as its sole production **Primary Agent Harness**. DSH supplies the one generic agent loop—model conversation, context assembly, turn progression, model invocation, technical tool dispatch, streamed technical events, compaction, subagent mechanics where used, and in-turn recovery—composed inside the AI7 Node service behind the AI7-owned `PrimaryAgentHarness` containment boundary.

AI7 retains sole ownership of product requirements, Books and manuscripts, workflows, UI/UX, Policy Documents, authority, Task Intents and Run Records, scheduling and concurrency, providers and credentials, capabilities, Effects and receipts, persistence, learning, factual review, packaging, and product lifecycle. DSH technical records correlate through Execution Bindings and Harness Execution Spans but never become AI7 business truth.

**DeepSeek is the primary but not the exclusive model provider.** Every configured model—including an optional alternative frontier provider—enters through the same DSH loop and the same AI7-owned Provider Resolution Plan, Plan Envelope, Credential Broker, Run Source Scope, budget, and egress boundaries. An alternative provider never creates a second harness, a silent runtime fallback, or a separate authority path.

The accepted default Model Role bindings are:

| Model Role | Default binding | Intended work |
| --- | --- | --- |
| Fast Interaction Role | DeepSeek V4 Flash | Quick interaction, low-risk candidate generation, and latency-sensitive assistance. |
| Main Editorial Role | DeepSeek V4 Pro High | Chinese long-form writing, editorial proposals, cross-source synthesis, factual research, and complex instruction following. |
| Difficult Escalation Role | DeepSeek V4 Pro Max | Difficult or unusually consequential work that exceeds the main role's expected capability. |
| Frontier Model Role | DeepSeek V4 Pro Max | Default frontier binding for challenge or explicitly authorized high-consequence work; the user may explicitly configure another eligible provider/model without changing the one-loop topology. |

These are default bindings, not factual authority. Model output remains a proposal or a research lead. Factual Verification still requires admissible evidence, provenance, and Exact Fetch where applicable. Task Skills declare Model Roles, never a provider, model, endpoint, or credential.

**Codex is not a production runtime.** It remains the **Codex Interaction Model Reference**: a non-runtime interaction and engineering reference for task capture, context, progress, interruption, clarification, history, review, host/runtime boundaries, extension design, and secondary-development ideas. AI7 copies no Codex branding, GUI source, layout, assets, coding presets, or coding-agent purpose, and ships no Codex package, process, technical Session, adapter target, provider invoker, fallback, or source build.

**Electron and ProseMirror remain AI7-owned.** Assigning the Primary Agent Harness does not replace the desktop shell, renderer, editor, domain services, or AI7 service process.

DSH is consumed as exactly pinned public npm packages: ADR 0020's accepted `0.1.0-rc.6` baseline, the selected subset AI7's composition needs, one coherent version across that subset, a committed lockfile, no `^`, `~`, branch, mutable tag, or `latest`, and never the `@deepseek-ai/dsh` CLI aggregate. Adopting the framework is not adopting its defaults: every DSH default reaching an editorial Run must be justified for publishing work.

Missing product behavior is implemented cheaply, in this order of preference: AI7-owned adapters and capability implementations, then documented DSH extension seams, then—only when an identified need justifies it—an admitted third-party DSH plugin under [ADR 0002](./0002-admit-and-pin-third-party-dsh-plugins.md).

Unknown DSH behavior is recorded in `ASSUMPTIONS.md` with a bounded design response. It does not block architecture on audits, probes, scores, exact hashes, prototypes, or closure proof.

Engineering CI consists only of Windows E2E functional completeness and regressions for observed bugs, under ADR 0027. Product Factual Verification, named authority, Effect Receipts, recovery, privacy, and related behaviors remain functional requirements rather than separate proof systems.

## Consequences

- AI7 has one generic loop implementation and may run many isolated instances of it. Parallel Runs across Books, plus background analysis and learning work, are many instances of one loop, not a second loop.
- AI7 schedules and DSH converses. AI7 owns which Runs exist, workflow state, continuation, concurrency, budget, Effects, and model-free background jobs. AI7's business scheduling does not use the Harness `schedule`, `jobs`, or workflow packages.
- The Node service is the only local product authority; the renderer is a projection and DSH is an executor.
- The `PrimaryAgentHarness` boundary localizes DSH composition, Cordis wiring, session storage, event taxonomy, provider invocation, and tool-registry differences.
- AI7 exposes only domain capabilities and rechecks every call at the AI7 Capability Facade. The Editorial Capability Profile exposes no generic shell, process runner, roaming filesystem, arbitrary network, or developer-mode escalation.
- Provider choice is a configuration and Provider Preflight concern, not an architecture concern. Adding an alternative frontier provider changes no topology, ledger, authority, or capability rule.
- DSH approvals and successful turns never create Run Authorization, Effect Approval, Proposal Decision, Review Decision, Public Release Permission, Task Outcome, or Effect Receipt.
- Local editing and recovery remain available offline without DSH, a provider, authentication, or network access.
- Codex material may still inform AI7-owned interaction and engineering design. It creates no dependency, runtime obligation, or upgrade surface.
- Pin bumps of the DSH subset remain explicit, one-at-a-time development changes rather than automatic updates. Only applicable Windows E2E journeys and observed-bug regressions are standing verification.
- This ADR retains ADR 0020's exact DSH `0.1.0-rc.6` baseline; it selects no final package list, plugin, provider endpoint, or credential.

## Canonical records affected after owner acceptance

| Record | Candidate disposition |
| --- | --- |
| Execution context and root glossary | Add the Codex Interaction Model Reference and the four Model Roles; keep the Primary Agent Harness role bound to DSH. |
| ADR 0011 | Unchanged in substance: keep the two-ledger and continuation model with the technical ledger owned by the DSH Session store. |
| ADR 0017 | Unchanged: full engine behind a narrow AI7 tool surface, enforced by the AI7 Capability Facade. |
| ADR 0020 | Retained and confirmed: continue consuming the pinned DSH package subset with no CLI aggregate. Add the third-party plugin rules from ADR 0002. |
| ADR 0021 | Unchanged: single execution authority, one loop, AI7 scheduling, no automatic harness fallback. |
| ADR 0024 | Unchanged: three AI7 process roles, no TCP listener, composed Harness runtime inside the Node service. |
| ADR 0027 | Keep as the engineering-verification authority. |
| `AGENTS.md` and dependent `kick-in/` notes | Preserve the DSH production language; add the accepted Model Role defaults, the primary-not-exclusive provider boundary, and Codex's reference-only role. |

## Rejected alternatives

- **Keep Codex as the production Primary Agent Harness.** Rejected: it costs a maintained integration or source build for a loop AI7 already has as a pinned dependency, and the owner has made DeepSeek the primary model family.
- **Run DSH and a second harness as interchangeable or mixed generic loops.** Rejected because Run identity, continuation, tools, and technical history would have competing authorities.
- **Implement an AI7-owned generic agent loop.** Rejected because AI7 should own publishing intelligence and authority, not duplicate generic turn machinery.
- **Make DeepSeek the exclusive provider.** Rejected because Model Roles are provider-neutral by design and the owner wants an explicitly configurable frontier binding.
- **Bind Task Skills directly to model names.** Rejected because it collapses Model Roles into provider selection and defeats Provider Preflight.
- **Adopt DSH defaults, presets, and coding tool set as shipped.** Rejected: AI7 adopts DSH composition machinery, not its coding-agent purpose.
- **Discard Codex material entirely.** Rejected because its interaction and host-boundary patterns remain useful non-runtime engineering reference.
- **Keep capability closure as an architecture gate.** Rejected as superseded by Clarification 0004 and ADR 0027.

## Authority and stop boundary

This candidate decision derives from Clarification 0005 — `docs/architecture-exploration/clarifications/0005-dsh-first-model-routing-and-plugin-admission.md` at exact Commander commit `5693a5f444f0fb0daaa630444acc18932b0df391` — together with Clarification 0004's still-active minimal-validation decision. Clarifications 0001–0003 and the Codex-first clauses of Clarification 0004 are historical evidence only. This ADR supersedes the candidate's former Codex-first ADR, not canonical project records.

No implementation, dependency installation, package selection, plugin download, GitHub search, source copy, prototype, issue decomposition, pull request, push, merge, or release follows from this ADR.
