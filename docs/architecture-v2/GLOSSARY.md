# Glossary Reference (V2 candidate)

Status: **Issue #4 candidate-local noncanonical index; defines nothing and accepts nothing**

This is a bilingual reference index and collision guide for the terms created by the exact owner resolutions registered in A1. It follows the discipline of the canonical [Glossary Reference](../../GLOSSARY.md): English terms are stable architecture identifiers, the Simplified Chinese column is the preferred Chinese-first label, and **definitions live in the owning context file, never here**.

It is **candidate-local**. It does not add rows to, edit, or supersede the canonical root glossary, and no term below is an accepted AI7 term. Promotion requires explicit owner acceptance and Commander integration under the [architecture-to-implementation gate](../agents/multi-session-design-workflow.md#architecture-to-implementation-gate).

## Context indexes

- [Execution (V2 candidate)](./domain/execution/CONTEXT.md) — definition owner for every term below.
- [AI7 Execution](../domain/execution/CONTEXT.md) — canonical owner at `main@c8cbe26`; unchanged by this candidate.
- [Glossary Reference](../../GLOSSARY.md) — canonical bilingual index; unchanged by this candidate.

## Candidate term index

| English candidate term | Preferred Simplified Chinese | Candidate owner | Conditional on |
| --- | --- | --- | --- |
| Primary Agent Harness | 主代理执行框架 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | A future A2 proving Harness Capability Closure for an exact Codex surface. |
| Development Reference Framework | 开发参考框架 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | The same closure pass; it is the resulting DeepSeek disposition. |
| Harness Capability Closure | 执行框架能力闭合 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | A future A2 defining and closing the capability matrix; A1 asserts no result. |
| Codex Capability Gap | Codex 能力缺口 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | Proof against an exact Codex component, pin, protocol, and supported configuration. |
| Codex Secondary Development | Codex 二次开发 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | A verified gap; the maintenance form remains an open question. |
| Mature Runtime Alternative | 成熟运行时替代方案 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | Proof against an exact, obtainable, maintained, testable surface. |
| DeepSeek Runtime Re-entry Gate | DeepSeek 运行时重评关口 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) | Both an unclosed verified Codex gap and a proven Mature Runtime Alternative. |

## Collision guide

These candidate terms sit close to accepted vocabulary. Record the distinction before using either word.

| Candidate term | Potentially confused with | Distinction to hold |
| --- | --- | --- |
| Primary Agent Harness | Harness agent loop / Harness Session / "the harness" | The canonical terms name whichever executor is composed; the candidate term names the **single production role** and, under a closure pass, binds it to Codex. It is a role, not a vendor. |
| Development Reference Framework | Agent Behavior Framework / Harness Agent Behavior Layer / Harness Behavior Composition | The canonical terms currently describe a **shipped** DeepSeek composition. The candidate term describes a framework that ships nothing: no package, process, Session, tool, grant, fallback, authority, or branding. |
| Harness Capability Closure | Harness Behavior Composition / "full engine" / capability coverage | Closure is an **evidence result** about one exact surface, not a composition setting, a feature list, or a compilation success. |
| Codex Capability Gap | AI7 Capability / Capability Implementation / Capability Grant | Those are product authority records. A Codex Capability Gap is a **verification finding** about an executor surface and grants nothing. |
| Codex Secondary Development | Agent Behavior Improvement / Task Skill / Capability Implementation | Secondary Development is AI7 engineering work on the **executor**; the others are editorial-behavior and product-capability records. Neither substitutes for the other. |
| Mature Runtime Alternative | Model Provider / Approved Fallback Chain / Provider Resolution Plan | Those govern **model access** inside a Run. A Mature Runtime Alternative concerns the **agent-loop runtime** and never becomes a provider fallback. |
| DeepSeek Runtime Re-entry Gate | Workflow Gate / Standalone Editing Sufficiency Gate / Approved Fallback Chain | Those are editorial and product gates. This gate is an **architecture-evaluation** gate; passing it admits comparison only and never activates fallback, dual runtimes, or a second agent loop. |

## Chinese-label cautions

- `执行框架` in `主代理执行框架` and `执行框架能力闭合` renders **harness** as an execution framework role. The canonical glossary keeps `Harness` untranslated in `Harness 会话`, `Harness 工具`, and related rows. Do not retranslate canonical rows from these candidate labels, and never use bare `执行框架` for a specific vendor.
- `开发参考框架` is deliberately not `智能体行为框架` (Agent Behavior Framework). The first ships nothing; the second currently names composed, shipped behavior machinery.
- `Codex 能力缺口` and `成熟运行时替代方案` describe **unproven conditions**. Do not use either in a sentence that reads as a finding until an A2 record proves it.
- `DeepSeek 运行时重评关口` is a re-evaluation gate (`重评`), not a fallback (`回退`) or a switch (`切换`). Translating it as either would assert an outcome the owner has not chosen.
- No candidate label is a product surface label. AI7 remains the only user-facing product name; neither Codex nor Harness is user-facing branding.
