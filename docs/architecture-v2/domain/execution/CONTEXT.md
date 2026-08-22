# Execution (V2 candidate)

Status: **Issue #4 candidate-local noncanonical context; not a canonical term owner**

This file is the definition owner for the execution-layer terms created by the exact owner resolutions registered in A1. It is **candidate-local**: it belongs to the `docs/architecture-v2/` Issue #4 candidate only. It does not amend, supersede, or extend the canonical [Execution context](../../../domain/execution/CONTEXT.md) at `main@c8cbe26`, and none of its terms is a canonical AI7 term until the owner accepts the candidate and the Commander integrates it.

Every term below is **conditional vocabulary**. Defining a term names a possible future state; it does not assert that the state holds. A1 asserts no capability closure, no capability gap, no runtime selection, and no maintenance form.

The bilingual index for these terms — including collisions with canonical labels — is the candidate [GLOSSARY](../../GLOSSARY.md). The conditional disposition that uses them is candidate [ADR 0001](../../adr/0001-conditional-primary-agent-harness-and-gap-closure.md). Their exact owner basis is [OR-2026-08-21-01](../../DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) and [OR-2026-08-21-02](../../DECISION-QUEUE.md#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending).

## Language

### Runtime roles

**Primary Agent Harness** (`主代理执行框架`):
The single framework that supplies AI7's generic agent loop in production — model conversation, context assembly, turn progression, model invocation, tool dispatch, streamed technical events, and in-turn recovery. Exactly one may exist for a production Run.
_Avoid_: agent runtime, execution engine, the harness, primary harness.

**Development Reference Framework** (`开发参考框架`):
A framework AI7 studies but never ships: its rules, patterns, checklists, and documentation experience may be re-expressed in AI7-owned records and assets, while it contributes no package, process, Session, tool, capability grant, fallback executor, runtime authority, or user-facing branding.
_Avoid_: reference implementation, inspiration source, secondary harness.

### Evidence results

**Harness Capability Closure** (`执行框架能力闭合`):
The evidence result that one exact candidate surface supplies every load-bearing AI7 agent-loop capability, either natively or through a narrow AI7 adapter that does not reproduce a second generic loop. `Codex Harness Capability Closure` is this result evaluated against an exact Codex surface. A future A2 must define and close the matrix; compilation, repository shape, an official article, or a feature impression is not this result.
_Avoid_: feature coverage, parity, capability match, "it can do everything".

**Codex Capability Gap** (`Codex 能力缺口`):
A verified finding that a load-bearing AI7 requirement cannot be satisfied by an exact Codex component, pin, protocol, and supported configuration. Missing documentation, an undiscovered seam, or an untested assumption is a claim, not this finding.
_Avoid_: Codex limitation, missing feature, blocker.

**Mature Runtime Alternative** (`成熟运行时替代方案`):
An exact non-Codex surface proven obtainable, license- and platform-compatible, maintained, and testable, with credible lifecycle, persistence, security, upgrade, packaging, and verification behavior. A repository feature, design document, unpublished package, or marketing claim does not establish it.
_Avoid_: viable option, backup runtime, second harness.

### Remedies and gates

**Codex Secondary Development** (`Codex 二次开发`):
AI7-owned work that closes a verified Codex Capability Gap while preserving one Primary Agent Harness and every AI7 authority boundary. It is costed across implementation, testing, security, licensing and notices, platform behavior, upstream updates, protocol migration, and long-term maintenance. Its form — external adapter or extension, upstream contribution, maintained patch set, or fork — is an open question, not a property of the term.
_Avoid_: patching Codex, customization, extending Codex.

**DeepSeek Runtime Re-entry Gate** (`DeepSeek 运行时重评关口`):
The two-condition test that must pass before DeepSeek Harness may be compared as a production runtime again: a proven Codex Capability Gap that remains unclosed, and an exact DeepSeek surface proven to be a Mature Runtime Alternative. Passing it admits comparison and returns a new choice to the owner; it never selects DeepSeek, creates automatic fallback, permits dual runtimes, or authorizes a second agent loop.
_Avoid_: DeepSeek fallback, failover path, dual-runtime mode, reopening DeepSeek.
