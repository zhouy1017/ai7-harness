# Harness Agent-behavior Purpose

Status: **accepted; authority and composition settled by Questions 29 to 31**

## Accepted purpose

The main contribution sought from DeepSeek Harness is a framework for achieving better LLM-agent behavior. AI7 will study and adopt the behavior-shaping patterns and extension seams at the pinned Harness revision, not merely reuse its model adapter or generic loop.

This is compatible with the no-training invariant. The provided Foundation Model supplies general language and reasoning capability; the Harness Agent Behavior Layer determines how that capability is organized into reliable action; the AI7 Editorial Intelligence Layer supplies the professional knowledge, source authority, quality criteria, and publication governance required for editorial work.

| Layer | Governs | Does not own |
| --- | --- | --- |
| Foundation Model | General language and reasoning capability | AI7 knowledge, editorial authority, or persistent behavior policy |
| Harness Agent Behavior Layer | Context assembly, prompts, planning, tool choice, policy, workflows, subagents, sessions, recovery, and execution evidence | Book truth, publication authority, or LLM weights |
| AI7 Editorial Intelligence Layer | Exact sources, professional knowledge, Editorial Dimensions, memory, learning lineage, approvals, and delivery quality | Generic model capability or the core agent loop |

## What “learn from the Harness framework” means

It first means an engineering and product-design discipline:

- identify the pinned framework's public profiles, bundles, presets, plugin services, and lifecycle hooks;
- express AI7 behavior through those composition seams instead of forking the core loop;
- preserve the effective composition as a versioned, reconstructable artifact;
- evaluate observable behavior through applicable complete provider-free E2E journeys and production Quality Signals; any live-provider evidence requires separate authorization and the concrete Provider Processing Policy;
- improve prompts/context, tool affordances, policy, plans, workflows, subagent roles, recovery, and evidence based on those evaluations;
- retain a rollback path and correlate behavior versions with the tasks that used them.

It does not mean that the production agent may silently rewrite its own plugins, prompts, policies, or authority. Question 29 settled the boundary: an agent may propose revisions, while activation is tiered, capability expansion never self-activates, and every revision remains versioned, reviewable, and rollback-able.

## Exact-pin framework findings

The following findings are audited at DeepSeek Harness `47f943859bef60e4160492346772ded9b24f765a` (`0.1.0-rc.5`). “Reviewable” means version-pinned and reconstructable; it does not mean sandbox-secure.

| Seam | Pinned evidence | AI7 use | Limitation that shapes the design |
| --- | --- | --- | --- |
| Profiles and bundles | `docs/architecture.md`; `packages/boot/app-boot/src/profile.ts`; `apps/cli/src/profile-boot.ts`; `packages/bundle/{base,web-app,headless}/` | Distribute one pinned AI7 bundle and explicit profile | Effective order includes bundle, profile, home, and CLI overlays; row patches replace the whole `config` rather than deep-merging it. |
| Agent presets | `packages/preset/agent-presets/`; `packages/preset/persona/`; `apps/cli/config/agent-presets/` | Commit reviewed AI7 system presets for roles and capability sets | A started session stays on its mounted preset generation. User-authored presets have shell-equivalent trust; isolated and Host-plane services must not be confused. |
| Plugins and typed events | `docs/cordis-primer.md`; `docs/cookbook/extension-cookbook.md`; `docs/capability-seams.md`; `docs/event-producer-consumer.md` | Preferred static extension seam for AI7 behavior | Plugins must register reversible effects and dispose cleanly; use documented `agent/*`, `tools/*`, capability, and session events rather than modifying `agent-loop`. |
| Prompt and context assembly | `packages/core/system-prompt/`; `docs/subsystems/system-prompt.md`; `packages/context/agent-instructions/`; `packages/context/{time-context,session-reference,tmux-context}/` | Scoped, ordered AI7 prompt/context providers with logged updates | Whole-assembly transforms can erase other contributions; instruction refresh and truncation have limits; symlinked instructions can cross a repository trust boundary. |
| Tools, policy, and approvals | `packages/core/tools/`; `docs/tool-execution-pipeline.md`; `packages/interaction/{permission-presets,user-approval,tool-ask-user}/`; `packages/sandbox/` | Static AI7 tools plus independent policy, approval, and enforcement layers | Tool visibility restriction is not an authority boundary; approval is one-shot/in-turn; sandbox primarily protects filesystem effects, not network or general process visibility. |
| Plans, goals, workflows, and subagents | `packages/plan/plan-mode/`; `packages/goal/`; `packages/workflow/`; `packages/subagent/`; matching `docs/subsystems/*.md` | Use explicitly according to each task's durability and authority needs | Plan mode is guidance, goal completion is self-declared, workflows are MVP/non-resumable, and subagent ownership/messages are process-local with continuation gaps. None replaces AI7 Task Ledger, Workflow Instance, decision, or Effect truth. |
| Sessions and persistence | `packages/core/session/`; `docs/subsystems/session.md`; `packages/session/session-persistence*/`; `docs/subsystems/persistence.md` | Source of truth for model-visible execution behavior, correlated with AI7 business records | Strict pre-release formats have no old-format migration; there is no deletion/retention API or partial-turn resume, and JSONL permits one live writer per session. |
| Replay and snapshots | `docs/testing.md`; `packages/test-support/llm-replay/`; `packages/test-support/acp-snapshot/`; `vitest.snapshot.config.ts`; `vitest.web.config.ts` | Upstream capability/reference only; use inside a later exact journey or diagnosis only when justified | AI7 has no standing cassette, replay, snapshot, or request-fingerprint gate. Harness evidence never proves AI7 business completion or an Effect Receipt. |
| General evaluation | `BENCHMARK.md`; evaluator deferrals in `packages/goal/goal/README.md` and `packages/workflow/tool-ralph/README.md` | Add an AI7-owned behavior/editorial-quality evaluator over Harness evidence | No general evaluator, scoring service, or independent goal verifier exists at the pin; real-API tests are integration smokes only. |

### Dynamic mechanisms are not the initial product contract

The special Cordis preset and `packages/extensions/tool-cordis/` can let a model define, run, stop, or undefine live runtime packages. Code Mode (`packages/code-runtime/code-runtime-worker-thread/`), model-written workflows, shell hooks, external plugins, and MCP servers likewise execute with substantial host authority; their worker/VM mechanisms are explicitly not security boundaries. Filesystem skills and live patches can also change behavior without a durable product-level promotion record.

Therefore the initial AI7 production composition uses a pinned bundle, committed system presets, static plugins, scoped prompt/context providers, static tools, explicit policy layers, durable session events, and AI7-owned evaluation. Dynamic authoring and self-referential Cordis remain developer-only and cannot enter the Editorial Capability Profile or self-expand product authority; Question 29 settled that boundary.

### Minimum Behavior Composition record

For reproducibility, a future record should include the Harness source/package pin, bundle dependency lock, complete effective profile/home/CLI row configuration, preset identity and mounted generation, plugin versions, ordered prompt/context contributors, visible tool schemas, policy/approval/sandbox configuration, workflow/subagent policy, Foundation Model binding, session IDs, and evaluator version. Capturing only a profile name is insufficient.

## Two adaptation loops that must stay separate

| Loop | Input | Changes | Required evidence |
| --- | --- | --- | --- |
| Editorial Learning | Editor-supervised materials, decisions, corrections, and feedback | AI7 Professional Editorial Knowledge, candidates including Series Knowledge Candidates, or House Editorial Memory | Learning Lineage, eligibility, explicit Series promotion where applicable, memory/knowledge revision, and task-use audit |
| Agent Behavior Improvement | Task traces, failures, evaluations, workload/quality measures, and framework findings | Harness Behavior Composition | Composition version, evaluation result, review/activation decision, rollout, and rollback record |

Both loops seek Editor-comparable Delivery Quality and lower workload, but neither updates Foundation Model weights.

Both loops may use the cross-context Policy Document pattern. After production runs, an AI agent may perform a Post-run Policy Review and author a Proposed Policy Revision, but authorship does not grant activation authority. Only evaluated non-expansive calibration inside a user-approved envelope may activate automatically; semantic or authority changes require the user.

## Accepted behavior-improvement lifecycle

1. Pin a Foundation Model requirement and a Harness Behavior Composition.
2. Exercise applicable complete provider-free editorial journeys and observe production Quality Signals; use live-provider evaluation only when separately authorized and policy-permitted.
3. Measure result quality, source fidelity, policy compliance, tool/approval behavior, recovery, latency/cost, and editor workload.
4. Trace a weakness to model capability, Harness behavior, editorial knowledge, or product interaction instead of treating every failure as a prompt problem.
5. Propose the smallest owned change through a documented Harness extension seam.
6. Review, version, validate, activate, observe, and retain rollback evidence.

## Since resolved

Every item this document left open has since been answered. It fixed the purpose; these questions fixed the answers.

| Formerly open | Resolved by |
| --- | --- |
| Which Harness capabilities reach the editorial profile versus a developer profile | Question 29 — full engine, narrow tool surface; Editorial and Developer Capability Profiles with no self-service escalation (ADR 0017) |
| Whether an agent may propose changes to its own behavior composition | Question 29 — everything is proposable, activation is tiered, and capability expansion never self-activates (ADR 0018) |
| The AI7-owned quality measurement and governed activation boundary | Question 36 — Quality Signals and five Delivery Quality Metrics remain accepted (ADR 0019); ADR 0027 supersedes the separate two-sided replay/promotion gate. Sample-size thresholds may constrain auto-activation only |
| Storage and correlation of behavior versions against Harness sessions | Question 22 — Task Ledger and Harness Session Ledger joined by Execution Bindings (ADR 0011) |
| The upstream package or process boundary and compatibility policy | Question 30 — exactly pinned package subset (ADR 0020); pin changes use the applicable complete E2E journeys and observed-bug regressions, not a separate six-point upgrade gate |

See [target architecture](./02-target-architecture.md), [retained development workflows](./09-retained-development-workflows.md), and the [foundation-model/editorial-intelligence invariant](./14-foundation-model-editorial-intelligence.md).
