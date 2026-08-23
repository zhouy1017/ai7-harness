# V2 implementation assumptions

Status: **explicit design assumptions; not evidence requests or architecture gates**

V2 proceeds with Codex as the sole Primary Agent Harness. When implementation encounters a different Codex behavior, use the response below and continue with the same AI7-owned architecture. Escalate only when the response would materially change product scope or authority.

| Assumption | Consequence if true | Design response if false |
| --- | --- | --- |
| Codex exposes a local integration surface for persistent conversations, turns, streaming, interruption, tools, and compaction. | The AI7 adapter maps these primitives directly. | Add the missing hook through a small maintained Codex source build; do not create an AI7 loop. |
| Codex technical sessions can be stored under an AI7-controlled location. | The Harness Session Ledger remains inside the Agent Data Root. | Redirect storage in the adapter/source build or maintain an AI7-controlled Codex build with a configurable store. |
| Codex can start lazily and run privately under the Node service. | Offline startup and local editing remain independent. | Separate the Codex child lifecycle more aggressively; never make the desktop depend on provider or harness startup. |
| Stdio or another non-listening local transport is sufficient. | No TCP listener enters the product. | Add a Windows named-pipe or in-process bridge in the maintained integration. Do not expose a network port. |
| Coding-native tools and defaults can be excluded from an Editorial Run. | Stock configuration plus the AI7 Capability Facade may be enough. | Remove their registration or defaults in the maintained Codex source build. Do not rely on hiding UI controls. |
| AI7 can expose domain capabilities through a Codex-supported tool seam. | Codex selects tools while AI7 retains authorization and execution. | Adapt the tool protocol or add a narrow contributor hook in Codex source. |
| AI7 can intercept or pre-answer Codex execution approval requests. | Editors see AI7 decisions, not generic safety prompts. | Disable the Codex prompt path and route the technical decision through the adapter. Codex approval never becomes domain authority. |
| Provider/model selection can be supplied per bound execution. | Provider Preflight remains AI7-owned and models stay replaceable. | Add a provider gateway or source hook behind the adapter; do not let Task Skills or Codex select an unapproved provider. |
| Credentials can be delivered transiently without entering Session content or diagnostics. | The Credential Broker remains the sole secret resolver. | Add a brokered credential channel in the adapter/source build or isolate the provider gateway. |
| Approved provider fallback can be constrained by AI7. | Safe fallback follows the frozen Provider Resolution Plan. | Disable Codex-managed fallback and perform only AI7-classified safe continuation through a new technical span. |
| Concurrent Codex executions can be isolated. | A bounded shared process or pool may be used. | Supervise one Codex process per Run or use isolated pools with per-execution storage, scratch, cache, and scope. |
| Codex subagents, when useful, remain within one parent technical execution. | They inherit the Run envelope without new AI7 business records. | Use a single agent for that workflow. AI7 does not emulate subagents with a second loop. |
| Codex terminal events can be normalized to the closed AI7 signal set. | UI progress and technical outcomes are consistent. | Normalize in the adapter or patch the event source; ambiguous endings stop automatic continuation. |
| Codex can operate with outbound diagnostics and telemetry disabled or bounded. | The configured model call remains the only ordinary manuscript egress. | Disable or remove the path in the maintained source build; if unavoidable, do not send manuscript-bearing Runs through it. |
| Windows filesystem confinement can combine restricted process rights with the AI7 Capability Facade. | Codex receives real permission only inside intended roots while semantic scope is checked again by AI7. | Tighten the process identity/sandbox or move file access entirely behind AI7 capabilities. Never ask an editor to assess a generic escalation. |
| Codex protocol and source changes can be absorbed locally. | The adapter localizes ordinary upstream change. | Pin a maintained source baseline or revise the adapter. Upstream drift does not create a separate CI gate. |
| Codex Desktop-like task/progress/review principles translate to professional editorial work. | AI7 gains a familiar, legible agent interaction without becoming a chat clone. | Adjust AI7-owned interaction design around editor workflows; never copy Codex layout or branding. |
| Manuscript scale and durability remain independent of model context and Codex memory. | The paging store, bounded editor, retrieval, and Exact Fetch carry long-document work. | Reduce model context further and stream through AI7 capabilities; never place a whole manuscript in the renderer or one model turn. |
| A small maintained Codex source build remains materially smaller than owning a second harness. | Direct secondary development is a pragmatic option. | If changes grow into an independent platform or change authority, return the expanded choice to the owner before proceeding. |

The former exact-artifact, capability-score, proof, and probe questions are historical reference only. None is carried forward as a prerequisite, planned validation task, or CI surface.
