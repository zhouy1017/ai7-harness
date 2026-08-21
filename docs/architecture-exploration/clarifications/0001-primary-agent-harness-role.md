# Clarification 0001 — Codex and DeepSeek Harness production roles

Status: **owner accepted for the V2 candidate; canonical integration pending; Codex assignment remains contingent on A2 capability closure**

Recorded: **2026-08-21**

Decision owner: **AI7 owner**

Record owner: **Repository Development Commander**

## Question

If A2 proves that Codex Harness provides every capability AI7 requires from its production agent harness, should Codex become the only production agent loop while DeepSeek Harness becomes a non-runtime design reference?

## Recommended answer presented

Yes. Keep one production agent-loop authority. When Codex passes the exact A2 capability-closure gate, use Codex as that authority and retain DeepSeek Harness only as evidence for development rules, composition patterns, and documentation practice.

## Exact owner answer

> 同意，并且如果codex harness能提供全部能力，则dsh只提供开发规则与文档经验方向的指导

## Accepted interpretation

1. Passing A2 capability closure assigns Codex the **Primary Agent Harness** role and makes it AI7's only production implementation of the generic model conversation and tool-dispatch loop.
2. Under that condition, DeepSeek Harness is a **Development Reference Framework** only. Its useful rules, design patterns, checklists, and documentation experience may be re-expressed in AI7-owned design records or Agent Behavior Assets.
3. DeepSeek Harness then contributes no product package, process, Session ledger, agent loop, tool runtime, capability grant, fallback executor, or user-facing branding.
4. DeepSeek guidance never carries runtime authority and never changes AI7 ownership of product semantics, business records, Policy Documents, Effects, credentials, providers, or the interface.
5. This answer does not assert that Codex has already passed capability closure. If A2 finds a load-bearing gap, the Worker must record exact evidence and return the residual architecture choice to the Commander; DeepSeek does not silently re-enter as a runtime or fallback.

## Resolved V2 terms

**Primary Agent Harness** (`主代理执行框架`):
The single production framework that owns AI7's generic model conversation, context assembly, turn progression, model invocation, tool dispatch, streamed technical events, and in-turn recovery. AI7 retains every product and business authority. Codex fills this role only after A2 capability closure.

**Development Reference Framework** (`开发参考框架`):
A non-runtime source of development rules, architecture patterns, composition ideas, evaluation checklists, and documentation practice. It contributes no product dependency, executable, process, Session authority, tool surface, fallback path, branding, or capability grant. DeepSeek Harness takes this role if Codex passes A2 capability closure.

**Harness Capability Closure** (`执行框架能力闭合`):
An A2 evidence result showing that one exact candidate surface supplies every load-bearing agent-loop capability required by AI7, either natively or through a narrow AI7-owned adapter that does not reproduce a second generic loop. Closure is not a feature impression, compilation result, or upstream marketing claim.

The Worker must place these terms in the owning candidate execution `CONTEXT.md` and bilingual glossary on its branch. Use vendor-qualified **Codex Harness** or **DeepSeek Harness** whenever a claim concerns a vendor's code, protocol, package, Session type, license, or evidence; do not use unqualified “Harness” where the vendor or authority boundary matters.

## Consequences for the V2 candidate

- A2 must test Codex against a closed, evidence-bearing capability matrix rather than assume equivalence from the platform article or repository shape.
- Missing documentation conventions, prompts, profiles, or composition idioms do not by themselves justify a second runtime; the candidate should first express them as AI7-owned behavior assets, policy, configuration, or development guidance.
- A runtime-level gap may reopen the vendor choice only when the candidate shows why a bounded AI7 adapter cannot close it without creating a second generic agent loop.
- The coherent candidate must contain one production execution authority and an explicit Keep/Adapt/Reject/Spike disposition for DeepSeek Harness.

## Canonical-integration boundary

This record is an exact owner input to the noncanonical V2 candidate. It does not by itself edit or supersede canonical `main` records. If A2 proves Codex capability closure and the owner accepts the coherent V2 architecture through the normal integration path, that integration must revise at least:

- `docs/domain/execution/CONTEXT.md`, where DeepSeek is currently named as the accepted Agent Behavior Framework;
- `GLOSSARY.md`, to index the vendor-neutral V2 terms;
- ADR 0020, whose exact-pinned DeepSeek package decision would no longer describe the production dependency;
- ADR 0021 and dependent records, to vendor-qualify the single execution authority without weakening the one-loop invariant; and
- `AGENTS.md` plus every design note that currently treats DeepSeek packages or Sessions as the selected production surface.

## ADR qualification

This choice is hard to reverse because it determines the shipped execution dependency and persisted technical history; surprising because V1 selected DeepSeek packages while V2 may retain only their design experience; and the result of a real trade-off between single-loop integrity and dual-framework fallback. The Worker must therefore create or disposition a candidate ADR on its own branch. The record remains noncanonical until the coherent V2 candidate follows the normal acceptance and integration path.

## Writer transition

The Commander owns this immutable clarification record. The Issue #4 Worker must consume the exact Git object supplied by the Commander, cite it in the candidate, and write all resulting candidate context, glossary, ADR disposition, and architecture changes only on `docs/4-v2-architecture-candidate`. The Worker must not consume the Commander/user transcript or edit this record.
