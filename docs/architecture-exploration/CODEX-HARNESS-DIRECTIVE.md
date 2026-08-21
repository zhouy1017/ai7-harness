# Codex-First V2 Harness Directive

Status: **owner-stated V2 design direction; exact integration remains noncanonical and evidence-gated**

Recorded: **2026-08-21**

This directive supersedes the assumption that A2 evaluates only DeepSeek Harness `0.1.0-rc.6`. It does not accept a Codex dependency, authorize implementation, or permit two overlapping agent loops.

## Owner direction

V2 uses three layers of intent:

1. **AI7 defines the product.** AI7 owns the Chinese literary-publishing requirements, domain records, manuscript authority, Policy Documents, Plan and Effect semantics, business ledgers, professional editing outcomes, and product identity.
2. **Codex is the preferred harness candidate.** The open Codex harness is evaluated first as the agent-loop and product-integration template.
3. **DeepSeek Harness remains a comparison candidate.** Its composition and agent-behavior machinery remains evidence, an alternative, or a narrowly complementary component only where responsibilities are provably non-overlapping.

“Codex-first” is an evaluation and design priority. It is not yet a canonical dependency decision.

## Owner resolution: production role after capability closure

The owner accepted [Clarification 0001](./clarifications/0001-primary-agent-harness-role.md): if A2 proves that Codex supplies every load-bearing production harness capability, Codex becomes AI7's sole **Primary Agent Harness** and DeepSeek Harness becomes a **Development Reference Framework** only.

In that outcome, DeepSeek contributes development rules, architecture and composition experience, evaluation checklists, and documentation guidance. It contributes no production package, process, Session ledger, agent loop, tool runtime, fallback executor, capability authority, or user-facing branding. A failed Codex capability check reopens an evidence-bearing owner choice; it never activates DeepSeek silently.

The vendor-neutral candidate terms and their preferred Chinese labels are defined in the exact clarification record for the Worker to place in its owning candidate context and glossary. This resolution is a V2 candidate input, not proof that Codex has passed A2 and not a direct edit to canonical V1 context or ADRs.

## Owner resolution: capability-gap closure order

The owner also accepted [Clarification 0002](./clarifications/0002-codex-gap-closure-and-dsh-reentry.md). A missing Codex capability does not make DeepSeek the default remedy. AI7 first verifies that the gap is real, then prefers low-cost secondary development on the open Codex base while retaining one production loop.

DeepSeek may return to runtime comparison only when an exact Codex Capability Gap and an exact Mature Runtime Alternative in DeepSeek are both proven. This is a re-evaluation gate, not selection or fallback authority. A2 must compare the cost and risk of Codex secondary development with the DeepSeek alternative and return any residual runtime choice to the owner.

The exact Codex maintenance form—external adapter or extension, upstream contribution, maintained patch set, or fork—remains open. No source modification or implementation is authorized during this design phase.

## Verified source basis

### Official OpenAI platform article

[Codex as a platform: build on the open agent harness](https://developers.openai.com/blog/codex-as-a-platform), published 2026-08-19, establishes these relevant boundaries:

- Codex harness supplies the agent loop around conversation state, streamed execution, tools, configured sandbox and approval policies, and continuation across turns.
- `codex app-server` is the intended integration layer when the agent is part of a product and the host needs persistent conversations, lifecycle control, streamed events, interruption, tools, and approval handling.
- The host application continues to own product context, business rules, tools, records, controls, and interface.
- The integration pattern is to build around the specialist workflow, not to reproduce the Codex app with different branding.
- The open-source layer is the harness and integration surface; model access and managed services remain separate and require their own evaluation.

### Open-source repository snapshot

- Repository: [openai/codex](https://github.com/openai/codex)
- Commander evidence snapshot: `main@44e95c857f37f81a5731eab72c32a3d334d0e2c4` on 2026-08-21
- Snapshot status: research evidence only; it is not an AI7 dependency pin
- Repository license: Apache-2.0, with `NOTICE`; the license does not grant OpenAI trademarks
- Relevant visible surfaces include `codex-rs/core`, `app-server`, `app-server-protocol`, `sandboxing`, `windows-sandbox-rs`, MCP components, and the TypeScript SDK
- At this snapshot the TypeScript SDK wraps `@openai/codex`, spawns the CLI, and exchanges JSONL events over standard streams. App-server exposes the richer product lifecycle and version-generated protocol schema. A2 must not treat these integration layers as interchangeable.

Any later A2 claim must use a separately authorized exact tag, release, package version, commit, schema, or binary rather than moving `main`.

## Terminology boundary

Codex is two different kinds of input to V2:

- **Agent harness candidate:** an inspectable loop and integration surface that may supply technical execution behavior.
- **Desktop-like UX reference:** interaction language for tasks, progress, context, review, interruption, history, and approvals.

Codex is not assumed to be an AI7 UI component framework. AI7 owns its specialist editor, information architecture, business records, Chinese-first language, accessibility, and publishing workflows. “Codex Desktop-like” never authorizes copying Codex branding, layouts, assets, coding-agent purpose, generic chat defaults, or implementation.

## Ownership invariant

| Layer | AI7 ownership | Candidate harness ownership |
| --- | --- | --- |
| Product | Books, manuscripts, workflows, deliverables, user outcomes, product identity | None |
| Business authority | Task Intent, Plan Envelope, Capability Grants, Policy Documents, decisions, Effects, receipts, release permission | None; execution approvals cannot create domain authority |
| Business records | AI7 Task Ledger and all domain ledgers | Technical execution events only |
| Agent execution | Which Runs exist, source scope, budgets, providers, continuation meaning, consequential Effect boundary | One selected agent loop: context, turns, model interaction, tool dispatch, streaming, in-turn recovery, technical sessions |
| Interface | AI7 application-owned editor, dashboards, records, controls, and review surfaces | Protocol/events that AI7 may project into its interface |

Codex Thread/Turn/Item records and DeepSeek Harness Session events are never AI7 business completion, Effect Receipts, manuscript authority, or Public Release Permission.

## Revised A2

### A2 — Codex-first agent harness selection and composition closure

**Blocked by:** stable A1 product invariants. The owner's exact parity/support choice may remain pending during read-only A2 evidence work.

**Leading options to evaluate:**

1. Codex app-server as the preferred embedded-product candidate.
2. Codex SDK or `codex exec` only for bounded programmatic/background roles where their reduced lifecycle surface is sufficient.
3. Codex secondary development for verified gaps, with the exact adapter/upstream/patch/fork maintenance form still requiring a separate disposition.
4. DeepSeek Harness `0.1.0-rc.6` as an alternative runtime candidate only after both an exact Codex Capability Gap and a Mature Runtime Alternative in DeepSeek are proven and the owner explicitly reopens the runtime choice.
5. A mixed design only after the same re-entry gate and a later owner decision accepts a composition that proves mutually exclusive responsibilities, one AI7 scheduling/effect authority, and no second implementation of the agent loop. Under Clarification 0001, a Codex-closed design has no DeepSeek production component.

**Required evidence and dispositions:**

- exact component/version/commit/package and transitive dependency closure;
- license, `NOTICE`, redistribution, update, pinning, and trademark treatment;
- local process topology, stdio/IPC, crash isolation, interruption, backpressure, resume, compaction, subagents, and diagnostics;
- Windows and macOS sandbox reality, filesystem roots, subprocesses, network surfaces, symlink/junction behavior, and failure modes;
- generic coding defaults, prompts, tools, shell, filesystem, and network packages that must be absent from Editorial Runs;
- mapping of Codex Thread/Turn/Item or DeepSeek Session events to the Harness Session Ledger without copying them into the AI7 Task Ledger;
- distinction between execution-layer approval and every AI7 authorization, decision, Effect, receipt, and release record;
- model/provider/auth coupling, credential path, configured-model processing, fallback, egress, and the claimed replaceability boundary;
- fit with the TypeScript/Node/Electron topology, headless verification, packaging channels, offline startup, upgrades, and resource budgets;
- application-owned MCP/capability facade, Run Source Scope, per-Book isolation, concurrency, scratch/cache separation, and narrow tool surface;
- UX event semantics needed by the AI7 desktop without inheriting Codex branding or coding-agent assumptions;
- explicit Keep/Adapt/Reject/Spike disposition for both Codex and DeepSeek surfaces.
- per-gap proof, Codex secondary-development design and lifecycle cost, DeepSeek maturity proof where claimed, and an auditable application of the gap-closure ladder.

**Exit:** select one execution-loop authority, or document a provably non-overlapping composition; prove, reject, or spike every relied-on seam; and provide the exact executable/process/tool/network surface that A3 must attack.

## Effect on A3 and hostile review

A3 must test the actual surface selected by the revised A2, not the former DeepSeek-only assumption. The final hostile review must attack Codex default leakage, provider coupling, protocol/version drift, approval-versus-domain-authority confusion, dual-loop ambiguity, licensing/notices, and Codex-like UI implementation smuggling in addition to the existing challenge charter.

## Still prohibited

- Installing dependencies, copying or vendoring Codex or DeepSeek source, or building a prototype in this phase.
- Treating a moving upstream branch as a product pin.
- Giving an Editorial Run generic shell, roaming filesystem, arbitrary network, coding presets, or developer-profile escalation.
- Renaming AI7, displaying Codex or Harness as product branding, or copying a desktop UI implementation.
- Starting implementation, implementation issue decomposition, a pull request, push, merge, or release without separate authorization.
