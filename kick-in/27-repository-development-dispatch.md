# Repository Development Dispatch

Status: **accepted in Question 25 with owner revisions through 2026-08-31**

## Scope

This is **repository-development tooling only**. It governs how agents build this repository. It is never AI7 product runtime behavior, never a shipped end-user workflow, and never to be conflated with Harness product subagents. That boundary was accepted at Question 6 and is unchanged.

The legacy multi-agent pilot at `ai7-reborn-ai@3e6e9ac` is not the baseline. Its bespoke lifecycle state machine under `scripts/agent-orchestration/`, and the `agent-host-connector/` with DPAPI, Windows Hello enrollment, and provider-specific process launch, are rejected as too heavy: at the audit pin the pilot had not completed its required real-host observations, and it solves a host-authority problem this repository does not have. It remains old-repository reference evidence.

## Layer A — Operating rules

These are provider-neutral invariants. They are stated without reference to any model, and switching providers or models cannot change any of them. **No rule in this layer may ever be conditioned on which model is running.**

### Roles and authority

| Role | May | Never |
| --- | --- | --- |
| **Commander** | Decide dispatch, review returned work, push task branches, maintain Draft/Ready pull-request state, and integrate: merge, release. Sole external-action authority. Holds the owner's foreground session | — |
| **Worker** | Read the repository, write only its own worktree and branch, run the authorized Local diagnostic/Local completion sequence, and report | Merge, push any branch, change pull-request state, dispatch hosted workflows, publish, take external actions, or read/write credentials, real manuscripts, or private sample Books |
| **Reviewer** | Read the branch under review and its brief from fresh, strictly read-only context; produce a review report and advisory verdict | Author the reviewed change; write to the branch; dispatch, delegate to, or spawn another agent; integrate; or take external actions |

The reviewer's verdict is **advisory**. The commander decides and integrates.

### Dispatch

- One worker per branch, per worktree, off an exact base commit. Never two writers in one tree.
- Soft cap of three concurrent workers. The binding constraint is commander review capacity, not dispatch capacity.
- **T0 work is never dispatched**: ambiguous scope, a brief that is itself in doubt, or anything requiring the owner's decision. A worker starts cold and re-derives context the commander already holds; that is the most expensive path.
- A worker whose brief turns out to be wrong **stops and reports**. It never self-escalates to a higher class.
- Before Commander integration, rebase onto the current intended integration target (`dev` for ordinary development work). Record the new exact target commit and re-resolve every `<target-commit>:<path>` authority in the Change Brief. If authority or semantics drifted, stop for re-scoping; this integration maintenance is not a new review or proof gate. `main` is the stable/release-promotion line and needs a separate exact Owner authorization; frozen `design-doc` is an allowlist source, never an integration target. Implementation follows the normal or CI-degraded route and the current [ADR 0054](../docs/adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) milestone phase in the [CI boundary](../docs/agents/ci-test-boundaries.md), without creating another Gate.
- Every dispatched unit is extracted from the applicable [`Change Brief`](../docs/agents/change-brief.md): exact base/target-qualified authority, one outcome, current reuse anchor, structural budget, non-goals, stop conditions, implementation journey/bug or non-behavior `N/A`, and reporting boundary. Do not send full transcripts, archive trees, or unrelated design packages.

### Local completion and hosted integration

A Worker develops and debugs on its actual supported host. It restores only existing accepted pins, uses the payload-safe Local diagnostic command when useful, runs the repository-root `doctor` → `bootstrap` → `build` → applicable Journey sequence, solves every locally reproducible required-platform failure, and reruns the clean `build` plus applicable Journey before reporting normal Local completion. Declared caches may accelerate iteration but never supply correctness. Under active CI-degraded operation, the stricter exact-rebased-head `doctor` → `bootstrap` → `build` → `e2e:all` rules in the CI boundary apply. Before the exact Initial v1.0.0 Development Milestone Boundary, ADR 0054 makes that Windows completion the only required platform evidence, including for shared and macOS-native changes; missing macOS evidence and known macOS-only problems are recorded for re-entry, not represented as passing. The report labels its state `Local diagnostic` or `Local completion` and records only exact head, host, commands, and outcomes without logs, proof artifacts, Provider payloads, private inputs, credentials, or personal dependency state.

Pull requests remain Draft during authoring, review, rebase, and local validation. The Commander makes an integration-ready pull request Ready. After successful post-boundary re-entry, Ready normally arms the one hosted occurrence when the exact workflow has been separately restored and is applicable. Before the ADR 0054 boundary, Ready uses the independent Windows Local-completion route and does not start disabled workflow `342459594`. Newer pushes while an applicable workflow occurrence is running cancel a superseded in-progress same-PR occurrence and start the newest occurrence. A product/bootstrap/build/Journey failure or unknown that the current milestone phase makes blocking returns the pull request to Draft; only the Commander may rerun one clearly external runner/network/infrastructure transient without a code change. This lifecycle bounds usage and does not create an exact-head, same-SHA, formal-review, or zero-finding gate.

Before the Initial v1.0.0 Development Milestone Boundary, ADR 0054 independently permits product integration from fresh Windows Local completion of every then-current executable Journey at the rebased head. The set remains J-01/J-02/J-08/J-12 until another separately authorized cutover; Issue #88's unresolved J-15 route may change it before Issue #47, and Issue #47 must then add real J-03 to the resulting orchestration without fixing an unconditional total. When ADR 0053's external condition is active, the Commander also records its workflow-state, no-run, and truthful phase-resolved Journey disclosure immediately before Ready and merge. If that condition resolves before the boundary, ADR 0054 remains active, the paired workflow remains disabled and unrun, and the Windows completion still supplies the authorized route. Every Windows failure or unknown blocks, while macOS is truthfully deferred. Product pull requests integrate one at a time from current `dev`; no local result, advisory review, dormant workflow projection, fake green, substitute Gate, or single-platform run is claimed as hosted Gate evidence. Pure documentation, design, and CI-governance work uses only its Change Brief's applicable local validation. Independent branches consume stable owners/interfaces on current `dev`; any necessary stacked dependency and integration order must be explicit and separately authorized.

Before the Initial v1.0.0 Development Milestone Boundary, authoritative resolution of the external condition neither ends ADR 0054 nor authorizes workflow action. At the exact boundary the exception expires; a separate authorized re-entry validates consolidated `dev` on actual Windows and macOS, or through the exact paired workflow if separately restored. Ready but unmerged product pull requests then rebase and return to the normal paired-platform lifecycle. Workflow enablement or dispatch requires separate exact external-action authority. No probe, automatic enablement, manual dispatch, replacement workflow, retrospective run, or per-pull-request backfill is authorized.

### Review

- Independent review is optional and advisory. A verdict must not become a pull-request (PR), CI, branch, exact-head, zero-finding, iterative re-review, or other proof gate. Use review for hostile architecture feedback or when the owner requests it.
- A Reviewer is never the author and starts from fresh, strictly read-only context rather than the authoring task transcript.
- Record the reviewed task class. The Reviewer binding must meet or exceed that class under the Layer B table.
- A Reviewer may not dispatch, delegate to, or spawn another agent. The Commander directly dispatches every Reviewer, including every parallel review.
- A review finding informs the Commander; it does not itself require proof work or another review.

### Reporting

Every returned Worker unit carries one line with role, requested binding, actual provider/model/effort, task class, fallback status, and exact reason.

For product work, the returned unit also labels the result `Local diagnostic` or `Local completion` and records the exact head, local validation host, commands, and outcomes. This is a concise development report, not a proof receipt or substitute for the applicable hosted Gate.

Every Reviewer report carries one line with the reviewed task class; requested and actual provider/model/effort; confirmation that the actual binding meets the class floor; fresh-context, read-only, non-author independence; fallback status; and the exact fallback or same-provider reason when applicable. This record is required only when review is requested and is not a proof receipt or gate.

### Usage discipline

1. Do not dispatch what the foreground session can do inline.
2. Batch mechanical work into one T1 worker rather than several.
3. Keep briefs tight; cold-start cost scales with what the worker must rediscover.
4. Urgency is not a task class and never changes the binding.
5. Do not consume or probe Worker quota for T0 work, Commander decisions, final integration, or independent review merely to satisfy a provider preference; those remain in their existing roles.
6. Use an accepted capacity lane only for an existing eligible unit; do not invent or fragment work merely to consume available capacity.
7. Map the current implementation narrowly before dispatch and use the earliest adequate rung in the [incremental development lifecycle](../docs/agents/incremental-development.md). Do not pay cold-start cost for a parallel design the existing owner can absorb.

## Layer B — Bindings

This whole layer is **the only provider-specific policy surface in this design**. It contains the class-to-model table, Worker provider order and accepted capacity lanes, and quota fallback. Replacing a provider changes this layer, never Layer A. Operational dispatch logs may name an actual binding as evidence; they do not create another policy surface.

| Class | Codex | Claude | Relative cost |
| --- | --- | --- | --- |
| **Commander** | `gpt-5.6-sol` @ `ultra` | `claude-opus-5` @ high | top |
| **T1** — mechanical | `gpt-5.6-luna` @ medium | `claude-haiku-4-5-20251001` @ low | 1× |
| **T2** — standard build | `gpt-5.6-terra` @ high | `claude-sonnet-5` @ medium | 2.5× |
| **T3** — high-stakes | `gpt-5.6-sol` @ xhigh | `claude-opus-5` @ high | 5× |
| **T3-par** — high-stakes and genuinely splittable | `gpt-5.6-sol` @ `ultra` | — dispatch parallel workers instead | 5× plus subagents |

Task class is the provider-neutral unit. The Reviewer floor is evaluated **in task classes**, then bound: a T3 branch requires a T3-or-higher Reviewer binding, regardless of which provider authored it.

Cross-provider review is preferred, but Reviewer assignment is not subject to the Worker provider order. The Commander selects the Reviewer binding independently, records requested and actual provider/model/effort and independence, and records the exact fallback or same-provider reason when cross-provider review is unavailable. `gpt-5.3-codex-spark` @ `xhigh` is a Worker-only lane and never satisfies a Reviewer class floor.

### Worker provider order

The normal order follows the owner's 2026-08-22 revision: every dispatch-eligible, bounded Worker task outside the Spark lane uses the matching **Claude Code** binding first. Continue assigning those Worker units to Claude Code while its current quota is available; do not load-balance away from it merely to conserve that quota.

When a real dispatch reports that Claude Code is unavailable or its usable quota is exhausted, record the attempted binding, observed condition, time, actual fallback binding, and exact downgrade reason. Then use the same task-class Codex binding from the table. Do not repeatedly spend attempts against a known exhausted quota window; retry Claude only after availability or quota reset is evidenced. This provider order does not apply to the Commander seat, final integration, or Reviewer assignment, whose role authority, task-class floor, independent binding selection, and independence rules remain unchanged.

`T3-par` is a Commander coordination mode, not a missing Claude Worker model row. The Commander decomposes genuinely separable work into bounded T1, T2, or T3 Worker briefs; each brief applies its eligible Worker provider order at its unchanged class, while architecture decisions and synthesis stay with the Commander.

### Spark-eligible Worker lane

The owner's 2026-08-31 revision permits direct `gpt-5.3-codex-spark` @ `xhigh` dispatch only for an existing T1 or T2 **coding** unit that has all of these properties:

- an exact written brief;
- an already identified existing owner or seam;
- one focused code outcome and a bounded small edit; and
- deterministic validation that establishes correctness without unresolved judgment.

When the dispatching host exposes `gpt-5.3-codex-spark` @ `xhigh` and has capacity, prefer that direct binding for an eligible unit without first probing Claude Code. Record the requested and actual binding under the normal reporting rule. One model-unavailable or capacity result ends the Spark attempt for that unit and falls through to the normal same-class order: Claude Code first, then the same-class Codex table binding if Claude is unavailable or exhausted. Never downgrade or relabel the task class to reach Spark.

The lane excludes T0 and T3; Commander and Reviewer work; architecture, domain, ADR, or authority decisions; security, privacy, egress, credential, or Effect work; schemas, migrations, dependencies, or native adapters; workflow or Gate changes; concurrency, recovery, or replay; new public interfaces or design-system primitives; non-trivial accessibility; broad refactors; and any unit whose correctness still requires judgment. Spark never changes Worker authority, one-Worker branch/worktree isolation, required validation, reporting, fallback recording, or Commander-only integration and external-action rules.

### Task classes

| Class | Definition | Examples in this project |
| --- | --- | --- |
| **T0** | Not dispatched | Ambiguous scope; brief in doubt; anything needing the owner's decision |
| **T1** | Mechanical — correct output needs little judgment | Small glossary/index updates, format fixes, path renames, cross-repository file inventory |
| **T2** | Standard build from a written brief | A vertical slice, E2E journey or bug-regression scenario, straightforward refactor |
| **T3** | High-stakes | Architecture, domain modeling, ADR drafting, Effects, named authorities, recovery and replay, credential broker, source-scope enforcement, manuscript revision and merge semantics |

The T1 test is whether correctness can be checked without judgment. Running a link checker is T1; deciding which records contradict one another is T3.

### Effort scales are not comparable across providers

Codex exposes `none → low → medium → high → xhigh → max → ultra` on Sol; Claude exposes a shorter ladder. Bindings map **task outcome to setting**, never label to matching label. `max` extends Sol's chain-of-thought budget; `ultra` can use internal subagents to decompose, parallelize, and reassemble work when the assigned repository role permits it. Role authority overrides that capability: an `ultra` Reviewer still may not dispatch, delegate to, or spawn another agent.

Tier selection is roughly a five-fold cost swing and is the primary lever; effort is the fine dial. Sol is $5/$30 per million tokens, Terra $2.50/$15, Luna $1/$6.

### Fallback

| Condition | Action |
| --- | --- |
| A Spark-eligible T1/T2 coding unit and Spark is exposed with capacity | Dispatch direct to `gpt-5.3-codex-spark` @ `xhigh` without a Claude probe |
| One Spark attempt reports unavailable or no capacity | Record the exact result; continue with the normal same-class order |
| Any other eligible bounded Worker task and Claude Code quota is available | Use the same-class Claude binding first |
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

## Decision summary

Accepted in Question 25 and revised by the owner on 2026-08-22 and 2026-08-31:

- three roles — Commander, Worker, Reviewer — with the Reviewer a fresh-context, strictly read-only, non-author agent that the Commander directly dispatches and that may not dispatch or spawn another agent;
- Codex is the main entry and normally holds the commander seat, at top capability;
- Spark-eligible T1/T2 coding units prefer direct `gpt-5.3-codex-spark` @ `xhigh` dispatch while exposed with capacity, then fall through after one unavailable/capacity result; every other dispatch-eligible bounded Worker task uses Claude Code first while its quota is available, then falls back at the same class to Codex, and every actual binding and fallback reason is recorded;
- independent review is optional and advisory; the reviewed class, Reviewer binding floor, requested and actual provider/model/effort, independence, and any fallback or same-provider reason are recorded; cross-provider review is preferred without inheriting Worker provider order, Spark is never a Reviewer binding, and no verdict becomes a pull-request (PR), CI, branch, exact-head, zero-finding, iterative re-review, or other proof gate;
- operating rules stay identical across providers and models, with Layer B as the only provider-specific policy surface; and
- the legacy orchestration pilot and its host connector are rejected as baselines.

See [ADR 0015](../docs/adr/0015-provider-neutral-development-dispatch.md).
