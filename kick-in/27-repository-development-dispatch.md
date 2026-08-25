# Repository Development Dispatch

Status: **accepted in Question 25 with owner revisions**

## Scope

This is **repository-development tooling only**. It governs how agents build this repository. It is never AI7 product runtime behavior, never a shipped end-user workflow, and never to be conflated with Harness product subagents. That boundary was accepted at Question 6 and is unchanged.

The legacy multi-agent pilot at `ai7-reborn-ai@3e6e9ac` is not the baseline. Its bespoke lifecycle state machine under `scripts/agent-orchestration/`, and the `agent-host-connector/` with DPAPI, Windows Hello enrollment, and provider-specific process launch, are rejected as too heavy: at the audit pin the pilot had not completed its required real-host observations, and it solves a host-authority problem this repository does not have. It remains old-repository reference evidence.

## Layer A — Operating rules

These are provider-neutral invariants. They are stated without reference to any model, and switching providers or models cannot change any of them. **No rule in this layer may ever be conditioned on which model is running.**

### Roles and authority

| Role | May | Never |
| --- | --- | --- |
| **Commander** | Decide dispatch, review returned work, integrate: merge, push, release. Sole external-action authority. Holds the owner's foreground session | — |
| **Worker** | Read the repository, write only its own worktree and branch, report; run the E2E Functional Gate only when its implementation change affects a supported journey or observed-bug regression | Merge, push to `main`, publish, take external actions, or read/write credentials, real manuscripts, or private sample Books |
| **Reviewer** | Read the branch under review and its brief with fresh context; produce a review report and verdict | Write to the branch, merge, or dispatch |

The reviewer's verdict is **advisory**. The commander decides and integrates.

### Dispatch

- One worker per branch, per worktree, off an exact base commit. Never two writers in one tree.
- Soft cap of three concurrent workers. The binding constraint is commander review capacity, not dispatch capacity.
- **T0 work is never dispatched**: ambiguous scope, a brief that is itself in doubt, or anything requiring the owner's decision. A worker starts cold and re-derives context the commander already holds; that is the most expensive path.
- A worker whose brief turns out to be wrong **stops and reports**. It never self-escalates to a higher class.
- Before Commander integration, rebase onto the current intended integration target (`main` normally; the documented `design-doc` exception only when explicitly targeted). Record the new exact target commit and re-resolve every `<target-commit>:<path>` authority in the Change Brief. If authority or semantics drifted, stop for re-scoping; this integration maintenance is not a new review or proof gate. Implementation uses only the applicable E2E Functional Gate.
- Every dispatched unit is extracted from the applicable [`Change Brief`](../docs/agents/change-brief.md): exact base/target-qualified authority, one outcome, current reuse anchor, structural budget, non-goals, stop conditions, implementation journey/bug or non-behavior `N/A`, and reporting boundary. Do not send full transcripts, archive trees, or unrelated design packages.

### Review

- Independent review is optional and advisory, not a branch or exact-head gate. Use it for hostile architecture feedback or when the owner requests it.
- When a Reviewer is used, it is not the author, its task class remains greater than or equal to the reviewed work, and cross-provider review is preferred with the existing disclosure when unavailable.
- A review finding informs the Commander; it does not automatically trigger iterative proof or re-review cycles.

### Reporting

Every returned Worker unit carries one line with role, requested binding, actual provider/model/effort, task class, fallback status, and exact reason. Record reviewer independence only when a review was actually requested.

### Usage discipline

1. Do not dispatch what the foreground session can do inline.
2. Batch mechanical work into one T1 worker rather than several.
3. Keep briefs tight; cold-start cost scales with what the worker must rediscover.
4. Urgency is not a task class and never changes the binding.
5. Do not consume or probe Worker quota for T0 work, Commander decisions, final integration, or independent review merely to satisfy a provider preference; those remain in their existing roles.
6. Map the current implementation narrowly before dispatch and use the earliest adequate rung in the [incremental development lifecycle](../docs/agents/incremental-development.md). Do not pay cold-start cost for a parallel design the existing owner can absorb.

## Layer B — Bindings

This whole layer is **the only provider-specific policy surface in this design**. It contains the class-to-model table, Worker provider order, and quota fallback. Replacing a provider changes this layer, never Layer A. Operational dispatch logs may name an actual binding as evidence; they do not create another policy surface.

| Class | Codex | Claude | Relative cost |
| --- | --- | --- | --- |
| **Commander** | `gpt-5.6-sol` @ `ultra` | `claude-opus-5` @ high | top |
| **T1** — mechanical | `gpt-5.6-luna` @ medium | `claude-haiku-4-5-20251001` @ low | 1× |
| **T2** — standard build | `gpt-5.6-terra` @ high | `claude-sonnet-5` @ medium | 2.5× |
| **T3** — high-stakes | `gpt-5.6-sol` @ xhigh | `claude-opus-5` @ high | 5× |
| **T3-par** — high-stakes and genuinely splittable | `gpt-5.6-sol` @ `ultra` | — dispatch parallel workers instead | 5× plus subagents |

Task class is the provider-neutral unit. The reviewer floor is evaluated **in task classes**, then bound — so a T3 branch written by `claude-opus-5` requires a reviewer at `gpt-5.6-sol` @ xhigh or above.

### Worker provider order

Effective with the owner's 2026-08-22 revision, every task that is both suitable for parallel dispatch and bounded enough to be a Worker brief uses the matching **Claude Code** binding first. Continue assigning eligible Worker work to Claude Code while its current quota is available; do not load-balance away from it merely to conserve that quota.

When a real dispatch reports that Claude Code is unavailable or its usable quota is exhausted, record the attempted binding, observed condition, time, actual fallback binding, and exact downgrade reason. Then use the same task-class Codex binding from the table. Do not repeatedly spend attempts against a known exhausted quota window; retry Claude only after availability or quota reset is evidenced. This provider order does not apply to the Commander seat, final integration, or Reviewer assignment, whose role authority, task-class floor, and independence rules remain unchanged.

`T3-par` is a Commander coordination mode, not a missing Claude Worker model row. The Commander decomposes genuinely separable work into bounded T1, T2, or T3 Worker briefs; each brief applies the Claude-first order at its own class, while architecture decisions and synthesis stay with the Commander.

### Task classes

| Class | Definition | Examples in this project |
| --- | --- | --- |
| **T0** | Not dispatched | Ambiguous scope; brief in doubt; anything needing the owner's decision |
| **T1** | Mechanical — correct output needs little judgment | Small glossary/index updates, format fixes, path renames, cross-repository file inventory |
| **T2** | Standard build from a written brief | A vertical slice, E2E journey or bug-regression scenario, straightforward refactor |
| **T3** | High-stakes | Architecture, domain modeling, ADR drafting, Effects, named authorities, recovery and replay, credential broker, source-scope enforcement, manuscript revision and merge semantics |

The T1 test is whether correctness can be checked without judgment. Running a link checker is T1; deciding which records contradict one another is T3.

### Effort scales are not comparable across providers

Codex exposes `none → low → medium → high → xhigh → max → ultra` on Sol; Claude exposes a shorter ladder. Bindings map **task outcome to setting**, never label to matching label. `max` extends Sol's chain-of-thought budget; `ultra` spawns internal subagents that decompose and parallelize work, then reassemble it.

Tier selection is roughly a five-fold cost swing and is the primary lever; effort is the fine dial. Sol is $5/$30 per million tokens, Terra $2.50/$15, Luna $1/$6.

### Fallback

| Condition | Action |
| --- | --- |
| An eligible bounded Worker task and Claude Code quota is available | Use the same-class Claude binding first |
| Claude Code is unavailable or its usable Worker quota is exhausted | Record the observed failure and reason; use the same-class Codex binding for the current quota window |
| One provider's quota is short | Same task class, other provider's binding |
| The commander's provider is exhausted | The commander seat moves to the other provider; task classes are unchanged |
| Both providers are short | Stop dispatching; foreground work only |

**Downgrade the provider, never the task class.** Fallback is bidirectional by design: either provider can be the constrained one. On 2026-08-17 the Codex quota was exhausted while Claude remained available, which is precisely the case a one-directional policy would have failed to handle.

## Plumbing

Cross-provider dispatch needs one small mechanism, not a system: the commander shells out to the other provider's CLI non-interactively with a brief, a worktree path, and a model and effort selection, then collects the report. Codex CLI 0.147.0 provides `codex exec` for this; Claude Code provides subagents with per-agent model selection, worktree isolation, and background execution.

Specify the contract tool-agnostically and implement it on whichever tooling is installed. Do not hard-code one vendor's mechanism into Layer A.

At merge, closure, abandonment, accepted integration, supersession, confirmed handoff consumption, or long-task freeze, the responsible foreground session runs the scoped [documentation archive sweep](../docs/agents/document-lifecycle.md). Archiving is node-driven and does not create a timer, host service, or additional agent role.

## Deferred

| Deferred | Add it when |
| --- | --- |
| Typed authority requests | Informal coordination demonstrably fails |
| Replay-safe dispatch receipts | Dispatch volume makes reconstructing what happened genuinely hard |
| A formal commander/worker/evaluator role taxonomy beyond the three roles above | A fourth role is actually needed |
| Any host connector, enrollment, or DPAPI machinery | Never, absent a concrete host-authority problem |

## Question 25 decision

Accepted with owner revisions:

- three roles — Commander, Worker, Reviewer — with the reviewer an independent agent;
- Codex is the main entry and normally holds the commander seat, at top capability;
- dispatch-eligible, bounded parallel Worker tasks use Claude Code first while its quota is available, then fall back at the same task class under the existing table; every actual binding and downgrade reason is recorded;
- independent review is optional and advisory; when requested, its existing task-class and independence boundaries remain;
- operating rules stay identical across providers and models, with Layer B as the only provider-specific policy surface; and
- the legacy orchestration pilot and its host connector are rejected as baselines.

See [ADR 0015](../docs/adr/0015-provider-neutral-development-dispatch.md).
