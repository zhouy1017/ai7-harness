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
| **Worker** | Read the repository, write only its own worktree and branch, run applicable verification, report | Merge, push, publish, take external actions, or read/write credentials, real manuscripts, or private sample Books |
| **Reviewer** | Read the branch under review and its brief with fresh context; produce a review report and verdict | Write to the branch, merge, or dispatch |

The reviewer's verdict is **advisory**. The commander decides and integrates.

### Dispatch

- One worker per branch, per worktree, off an exact base commit. Never two writers in one tree.
- Soft cap of three concurrent workers. The binding constraint is commander review capacity, not dispatch capacity.
- **T0 work is never dispatched**: ambiguous scope, a brief that is itself in doubt, or anything requiring the owner's decision. A worker starts cold and re-derives context the commander already holds; that is the most expensive path.
- A worker whose brief turns out to be wrong **stops and reports**. It never self-escalates to a higher class.
- Rebase onto current `dev` before integration. Documentation-only changes require no automated proof; implementation changes use their applicable one-logical-E2E-journey gate. Task branches and pull requests integrate to `dev`; `main` promotion requires separate exact Owner authorization. See `docs/agents/development-lines.md`.

### Review

- Independent review is optional and advisory, never a formal merge gate.
- When review is used, its reviewer is **not the author** and has a task class greater than or equal to the worker's task class. This is a hard floor.
- Cross-provider review is the default when review is used. When it is impossible, proceed and flag `same-provider review — independence reduced`.
- **Conflict ordering: the tier floor is hard; cross-provider is preferred with disclosure.** Competence to catch the error outranks independence from bias.

### Reporting

Every returned unit of work carries one line: role, provider, model, effort, task class, and, when review occurred, whether cross-provider review was achieved.

### Usage discipline

1. Do not dispatch what the foreground session can do inline.
2. Batch mechanical work into one T1 worker rather than several.
3. Keep briefs tight; cold-start cost scales with what the worker must rediscover.
4. Urgency is not a task class and never changes the binding.

## Layer B — Bindings

The binding table is **the only provider-specific artifact in this design**. Replacing a provider means replacing one row, not revising any rule in Layer A.

| Class | Codex | Claude | Relative cost |
| --- | --- | --- | --- |
| **Commander** | `gpt-5.6-sol` @ `ultra` | `claude-opus-5` @ high | top |
| **T1** — mechanical | `gpt-5.6-luna` @ medium | `claude-haiku-4-5-20251001` @ low | 1× |
| **T2** — standard build | `gpt-5.6-terra` @ high | `claude-sonnet-5` @ medium | 2.5× |
| **T3** — high-stakes | `gpt-5.6-sol` @ xhigh | `claude-opus-5` @ high | 5× |
| **T3-par** — high-stakes and genuinely splittable | `gpt-5.6-sol` @ `ultra` | — dispatch parallel workers instead | 5× plus subagents |

Task class is the provider-neutral unit. The reviewer floor is evaluated **in task classes**, then bound — so a T3 branch written by `claude-opus-5` requires a reviewer at `gpt-5.6-sol` @ xhigh or above.

### Task classes

| Class | Definition | Examples in this project |
| --- | --- | --- |
| **T0** | Not dispatched | Ambiguous scope; brief in doubt; anything needing the owner's decision |
| **T1** | Mechanical — correct output is verifiable without judgment | Link validation, glossary and index cross-checks, format and lint fixes, path renames, running the gate, cross-repository file inventory |
| **T2** | Standard build from a written brief | A vertical slice with tests, CI workflow authoring, tests from an accepted contract, straightforward refactor |
| **T3** | High-stakes | Architecture, domain modeling, ADR drafting, Effects, named authorities, recovery and replay, credential broker, source-scope enforcement, manuscript revision and merge semantics |

The T1 test is whether correctness can be checked without judgment. Running a link checker is T1; deciding which records contradict one another is T3.

### Effort scales are not comparable across providers

Codex exposes `none → low → medium → high → xhigh → max → ultra` on Sol; Claude exposes a shorter ladder. Bindings map **task outcome to setting**, never label to matching label. `max` extends Sol's chain-of-thought budget; `ultra` spawns internal subagents that decompose and parallelize work, then reassemble it.

Tier selection is roughly a five-fold cost swing and is the primary lever; effort is the fine dial. Sol is $5/$30 per million tokens, Terra $2.50/$15, Luna $1/$6.

## Layer C — Fallback

| Condition | Action |
| --- | --- |
| One provider's quota is short | Same task class, other provider's binding |
| The commander's provider is exhausted | The commander seat moves to the other provider; task classes are unchanged |
| Both providers are short | Stop dispatching; foreground work only |

**Downgrade the provider, never the task class.** Fallback is bidirectional by design: either provider can be the constrained one. On 2026-08-17 the Codex quota was exhausted while Claude remained available, which is precisely the case a one-directional policy would have failed to handle.

## Plumbing

Cross-provider dispatch needs one small mechanism, not a system: the commander shells out to the other provider's CLI non-interactively with a brief, a worktree path, and a model and effort selection, then collects the report. Codex CLI 0.147.0 provides `codex exec` for this; Claude Code provides subagents with per-agent model selection, worktree isolation, and background execution.

Specify the contract tool-agnostically and implement it on whichever tooling is installed. Do not hard-code one vendor's mechanism into Layer A.

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
- workers prefer Claude and fall back to Codex, with fallback bidirectional;
- the reviewer's task class is at least that of the work it reviews, and cross-provider review is the disclosed default;
- operating rules stay identical across providers and models, with the binding table as the only provider-specific artifact; and
- the legacy orchestration pilot and its host connector are rejected as baselines.

See [ADR 0015](../docs/adr/0015-provider-neutral-development-dispatch.md).
