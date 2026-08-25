# V2 implementation assumptions

Status: **explicit design assumptions; not evidence requests or architecture gates**

V2 proceeds with DeepSeek Harness (DSH) as the sole Primary Agent Harness, composed inside the AI7 Node service. When implementation encounters different DSH behavior, use the response below and continue with the same AI7-owned architecture. Escalate only when the response would materially change product scope or authority.

None of these rows is a task. There is no audit, probe, score, capability matrix, prototype, or review gate attached to any of them.

## Composition and loop

| Assumption | Consequence if true | Design response if false |
| --- | --- | --- |
| The needed DSH behavior is available as a selectable package subset without the `@deepseek-ai/dsh` CLI aggregate. | The excluded shell, pwsh, terminal, and web tool packages stay absent from the dependency graph. | Take the narrowest packages that still exclude them and supply the remainder as AI7-owned code. Never take the aggregate to obtain one feature. |
| DSH composition can be driven entirely from AI7-owned configuration rather than shipped presets. | AI7 authors its own profiles, bundles, instructions, and tool pipelines for editorial work. | Override or replace the preset layer in AI7-owned composition code; do not inherit a coding preset because disabling it is inconvenient. |
| DSH exposes the generic loop as an embeddable library inside the AI7 service process. | The composed runtime stays in-process with no TCP listener and no fourth authority. | Supervise a private local child process over stdio or a platform-private local IPC adapter behind the same boundary. Do not expose a network port and do not write an AI7 loop. |
| AI7 can drive turns, streaming, interruption, and compaction through documented seams. | The boundary maps these primitives directly. | Add an AI7-authored extension at the nearest documented seam. A fork of the generic loop requires an accepted seam-gap decision, not an implementation choice. |
| Harness `schedule`, `jobs`, and workflow packages can be omitted entirely. | AI7 owns scheduling, concurrency, budget, and background work with no competing scheduler. | Compose without them and, if a needed feature is entangled with them, reimplement the narrow part in AI7 rather than adopting a second scheduler. |
| Concurrent executions can be isolated within one composed runtime. | A bounded shared composition may serve several Runs. | Compose one runtime instance per Run or use isolated pools with per-execution storage, scratch, cache, and scope. Scratch and cache are never shared. |
| DSH subagents, when useful, remain within one parent technical execution. | They inherit the Run envelope without new AI7 business records. | Use a single agent for that workflow. AI7 does not emulate subagents with a second loop. |
| DSH Session events can be normalized to the closed AI7 signal set with exactly one terminal signal. | UI progress and technical outcomes are consistent. | Normalize at the boundary; ambiguous endings stop automatic continuation. |

## Storage, authority, and capabilities

| Assumption | Consequence if true | Design response if false |
| --- | --- | --- |
| DSH technical sessions can be stored under an AI7-controlled location. | The Harness Session Ledger stays inside the Agent Data Root. | Configure or wrap the store at the boundary. If neither works, keep an AI7-owned session store and treat the DSH store as disposable technical cache. |
| Coding-native tools and defaults can be excluded from an editorial Run. | Package selection plus composition plus the Capability Facade are enough. | Remove the contributing package or its registration in AI7-owned composition. Do not rely on hiding UI controls or on the facade alone. |
| AI7 can expose domain capabilities through the DSH tool registry. | DSH dispatches tools while AI7 retains authorization and execution. | Contribute an AI7-authored tool provider at the documented seam and keep the facade as the decisive check. |
| AI7 can intercept or pre-answer DSH execution approval requests. | Editors see AI7 decisions, not generic safety prompts. | Disable the prompt path in composition and route the technical decision through the boundary. A harness approval never becomes domain authority. |
| Platform filesystem controls can supplement the AI7 Capability Facade on Windows and macOS. | Native controls add defence in depth while AI7 continues to enforce semantic scope. | Keep file access behind AI7 capabilities and treat the capability/service facades as authoritative. Never claim whole-process OS confinement without a selected mechanism, and never ask an editor to assess a generic escalation. |
| Composition and plugin identity can be pinned into the Execution Binding and verified at start and reattach. | Unknown composition identity fails closed instead of running. | Compute an AI7-owned configuration digest at the boundary; refuse to start on a digest AI7 cannot reproduce. |
| An identified capability or composition need can be met by AI7-owned code or a DSH seam. | No third-party plugin is needed and the dependency graph stays minimal. | Admit a Third-Party DSH Plugin under ADR 0002 with a dated Plugin Admission Snapshot and an immutable Local Plugin Pin, or return the exception to the owner if no candidate qualifies. |

## Providers, credentials, and egress

| Assumption | Consequence if true | Design response if false |
| --- | --- | --- |
| Provider and model selection can be supplied per bound execution. | Provider Preflight stays AI7-owned and models stay replaceable. | Place an AI7 provider gateway beneath the boundary; never let a Task Skill, a DSH default, or a model select an unapproved provider. |
| The four accepted Model Roles map onto DeepSeek V4 Flash, V4 Pro High, and V4 Pro Max as offered. | The accepted defaults bind directly. | Bind the nearest eligible DeepSeek model that satisfies the role's hard requirements and record the substitution in the Provider Resolution Plan. A capability shortfall is a provider-configuration matter, not an architecture change. |
| An alternative frontier provider can be configured behind the same plan, loop, and gate. | Frontier work stays configurable without a second harness. | Add the provider adapter beneath the AI7 provider gateway. If it cannot honour the plan, credential brokering, or egress gate, it is not eligible. |
| AI7 can inspect the final complete payload immediately before each model transmission. | The Provider Payload/Egress Gate enforces scope and egress after Session history, compaction, tool results, subagent context, and defaults are assembled. | Move final assembly and transmission behind an AI7 provider gateway. If the complete payload cannot be checked, send nothing. |
| Credentials can be delivered transiently without entering Session content or diagnostics. | The Credential Broker remains the sole secret resolver. | Isolate the provider gateway so the harness never receives a value, only an opaque reference. |
| Approved provider fallback can be constrained by AI7. | Safe fallback follows the frozen Provider Resolution Plan. | Disable harness-managed fallback and perform only AI7-classified safe continuation through a new technical span. |
| DSH can operate with outbound diagnostics and telemetry disabled or bounded. | The configured model call remains the only ordinary manuscript egress. | Disable the path in composition; if unavoidable, block it at the egress gate and do not route manuscript-bearing Runs through it. |

## Product and platform

| Assumption | Consequence if true | Design response if false |
| --- | --- | --- |
| DSH pin bumps can be absorbed one at a time by AI7-owned composition. | Ordinary upstream change stays local to the boundary. | Hold the current pin and adapt the boundary. Upstream drift never creates a separate CI gate and never justifies a range or `latest`. |
| The pinned DSH subset is compatible with the shipped Node/Electron ABI on Windows and macOS. | Both platform products can be built from one source and one architecture. | Adjust the Electron/Node pairing or the subset. A named capability with no adequate Node implementation may enter as a bounded native module or sidecar under its own ADR. |
| Codex Interaction Model Reference patterns translate to professional editorial work. | AI7 gains legible agent interaction without becoming a chat clone. | Adjust AI7-owned interaction design around editor workflows. Nothing is copied from Codex and nothing is blocked by it. |
| Manuscript scale and durability remain independent of model context and harness memory. | The paging store, bounded editor, retrieval, and Exact Fetch carry long-document work. | Reduce model context further and stream through AI7 capabilities; never place a whole manuscript in the renderer or one model turn. |

## Accepted implementation risks

These risks are consciously accepted under the design-first/E2E-only policy. Their responses are runtime fail-closed behavior, not new validation, audit, review, probe, or proof tasks.

| Accepted risk | What may go wrong | Fail-closed response |
| --- | --- | --- |
| Pinned pre-release DSH baseline `0.1.0-rc.6` | An upstream pre-release may change API, configuration schema, or session format between pins, or stall entirely. | Stay on the ADR 0020 pin; bump one version at a time behind the boundary. Refuse to start on a composition identity AI7 cannot reproduce. A sustained upstream discontinuity is an owner decision, not a runtime workaround. |
| Third-party plugin abandonment or license drift | An admitted plugin may stop being maintained or change its terms upstream after admission. | The Local Plugin Pin keeps builds on the admitted immutable artifact and the predecessor pin stays available for rollback. Admission facts are not re-measured at runtime; replacing the plugin is ordinary development work. |
| Inherited harness defaults | A DSH default preset, prompt, tool, or provider setting may reach an editorial Run because it shipped rather than because it was chosen. | Exclude the contributing package where possible, justify every remaining default in AI7-owned composition, and let the Capability Facade and egress gate refuse anything the Plan Envelope does not cover. |
| E2E-only CI blind spots | Performance, security, provider, packaging, protocol, or rare edge-case regressions may escape CI. | At runtime, refuse any execution whose binding, composition identity, scope, payload egress, capability authority, or Effect outcome cannot be established. When a user-visible bug is observed, fix it and add the applicable E2E regression; do not create a separate gate. |
| Long-manuscript cursor and selection drift | A bounded editor cursor or selection may become stale or ambiguous after revision, window, block, or structure changes. | Bind every consequential cursor/range to branch, Manuscript Revision, stable block identity, offsets/range, and digest as applicable. If exact re-resolution is stale or ambiguous, refuse mutation/apply and require refresh or explicit reselection. |
| Agent interaction drift | Task/progress/history patterns may slide into a generic coding chat, hide Book/scope/authority, or make the harness thread appear authoritative. | Keep Book, manuscript, workflow, evidence, proposal, and named AI7 decisions as the visible anchors. If exact target, scope, or authority is not visible at a consequential action, disable the action until AI7 context is restored. |

The former exact-artifact, capability-score, Codex-runtime, proof, and probe questions are historical reference only. None is carried forward as a prerequisite, planned validation task, or CI surface.
