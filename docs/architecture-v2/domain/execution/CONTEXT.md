# Execution (V2 candidate)

Status: **candidate-local definition owner; noncanonical**

This context defines only V2-specific execution roles. All established AI7 terms retain their canonical definitions in [`docs/domain/execution/CONTEXT.md`](../../../domain/execution/CONTEXT.md), especially Task Ledger, Run Record, Harness Session Ledger, Execution Binding, Harness Execution Span, Task Skill Activation, Capability Grant, Provider Resolution Plan, Run Authorization, Effect Approval, Effect Receipt, Resume, Retry, Redo, and Replay.

## Language

**Primary Agent Harness** (`主代理执行框架`):
The single production framework that supplies AI7's generic model conversation, context assembly, turn progression, model invocation, tool dispatch, streamed technical events, compaction, subagent mechanics where used, and in-turn recovery. In the V2 candidate this role is assigned to Codex. AI7 retains every product and business authority.
_Avoid_: AI7 runtime, product authority, generic harness, second loop.

**Development Reference Framework** (`开发参考框架`):
A framework used only for development rules, architecture and composition experience, checklists, and documentation guidance. It contributes no product dependency, executable, process, Session authority, tool surface, fallback, branding, or capability grant. In V2 this describes DeepSeek Harness.
_Avoid_: secondary harness, backup runtime, reference implementation.

**Primary Agent Harness Adapter** (`主代理执行框架适配器`):
The AI7-owned module in the Node service that presents AI7-shaped execution operations while hiding Codex protocol, process, technical-session, tool-event, provider-invocation, storage, and source-build details. It writes no AI7 domain record and grants no authority.
_Avoid_: agent loop, capability facade, provider broker.

**Codex Secondary Development** (`Codex 二次开发`):
Bounded AI7 engineering through Codex public seams or a small maintained Codex source build/fork to supply missing integration behavior while retaining Codex as the one Primary Agent Harness. It is an ordinary implementation option, not a capability-gap proof programme.
_Avoid_: AI7 agent loop, Codex app clone, automatic DeepSeek re-entry.

**Implementation Assumption** (`实现假设`):
A design-stage expectation about Codex or platform behavior paired with a bounded response if implementation finds otherwise. It records uncertainty without creating an evidence task, validation gate, authority, or product promise.
_Avoid_: verified capability, defect, acceptance test, owner blocker.

**Codex Desktop-like Interaction Reference** (`Codex Desktop 式交互参考`):
Principles for task capture, context, progress, interruption, clarification, history, and review that AI7 may reinterpret for professional editorial work. It licenses no Codex branding, layout, source, assets, generic chat hierarchy, coding presets, or coding-agent purpose.
_Avoid_: Codex UI baseline, component library, product shell.

## Retained boundaries

- The AI7 Task Ledger and domain ledgers own business truth; the Harness Session Ledger owns Codex technical history.
- Execution Bindings and Harness Execution Spans correlate ledgers without copying transcripts or transferring authority.
- Run Authorization, execution-layer approval, Effect Approval, editorial decisions, Public Release Permission, and Effect Receipts remain distinct.
- Resume continues the same unchanged Run, Retry creates a new safe attempt, Redo creates a new authorized Run, and Replay performs no execution.
- Provider Preflight and the Provider Resolution Plan bind providers, fallback, outbound data, credentials, and budget before execution.
- The Task Skill Activation and Capability Grants are enforced at both the Codex-facing tool guard and the AI7 Capability Facade.

The former candidate terms Harness Capability Closure, Codex Capability Gap, Mature Runtime Alternative, and DeepSeek Runtime Re-entry Gate are retired from active V2 language because Clarification 0004 removed the proof ladder. A future DeepSeek runtime proposal is simply a new explicit owner decision.
