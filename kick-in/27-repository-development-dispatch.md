# Repository Development Dispatch

## Scope

This runbook governs repository-development work performed through Task Sessions on either supported harness, Codex or Claude Code. The Commander selects each attempt's harness and launch mode: [ADR 0061](../docs/adr/0061-route-repository-dispatch-by-commander-harness.md) owns the fixed bindings, the Issue-body contract, the receipts, and the Claude Code `subagent` launch mode, and [ADR 0063](../docs/adr/0063-allow-cross-harness-dispatch-through-cli-launched-task-sessions.md) owns per-attempt harness selection and the `cli-session` launch mode. This file owns the operating detail. It is not AI7 product runtime behavior, a Model Role, a Provider Resolution Plan, a Harness Session, a DSH subagent, or a second product agent loop. [ADR 0059](../docs/adr/0059-dispatch-repository-work-through-issue-bound-codex-task-sessions.md) and [ADR 0060](../docs/adr/0060-dispatch-repository-work-through-issue-bound-claude-code-sessions.md) are the superseded single-harness predecessors whose route texts continue here.

A **Task Session** is one fresh execution context on the attempt's harness with its own isolated worktree. One attempt never changes its harness or launch mode.

## Harnesses and launch modes

Every attempt records two harness fields: `commander_harness`, the harness of the Commander's own session, and `harness`, the harness the attempt runs on. The attempt's harness selects the Issue body's requested-binding line and the fixed class binding. The Commander also selects the launch mode, recorded as `launch_mode`:

| Launch mode | Attempt harness | Available to | Mechanism |
| --- | --- | --- | --- |
| `top-level-session` | `codex` | Codex Commander only | Codex Task Session created by `create_thread` |
| `top-level-session` | `claude-code` | Claude Code Commander only | Desktop session created by hand in the Claude desktop app |
| `subagent` | `claude-code` | Claude Code Commander only | Background subagent spawned by the Commander's Agent tool |
| `cli-session` | `codex` or `claude-code` | Either Commander, same-harness or cross-harness | The target harness's CLI run from the Commander's shell |

A cross-harness attempt—a Claude Code Commander launching a Codex Worker, or a Codex Commander launching a Claude Code Worker or Reviewer—uses `cli-session` only. The Reviewer's harness is chosen per attempt in the same way and may differ from the Worker's.

### Native top-level sessions

| Concern | `codex`, `top-level-session` | `claude-code`, `top-level-session` |
| --- | --- | --- |
| Task Session | Fresh top-level Codex Task Session in the Codex desktop app | Fresh top-level Claude Code session in the Claude desktop app (Code tab) |
| Worktree | App-managed `~/.codex/worktrees/<id>/ai7-harness`, detached at the requested commit | `.claude/worktrees/<name>` inside the main checkout on the app-generated `claude/<name>` branch, created from the main checkout's current branch and excluded through `.git/info/exclude`; keep names short because Windows dependency paths grow with them |
| Create session | `create_thread`, a Commander tool that sends the first prompt atomically and returns the Task Session ID afterwards | Owner/Commander creates the session by hand with worktree isolation and the exact model and effort |
| Overview / detail / wait | `list_threads` / `read_thread` / `wait_threads` | `list_sessions` / `get_session` plus `list_events` / no blocking wait, re-query when needed |
| Follow-up message | `send_message_to_thread` | `send_message` |
| Title / retire | Task title at creation / `set_thread_archived` | `set_session_title` / `archive_session`, confirmed by the Owner and removing the worktree |
| Launch-acceptance evidence | The accepted `create_thread` request plus observed runtime events | `get_session` fields `model` and `effort` plus any app fallback or switch notice |
| Live-status values | `setup-pending | running | needs-attention | idle` | `running | idle | archived` |
| Session identity fields | `session_id` is the Task Session ID; `client_thread_id` when present | `session_id` is the desktop `sessionId` |
| Attach step for a Worker | Attach the clean detached checkout to the pre-created Issue branch | Reset a clean checkout to the exact start when needed, then rename the app-generated branch to the reserved Issue branch |
| Commit trailer | `Co-authored-by: OpenAI Codex <codex@openai.com>` | `Co-Authored-By: Claude <noreply@anthropic.com>` |

### Claude Code `subagent` launch mode

| Concern | `claude-code`, `subagent` |
| --- | --- |
| Task Session | A background subagent that the Commander spawns through its Agent tool inside the Commander session; every spawn starts cold with its own context |
| Worktree | `.claude/worktrees/<generated-name>` on a generated branch, both created by the harness; the start commit follows the harness's own worktree base setting, never the Agent call, so step 4 of the two-stage launch enforces the exact start; the harness removes a worktree that is still unchanged when the agent ends |
| Create session | One Agent tool call with `run_in_background: true`, `isolation: "worktree"`, explicit `model` set to the class alias (`sonnet` for T1, `opus` for T2, `fable` for T3; a Reviewer uses the reviewed class's alias), the harness's general-purpose subagent type, `description` set to `[#<issue>] <role> A<attempt>`, and the first prompt as `prompt`; the call returns the `agent_id` |
| Overview / detail / wait | `ListAgents` (busy or idle) / the turn-completion notification, or `TaskOutput` with `block: false` / the completion notification itself; `list_sessions` never shows a subagent |
| Follow-up message | `SendMessage` to the `agent_id` or agent name, which resumes the same context |
| Title / retire | `description` at creation / `TaskStop` for a running agent; after the Issue's merge, close, or abandonment the Commander removes a retained worktree with `git worktree remove` |
| Launch-acceptance evidence | The Agent call parameters as the Commander sent them, `model` alias and `effort: inherited`; no harness-readable model or effort metadata exists for a subagent |
| Effort | Not an Agent call parameter; the subagent inherits the Commander session's effort level, `xhigh` under the fixed Commander binding |
| Live-status values | `running | idle | ended` |
| Session identity fields | `session_id` is the hosting Commander session's desktop `sessionId`; `agent_id` is the identifier the Agent tool returned |
| Attach step for a Worker | Reset a clean checkout to the exact start when needed, then rename the generated branch to the reserved Issue branch, operating on the worktree path from the Commander session while the subagent is idle |
| Commit trailer | `Co-Authored-By: Claude <noreply@anthropic.com>` |

In this mode the Commander launches, relays, and audits. It never edits the attempt's worktree or branch, never performs the T1–T3 work the subagent was launched for, and relays the subagent's report, which reaches the Commander alone, only through the Return Receipt.

### `cli-session` launch mode

| Concern | `cli-session`, Codex target | `cli-session`, Claude Code target |
| --- | --- | --- |
| Prerequisite | `codex --version` and `codex login status` answer in the Commander's own shell. The official package is global npm `@openai/codex` plus the `@openai/codex-win32-x64` alias that a top-level install may skip; packaged desktop apps virtualize `%APPDATA%\npm`, so install host-wide from an unpackaged terminal and verify from the Commander's shell. Installing or updating it is an Owner host action | `claude --version` and `claude auth status` answer in the Commander's own shell. The official package is global npm `@anthropic-ai/claude-code` or the native installer; the same virtualization rule applies. Installing or updating it is an Owner host action |
| Worktree | Created by the Commander at the exact start: `git worktree add --detach <path> <exact start>`, under the existing `../ai7-harness-worktrees/<name>` convention | Created by the CLI: `--worktree <name>` makes `.claude/worktrees/<name>` on a generated branch; the start follows the harness's worktree base setting, so step 4 enforces the exact start; an unchanged worktree may be removed at exit |
| Create session | In the background: `codex exec "<first prompt>" -m <exact model> -c model_reasoning_effort=<effort> -C <path> --sandbox workspace-write --json -o <report file>`; a Reviewer gets `--sandbox read-only` | In the background from the main checkout: `claude -p "<first prompt>" --model <exact model> --effort <effort> --worktree <name> --output-format json --permission-mode acceptEdits --allowedTools <the brief's validation commands>`; a Reviewer gets the default permission mode, a read-only allowlist such as `"Bash(git *)" "Bash(gh api *)"`, and `--disallowedTools Edit Write` |
| Session identity | `session_id` is the `thread_id` of the `thread.started` JSON event | `session_id` is the JSON result's `session_id` |
| Overview / detail / wait | The Commander's own background-process tools and the JSON event stream / the `-o` report file / process exit | The Commander's own background-process tools / the JSON result / process exit |
| Follow-up message | `codex exec resume <thread_id> "<message>" -C <path>` | `claude -p "<message>" --resume <session_id>` run from the worktree |
| Title / retire | No title; `session_title: none` / stop a running process; after the Issue's merge, close, or abandonment remove the worktree with `git worktree remove` | Same |
| Launch-acceptance evidence | The CLI arguments as sent (`-m`, `-c model_reasoning_effort`) | The CLI arguments as sent (`--model`, `--effort`), plus the `system/init` model when `stream-json` output is used |
| Live-status values | `running | idle | ended` | `running | idle | ended` |
| Attach step for a Worker | Attach the clean detached checkout to the pre-created Issue branch | Reset a clean checkout to the exact start when needed, then rename the generated branch to the reserved Issue branch |
| Commit trailer | `Co-authored-by: OpenAI Codex <codex@openai.com>` | `Co-Authored-By: Claude <noreply@anthropic.com>` |
| Never | `--ephemeral`, `--dangerously-bypass-approvals-and-sandbox`, `--approve-for-me` | `--bare`, `--dangerously-skip-permissions` |

In this mode the CLI's final message is the Worker's or Reviewer's report, and the Commander relays its substance into the Return Receipt. A non-interactive run denies any permission it was not granted, so the allowlist or sandbox must cover the brief's validation commands—the repository-root `doctor` → `bootstrap` → `build` → Journey sequence for product work—and the byte-preserving Issue read; Codex's workspace-write sandbox restricts network access by default, so enable it explicitly only when the brief's validation needs the registry and record that override in the Launch Receipt. A denied required command is a `needs-commander` stop, never a reason to widen permissions mid-attempt. Both CLIs persist the session transcript on disk; that transcript, the report file, and the worktree are the attempt's retention until the Issue closes. The commit trailer follows the attempt's harness in every launch mode.

## Roles and fixed bindings

| Role or class | `codex` binding | `claude-code` binding | Authority |
| --- | --- | --- | --- |
| **Commander** | `gpt-5.6-sol @ ultra` | `claude-fable-5-1 @ xhigh` | Holds the owner's foreground session; shapes T0 work and Issues, dispatches, accepts reports, integrates, and alone takes external actions |
| **T1 Worker** — mechanical | `gpt-5.6-luna @ medium` | `claude-sonnet-5 @ medium` | Executes one exact brief in its own branch/worktree and reports |
| **T2 Worker** — standard build | `gpt-5.6-terra @ high` | `claude-opus-5 @ high` | Executes one exact brief in its own branch/worktree and reports |
| **T3 Worker** — high-stakes | `gpt-5.6-sol @ xhigh` | `claude-fable-5-1 @ xhigh` | Executes one exact brief in its own branch/worktree and reports |
| **Reviewer** | Same binding as the reviewed T1/T2/T3 class on the Reviewer's own harness | Same binding as the reviewed T1/T2/T3 class on the Reviewer's own harness | Starts fresh, remains read-only and non-author, and returns advisory findings |

The binding column is selected by the attempt's harness, not the Commander's. The effort label is the harness's own reasoning-effort level for the session. In the Claude Code `subagent` launch mode the Agent call carries no effort parameter, so the attempt inherits the Commander session's effort level and its receipts record the effort component as `inherited`; the class model is still enforced through the explicit alias (`claude-sonnet-5` → `sonnet`, `claude-opus-5` → `opus`, `claude-fable-5-1` → `fable`). In every other mode the launch carries the exact class model and effort.

T0 clarification, Issue shaping, dispatch, acceptance, integration, and every external action stay with the Commander. The Commander does not perform T1–T3 controlled-file work inline. Every T1–T3 Worker and every Reviewer starts in a fresh Task Session on the harness the Commander selects for that attempt, in one of that harness's launch modes; never fork, reuse, or convert the Commander, another role, or an earlier attempt.

`T3-par` is only the name for Commander coordination of independent T1, T2, or T3 Task Sessions. It is not a task class, binding row, or permission for a Worker or Reviewer to use in-session subagents as writers. A Commander-spawned subagent attempt under the `subagent` launch mode is a Task Session with its own Launch Receipt, not a T3-par device. A Worker or Reviewer session may use read-only exploration subagents only inside its own worktree; they never write, never become a second writer, and never form a separate attempt identity, and a Reviewer spawns no agent at all.

Role authority is invariant across harnesses, launch modes, and bindings:

- A Worker may read the repository, write only its own worktree and branch, run the authorized Local diagnostic/Local completion sequence, commit locally when instructed, and report. It never pushes, changes an Issue or pull request, merges, publishes, archives sessions, reads or writes credentials or protected material, or takes another external action.
- A Reviewer reads the Issue, Launch Receipt, branch, and applicable authority from fresh context. It never authors the reviewed change, writes the branch, dispatches another task, spawns another agent, integrates, or takes an external action. Its verdict is advisory and never becomes a pull-request, CI, exact-head, zero-finding, or iterative-review gate.
- The Commander alone may create or revise Issues, post receipts, create, message, stop, or archive Task Sessions in any launch mode, push, manage Draft/Ready state, merge, release, or publish within separately authorized scope. It never edits a `subagent` or `cli-session` attempt's worktree or branch.

## Task classes and no fallback

| Class | Test | Examples |
| --- | --- | --- |
| **T0** | Scope or authority still requires Commander/Owner judgment | Ambiguous scope, a brief in doubt, or an unresolved authority decision |
| **T1** | Correctness needs little judgment and can be checked mechanically | Format repair, exact index update, path rename |
| **T2** | A written brief and existing seam make the build straightforward | Bounded vertical slice, E2E journey, ordinary defect repair |
| **T3** | The work changes or records high-stakes boundaries | Architecture, domain, ADR, authority, Effect, credentials, recovery, replay, source scope |

There is no automatic fallback across models, efforts, harnesses, or launch modes. If the specified model or effort is unavailable, the Commander records a Launch Receipt with `launch_result: launch-unavailable`, starts no Worker or Reviewer turn, closes that attempt with a `failed` Return Receipt, and leaves the Issue incomplete. In the `subagent` mode an Agent call that the harness refuses for the class alias is `launch-unavailable`, and the inherited effort is never an unavailability; in the `cli-session` mode a CLI that is not callable, or that rejects the exact model or effort, is `launch-unavailable`. A different binding requires a material Issue-body revision with its reason, a new attempt, and a fresh Task Session. Never downgrade or relabel the class, and never substitute Commander inline execution. An automatic model fallback or switch that the harness reports during an attempt is a `rerouted` runtime model event and stops the attempt.

## Canonical Issue identity

The GitHub Issue body is the canonical current Change Brief. It states:

- `Brief revision` as an integer;
- the main Worker role and task class;
- one requested binding per harness, `Requested binding (codex)` and `Requested binding (claude-code)`, each the fixed class binding of that harness;
- exact base, named branch, requested fresh-worktree mode, and intended target;
- target-qualified authority, outcome, reuse anchor, structural budget, non-goals, stop conditions, validation, and external-action boundary.

Both binding lines are frozen by the body hash, so either Commander may launch the Issue on either harness without a body change. A body that carries only a single legacy `Requested binding:` line binds only the harness of that model family; adding the other harness's line is a material revision. The launching Commander records its own `commander_harness`, the attempt's `harness`, and that harness's line as `requested_binding`.

The body does not need to select a harness or a launch mode; the Commander selects both at launch and the Launch Receipt records `harness` and `launch_mode`. A body line that names exactly one harness or launch mode binds the attempt to it, and changing that line is a material revision.

The body hash is SHA-256 over the exact UTF-8 bytes of the GitHub API `body` string. Do not include a newline added by a CLI or display layer, and never hash rendered `gh issue view` output. This byte-preserving command works in bash and PowerShell and needs only the Node runtime the repository already requires:

```text
gh api repos/<owner>/<repo>/issues/<n> | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')).body;process.stdout.write(require('crypto').createHash('sha256').update(Buffer.from(b,'utf8')).digest('hex'))"
```

Before the session is created, a material body change—role, class, either binding, a harness or launch-mode restriction, outcome, authority, base/target, branch/worktree ownership, structural budget, non-goals, stop conditions, validation, or reporting/external-action boundary—requires an incremented `Brief revision`. A pre-launch editorial-only body edit may keep the revision when the contract is unchanged, but the Commander recomputes the hash. The session-creation request freezes the expected revision/hash. Any later body-byte change prevents or invalidates that attempt; after a Launch Receipt it always requires an incremented revision, new attempt, and fresh Task Session, even when editorial-only. Comments, labels, and assignments outside the body do not restart an attempt.

One Task Session identity is `Issue + harness + role + attempt`; its `commander_harness` and `launch_mode` are fixed at launch and recorded in the Launch Receipt. A follow-up may reuse that session only while its harness, launch mode, role, attempt, Brief revision/body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. A Worker starts at the exact integration base. A Reviewer starts at the immutable completed authoring commit recorded as `reviewed_head`. Start a new attempt and fresh Task Session for a new role, harness, or launch mode; any post-launch Issue-body byte change; a new binding; an unavailable-launch rebind; a reroute or mismatch response; an exact base/target or `reviewed_head` rebind; or a superseded or cancelled attempt.

## Two-stage launch

On every harness and in every launch mode the session or agent identity exists only after the first prompt is sent, so a complete receipt cannot exist before launch. Use this sequence:

1. The Commander selects the attempt's harness and launch mode, prepares the role-specific exact start, preallocates a unique `dispatch_id`, and computes the Issue-body hash. For a Worker, it creates the work-ready Issue and names the task branch: for a Codex attempt it creates the branch from the exact integration base; for a Claude Code attempt it reserves the name and, for a hand-created top-level session, positions the main checkout on the exact start, because the app creates the worktree from the main checkout's current branch, while the `subagent` and `cli-session` modes derive the worktree's start from the harness's worktree base setting and step 4 enforces the exact start; on Claude Code the branch ref itself is created in step 4 by renaming. For a Codex `cli-session` the Commander creates the detached worktree at the exact start itself. For a Reviewer, it fixes the completed authoring commit as immutable `reviewed_head`; the Reviewer receives no branch ownership. The session ID, agent ID, harness-managed worktree path, and harness-generated branch do not yet exist and cannot be placed in the first prompt.
2. The Commander launches a fresh Task Session—`create_thread` for a Codex top-level session; a hand-created desktop session with worktree isolation, a short worktree name, and the exact requested model and effort for a Claude Code top-level session; one Agent tool call with `run_in_background: true`, `isolation: "worktree"`, the explicit class model alias, and the general-purpose subagent type for a `subagent`; or the target harness's CLI in the background with the exact model and effort for a `cli-session`—with a first prompt containing only the Issue URL, dispatch ID, expected Brief revision/body hash, Commander harness, attempt harness, launch mode, role/class/binding, named branch, exact base/target, the `reviewed_head` when the role is Reviewer, and a no-write bootstrap-preflight instruction. The prompt requires the session to report its actual cwd/worktree and current branch-or-detached state.
3. The Worker or Reviewer reads root `AGENTS.md`, the Issue, and those immutable launch expectations, then verifies the hash from a byte-preserving API read, the actual checkout at the role-specific start commit, and every start/stop condition read-only. It reports `preflight-ready` or `needs-commander` and stops without expecting a Receipt or editing controlled files. In the `subagent` mode that report is the subagent's turn result, delivered to the Commander by the completion notification; in the `cli-session` mode it is the CLI's final message for that run.
4. After that first turn stops, the Commander verifies the launch-accepted binding through the mode's evidence—desktop metadata or the accepted `create_thread` request for a top-level session, the Agent call parameters it sent for a subagent, the CLI arguments it sent plus any start event for a `cli-session`—the generated worktree, confirmed against `git worktree list` and the preflight report, and a clean checkout at the role-specific start. For a Worker it then applies the attach step from the route tables, only while the checkout is clean. A Reviewer stays detached and read-only at `reviewed_head`; never attach it to a branch. The Commander sets the session title where the mode has one (fixed at creation by `description` in the `subagent` mode; `none` in the `cli-session` mode), posts the finalized Launch Receipt as one GitHub Issue comment, and sends only that immutable comment permalink to the session through `send_message_to_thread`, `send_message`, `SendMessage` to the `agent_id`, or the CLI's resume command.
5. The Worker or Reviewer fetches the exact comment, verifies every field against the Issue, session, checkout and preflight facts, and only then begins authorized work. A mismatch returns `needs-commander` without a controlled-file edit.

There is no mutable `pending` receipt and no claim that session creation plus receipt publication is atomic. No launcher script, daemon, or connector is part of this sequence; the Agent tool and the target harness's CLI are invoked directly by the Commander. If the harness has already removed an unchanged worktree before step 4 completes, the Commander closes the attempt `failed` with its Return Receipt and launches a fresh attempt.

Session titles use exactly `[#<issue>] <role> A<attempt> — <issue title>`; a subagent's `description` carries the prefix `[#<issue>] <role> A<attempt>`; a `cli-session` has no title.

## Receipts and binding evidence

Each attempt has exactly one standardized Launch Receipt and one Return Receipt as GitHub Issue comments, marked `<!-- ai7-dispatch-launch-receipt:v4 -->` and `<!-- ai7-dispatch-return-receipt:v4 -->`. Schema-v1 (Codex-only), schema-v2 (Claude Code-only), and schema-v3 (harness-routed, before launch modes) receipts on earlier Issues remain historical evidence. The Issue body owns the brief; receipts own attempt evidence and must not restate or revise the brief. Once posted, a receipt comment is immutable: never edit or delete it. If it is wrong, close or supersede that attempt with its Return Receipt and start a new attempt.

The Launch Receipt records:

- schema version, `dispatch_id`, Issue, `commander_harness`, `harness`, `launch_mode`, role, class, attempt, Brief revision and body hash;
- `requested_binding` (the attempt harness's body line), `launch_accepted_binding` from the mode's launch evidence—the accepted `create_thread` request or the desktop session metadata for a top-level session; in the `subagent` mode the Agent call parameters as sent, `<alias> @ inherited`, labeled as call parameters rather than readable metadata; in the `cli-session` mode the CLI arguments as sent plus the CLI's start event when it reports a model, labeled as such—and `runtime_model_event` at launch;
- `reported_execution_binding`, explicitly labeled as inference from launch evidence plus observed runtime events, never proof of the effective model;
- `session_id`, `agent_id` for a subagent attempt (`none` otherwise), `client_thread_id` when Codex reports one, `session_title` (`none` for a `cli-session`), `branch`, `worktree_path`, `source_branch` on Claude Code, exact base and intended target, plus the immutable `reviewed_head` for a Reviewer;
- for a `cli-session`, the permission mode, tool allowlist, or sandbox settings granted, including any network-access override;
- creation timestamp, `launch_result: accepted | launch-unavailable`, and `live_status_at_receipt` in the mode's own values when a session, agent, or process exists.

The Return Receipt records:

- the same dispatch/Issue/Commander-harness/harness/launch-mode/role/class/attempt identity, including `agent_id` for a subagent attempt;
- terminal status `completed | needs-commander | failed | cancelled | superseded`;
- final `runtime_model_event` and inferred `reported_execution_binding` with the same non-attestation label;
- exact head and concise outcome, validation state, unresolved matters, and safe next action;
- `live_status_at_return`, GitHub Issue state, pull-request state/reference, and timestamp.

A Reviewer Return Receipt repeats the exact `reviewed_head` from its Launch Receipt and also records the reviewed class and `class_match`. Set `class_match: true` only when `requested_binding` and `launch_accepted_binding` both equal the fixed reviewed-class binding on the Reviewer's own harness and `runtime_model_event` is `none`; in the `subagent` mode the comparison covers the model alias and the effort is recorded as `inherited`. A self-report never satisfies the match; `rerouted` or `mismatch` stops the attempt. The Reviewer binding lives in that Reviewer's own Launch/Return Receipts, not in the Issue's main Worker binding block.

`runtime_model_event` is `none`, `rerouted` when the harness reports an automatic model fallback or switch during the attempt, or `mismatch` when the launch-accepted binding differs from the selected requested binding—in the `subagent` mode, when the alias sent differs from the fixed alias of the requested model, the inherited effort never being a mismatch; in the `cli-session` mode, when the CLI arguments or the CLI's start event differ from the requested model or effort. An observed reroute or mismatch stops the attempt and requires Commander resolution plus a fresh attempt before controlled-file work continues. Launch evidence is harness evidence or, for a subagent or `cli-session`, the Commander's own call parameters or CLI arguments, not a model self-report, yet it is still not proof of the effective runtime model. This workflow has no provider field and no unqualified `actual model` field.

Only the Commander posts the terminal Return Receipt after accepting the Worker or Reviewer report. Keep three state namespaces separate:

| Namespace | Values |
| --- | --- |
| Task Session live status | Codex top-level session `setup-pending | running | needs-attention | idle`; Claude Code top-level session `running | idle | archived`; Claude Code subagent and `cli-session` on either harness `running | idle | ended` |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded` |
| GitHub state | Issue and pull-request states from GitHub |

`idle` never means `completed`. On Claude Code a permission prompt or blocking question is visible only in the desktop app—for a subagent, inside the hosting Commander session—and is not a receipt value. A `cli-session` has nobody to answer a prompt, so a denied required permission is a `needs-commander` report.

## Dispatch and parallel work

- One Issue owns one branch, one pull request, and one writable Worker. Never give two writers the same branch, worktree, or controlled paths.
- When two or more work-ready Issues are independent, the Commander should author them concurrently, with at most three active Worker Task Sessions across all harnesses and launch modes. Do not split work merely to fill slots.
- Parallel branches consume only stable owners and interfaces on current `dev`; they never depend on unintegrated candidate code or overlap controlled responsibility.
- Product integration remains serial. After each integration, every remaining branch re-resolves authority and base, rebases, and revalidates. Because that changes the exact base/target binding, its old attempt stops; the Commander records the terminal status and launches a fresh attempt/Task Session before any further controlled-file work.
- The live project view is the query-only [Dispatch Register](../docs/agents/dispatch-register.md). Do not create a central mutable Git ledger, daemon, database, host connector, launcher script, or workflow.

## Local completion and return

A Worker follows the applicable Change Brief and [incremental development lifecycle](../docs/agents/incremental-development.md). Product work restores only accepted pins, uses payload-safe diagnostics when useful, and completes the repository-root `doctor` → `bootstrap` → `build` → applicable Journey sequence on its supported host from inside its own worktree. Documentation/design-only work creates no automated proof and runs only its named checks.

The final Worker report contains:

- Commander harness, attempt harness, launch mode, role, task class, Issue/attempt/dispatch identity;
- requested and launch-accepted binding;
- final runtime model event and inferred reported execution binding, never an attestation;
- exact base/head, host, planned versus actual structural delta, changed paths, reuse/new-owner disposition, authority/data impact, cleanup, validation commands/outcomes, unresolved matters, and one safe next action;
- `Local diagnostic` or `Local completion` for product work, or the exact non-behavior validation state for documentation/design-only work.

In the `subagent` mode the final report is the subagent's turn result, delivered only to the Commander; in the `cli-session` mode it is the CLI's final message and report file. The Commander relays its substance into the Return Receipt and does not edit the branch. Do not include raw logs, proof artifacts, credentials, Provider payloads, private material, or personal dependency state. A Worker stops and returns `needs-commander` when the Issue is wrong, the structural budget must expand, authority or semantics drift, a required dependency/process/schema is missing from scope, protected material would be exposed, or required validation fails outside the authorized change.

The Commander audits the returned report and branch state, posts the Return Receipt, and alone performs authorized external integration. Pull requests remain Draft during authoring, review, rebase, and local validation. The current [CI boundary](../docs/agents/ci-test-boundaries.md) governs Local completion and Hosted Gate evidence; no dispatch or review receipt is a new gate.

## Review and retention

Independent review is optional and advisory unless an exact Owner/Issue instruction requests one. After an authoring head is locally complete, the Commander fixes that exact commit as immutable `reviewed_head` and launches the Reviewer from it as a separate fresh attempt on the harness it selects for the review—the Worker's harness or the other one—in an applicable launch mode at the reviewed class's binding on that harness. The Reviewer verifies its checkout and Launch Receipt against `reviewed_head`, reads the canonical Issue from fresh context, never reuses the Worker session or transcript, and spawns no agent. After accepting the review report, the Commander repeats that same head in the Return Receipt.

Keep a completed Worker or Reviewer Task Session visible through the Issue's merge, close, or abandonment, then the Commander archives it through its harness's retire action. A subagent attempt is visible only in its hosting Commander session's agent listing: keep that session unarchived and the attempt's retained worktree in place through the same node, then remove the worktree with `git worktree remove`; the harness removes an unchanged worktree by itself when the agent ends, which is the normal end of a Reviewer attempt. A `cli-session` attempt's retention is its persisted transcript, report file, and worktree, kept through the same node and then removed the same way. A `needs-commander` session remains visible. A `superseded` or `cancelled` attempt receives a Return Receipt and is archived immediately. Session archival is task retention; it is distinct from repository `docs/archive/` document lifecycle.

## Decision summary

Accepted in Question 25, replaced by the Owner on 2026-09-03 in ADR 0059, rebound to Claude Code in ADR 0060, routed by the Commander's harness in ADR 0061 on 2026-09-04, and extended the same day by ADR 0061's `subagent` launch mode and ADR 0063's per-attempt harness selection with the `cli-session` launch mode:

- two supported harnesses, Codex and Claude Code, with the Commander selecting each attempt's harness and launch mode, never changed within one attempt;
- fixed bindings per harness and class, selected by the attempt's harness, with one requested-binding line per harness in every work-ready Issue body;
- fresh Issue-bound Task Sessions in isolated worktrees for every Worker, Reviewer, role, and attempt, launched as a hand-created top-level session, a Claude Code Agent-tool subagent, or a CLI-launched session—the only mode across harnesses—and recorded as `launch_mode`;
- a two-stage verified Launch Receipt and Commander-authored Return Receipt in schema v4 with `commander_harness`, `harness`, `launch_mode`, and `agent_id` fields, and a commit trailer that follows the attempt's harness;
- no fallback, runtime-model attestation claim, or Commander inline T1–T3 substitute, with a subagent's effort inherited from the Commander session and recorded as `inherited`;
- queryable Issue receipts plus the Commander's own session, agent, and background-process tools instead of orchestration infrastructure, the target harness's CLI being an Owner host prerequisite; and
- bounded parallel authoring with serial product integration and fresh attempts after target drift.
