# Glossary reference (V2 candidate)

Status: **candidate-local bilingual index; definitions live in the candidate execution context**

| English term | Preferred Simplified Chinese | Definition owner |
| --- | --- | --- |
| Primary Agent Harness | 主代理执行框架 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Primary Agent Harness Adapter | 主代理执行框架适配器 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Codex Interaction Model Reference | Codex 交互模型参考 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Fast Interaction Role | 快速交互角色 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Main Editorial Role | 主编辑角色 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Difficult Escalation Role | 疑难升级角色 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Frontier Model Role | 前沿模型角色 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Third-Party DSH Plugin | 第三方 DSH 插件 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Plugin Admission Snapshot | 插件准入快照 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Local Plugin Pin | 本地插件版本锁定 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |
| Implementation Assumption | 实现假设 | [Execution (V2 candidate)](./domain/execution/CONTEXT.md) |

## Collision guide

| Candidate term | Do not confuse it with |
| --- | --- |
| Primary Agent Harness | AI7 product/runtime authority, a Model Provider, or one DSH technical Session. It names the one generic-loop role, assigned to DeepSeek Harness. |
| Primary Agent Harness Adapter | The generic agent loop or the AI7 Capability Facade. It contains and composes DSH; it decides nothing. |
| Codex Interaction Model Reference | A dependency, process, provider, session owner, fallback, adapter target, source baseline, layout, brand, or component library. It ships nothing. |
| Fast / Main / Difficult / Frontier Model Role | A provider name, model identifier, endpoint, credential, price tier, or authority level. Roles are declared; bindings are resolved by Provider Preflight. |
| Frontier Model Role | A second harness, a silent fallback path, or a factual authority. An alternative provider is configuration inside the same loop and plan. |
| Third-Party DSH Plugin | A Task Skill, Policy Document, Model Provider, credential, Authority Ceiling, Effective Capability Grant, or user-facing brand. |
| Plugin Admission Snapshot | A runtime health check, quality score, evaluation programme, CI gate, or recurring measurement. |
| Local Plugin Pin | A version range, update channel, or auto-update policy. It is immutable and rolls back to its predecessor. |
| Implementation Assumption | Capability evidence, a test gate, or permission to weaken a product requirement. |

Canonical terms continue to be indexed by the root [`GLOSSARY.md`](../../GLOSSARY.md) and defined by their canonical contexts. This candidate does not redefine Task Ledger, Harness Session Ledger, Execution Binding, Harness Execution Span, Model Role, Capability Implementation, Capability Grant, Effect Approval, or Effect Receipt.
