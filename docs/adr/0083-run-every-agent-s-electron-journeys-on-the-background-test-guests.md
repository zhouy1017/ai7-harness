---
status: accepted
---

# Run every agent's Electron Journeys on the background test guests

On 2026-09-19 the Owner directed: 「把 e2e 测试使用后台 VM 完成的规则写入并合并进入项目，要求 agents 严格遵守」 — write into the project, and merge, the rule that E2E tests are completed on the background virtual machines, and require agents to follow it strictly. The Owner's direction to write and land this record is its acceptance, as it was for [ADR 0081](./0081-run-the-nightly-full-gate-over-every-open-pull-request-merge-the-ones-that-pass-and-then-over-dev.md) and [ADR 0082](./0082-hold-the-dispatch-rules-for-implementation-work.md).

Until now the Electron layer of the Local Verification Ladder ran on the development host's own desktop. Every Journey opens a real window (`headless: false`), so a run took the foreground from the Owner for minutes at a time, and the host admits one Electron Journey at a time, so [ADR 0069](./0069-bind-the-parallel-closeout-wave.md) had to queue parallel attempts behind a single E2E slot. Between 2026-09-17 and 2026-09-19 the Owner built two Hyper-V guests on the development host, `ai7-testbed-01` and `ai7-testbed-02`: Windows 11 Pro 10.0.26200 x64, 6 vCPU, Dynamic Memory 4–8 GB, accepted by `pnpm run doctor` and by a 35-check guest self-check, reached over SSH on a host-only network. At `dev@3329ce3` (PR #439), the head the guests were accepted on, a complete ladder takes about four and a half minutes on a guest (`e2e:all` 227–233 s, against 656 s for the same step on the hosted Windows runner in the full-gate dispatch of 2026-09-09), and with both guests running the same head at once — a complete ladder on one, the gate set on the other — the complete ladder was no slower (`e2e:all` 227 s); two complete ladders side by side have not yet been measured. This decision makes the guests the place where an agent's Journeys run.

## Decision

### 1. The rule

An agent — a Commander, a Worker, a Reviewer, or a session working under the ADR 0082 hold — **never launches an Electron Journey on the development host's own desktop**. Every command that starts the product under the E2E controller (`pnpm run e2e`, `e2e:all`, `e2e:gate`, `e2e:debug`, `e2e:repeat`, `e2e:diagnose`) runs on a background test guest through the host runner of §3. The Local Verification Ladder that a Change closure attests is **one guest run of every available layer at the exact committed head**.

The layers that open no window (`check`, `test`, `test:service`, `build`) may also be run in the worktree on the host while authoring. That is feedback for the author; it is not the attestation.

The rule binds agents. The Owner runs what the Owner chooses, anywhere, and only the Owner's word, given in that session, admits an agent-started Journey on the host desktop. Such a run holds the host's single Journey slot, and the closure says that it happened and why.

### 2. The test bed

| Guest (VM name = hostname = SSH alias) | Host-only address | Used by |
| --- | --- | --- |
| `ai7-testbed-01` | `10.7.0.11` | the Commander, the integration head, a session under the ADR 0082 hold |
| `ai7-testbed-02` | `10.7.0.12` | Worker attempts and any second session |

The assignment is a default, not a lock: an agent uses a guest whose runner task is idle. A guest is an actual Supported Development Host in the sense of [CI and test boundaries](../agents/ci-test-boundaries.md) — the Windows 11 row of the declared host matrix, not a further host identity: `doctor` accepts it and the product is built and launched there exactly as on any Windows development host. It holds a detached clone fed only by git bundles, with no remote, no credential, no git credential helper and no Provider key; the only manuscript-shaped content in its working tree is what the checked-out head tracks under `SampleBooks/` — at any head since S88 (#446), `sample1.docx` alone. A guest is not network-isolated: beside its host-only adapter it keeps an outbound NAT adapter, which `bootstrap` needs to fetch the pinned artifacts and packages.

The runner, the guest scripts and the procedures that build, harden, accept and clone a guest live outside every repository, at `C:\HyperV\scripts` on the development host, under their own local history. They carry host paths and Hyper-V administration and are not product or delivery material. Creating, cloning, resizing, starting or stopping a guest is an Owner action.

### 3. How a run is made

From any session on the development host, elevated or not:

```powershell
C:\HyperV\scripts\Invoke-Ai7VmE2E.ps1 -Guest ai7-testbed-02 -Worktree <worktree path> -Layers doctor,bootstrap,check,test,service,build,e2e:all
```

- The runner verifies the **committed** `HEAD` of the worktree: it bundles that commit, delivers it, and the guest checks out exactly that SHA. It refuses a worktree with uncommitted changes; a run made with `-AllowDirty` is Local diagnostic and never an attestation.
- **One run per guest at a time.** The runner refuses a guest whose task is running and detects a second invocation racing for the same guest. When both guests are busy the agent waits; it never starts a Journey on the host instead. This replaces ADR 0069's single E2E slot: as many attempts may hold the Journey rung at once as there are idle guests, and the `ready-for-e2e` hand-off of that ADR applies only while no guest is idle.
- The runner is **invoked as a foreground command and waited on to its exit code** — `0` only when the run finished and every layer exited `0` — never as a background task. "Background" names the guest's desktop, not the agent's task. A complete ladder returns in about five minutes, which is longer than the default command timeout of an agent's shell tool: the agent sets that tool-call timeout to cover the run — ten minutes covers a complete ladder; the runner's own `-TimeoutMinutes` is a different limit and stays at its default — and splits a long `e2e:repeat` into runs that fit. A runner killed by its caller's timeout leaves the guest's task running: that result is never collected and the guest refuses every invocation until the task ends, so the agent waits for it to end and runs again.
- Invoking the runner is part of running the ladder, not an external action: a Worker may do it, and a `cli-session` allowlist that covers a brief's validation commands covers it.
- Layers: `doctor`, `bootstrap`, `check`, `test`, `service` (`test:service`), `build`, `e2e:all`, `e2e:gate`, `e2e:J-xx` (one admitted Journey), `e2e:debug:J-xx`, `e2e:repeat:J-xx:<n>`, `e2e:diagnose:J-xx`. Layers run in the order given and stop at the first failure. The guest cleans its checkout before every run and keeps only the bootstrap products (`.cache`, `.pnpm-store`, `node_modules`, `.runtime`), so `dist/` never survives from an earlier run: `build` precedes any `e2e:*` layer in **every** run (for example `-Layers build,e2e:debug:J-12`), and `bootstrap` precedes `build` in any run that follows a change of pins or the lockfile.
- The guest self-check gates every run. `-RebootIfPending` lets the runner restart a guest that reports a pending reboot and wait for it to pass the self-check. `-SkipDoctor` bypasses that gate and is never an agent's own choice. Only the Owner's word, given in that session, admits it, and the closure then names it together with the failing check. The runner's own hint to pass it is not that word, and without the Owner's word a blocking self-check failure is a §6 stop. Leftover processes and stale Journey temp directories from an interrupted run do not block, because the guest runner sweeps them before it starts.
- Results land in `C:\HyperV\results\<guest>\` (`<sha>.json`, `<sha>.log`, dated copies, and a zip of full-fidelity artifacts for a `debug` or `repeat` layer). They are the runner's working record and evidence nobody cites: they are never copied into a worktree, a commit, an Issue or a pull request, and a closure reports only the head, the host, the layers, their outcomes and the disclosed-skip markers of §4, as the payload-safe rule of CI and test boundaries already requires.

### 4. The attestation

The Change closure's ladder line names the guest as the host:

```
Local Verification Ladder: <head SHA> on ai7-testbed-02 (Hyper-V guest, Windows 11 Pro 10.0.26200, 6 vCPU) — doctor, bootstrap, check, test, test:service, build, e2e:all: pass; disclosed skip: J-01 doc-manuscript-local-only-absent
```

The line repeats every `LOCAL_COMPLETION/<journey>/disclosed-skip/<name>` marker the runner printed for the run; on a guest J-01's `doc-manuscript-local-only-absent` is always one of them (§5).

For agent-authored work, a ladder attestation whose Electron layer ran on the development host's own desktop without the Owner's word does not satisfy the ladder, and blocks Ready exactly as a missing attestation does.

### 5. What the rule does not touch

- **The hosted Gate and the nightly queue** ([ADR 0075](./0075-split-the-hosted-gate-into-a-fast-pull-request-lane-and-a-nightly-full-gate.md), ADR 0081) are unchanged. A guest is not a runner: it is never registered with GitHub Actions or called by a workflow, and a guest run is local evidence, never Gate evidence or a further occurrence ([ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md)).
- **CI parity.** A guest is a Windows 11 development host, not the Windows Server 2025 CI-parity environment that [ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md) names for a failure that does not reproduce locally. Whether the guests serve that purpose is not decided here.
- **macOS.** There is no macOS guest. A guest result is Windows evidence only; macOS evidence comes from the hosted nightly under [ADR 0054](./0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) and ADR 0075 as before.
- **`developer-live` Provider work** ([ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md), [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md), [ADR 0070](./0070-run-developer-live-unattended-and-size-the-ceiling-per-unit.md)) is not a Journey and stays on the development host under its own rules, where the protected credential, the Provider Test Ledger and the Provider Result Cache live. It never runs on a guest: a guest holds no credential and must never receive one.
- **Local-only SampleBooks.** A guest receives only the committed tree, so every case gated on a local-only SampleBook skips there and J-01 discloses its `.doc` scenario as skipped, exactly as on a hosted runner; the closure repeats the disclosure. No agent copies a local-only SampleBook, or any other untracked manuscript, to a guest ([`SampleBooks/README.md`](../../SampleBooks/README.md): "no hosted occurrence, no fixture, no derivative, and no transmission"). The gated unit and service cases still run on the development host, where those layers open no window. A change that touches legacy `.doc` intake — for example the converter `src/service/doc-manuscript.ts`, its `word-extractor` pin, the `.doc` detection in `src/service/manuscript-format.ts`, or J-01's `doc-manuscript` scenario — additionally needs J-01 on the development host where the Owner keeps the file; that run is the Owner's, or an agent's on the Owner's word under §1. The agent asks for it — a Worker reports it to the Commander in its Return Receipt, any other session tells the Owner — and the pull request stays Draft until the closure records that run's head and outcome.
- **Protected material.** A run sends a guest only the runner's own guest scripts, a git bundle of the head, and the request that names the head, the layers and the requesting session (host account, worktree path and branch). No credential, `*.key.txt`, manuscript, private sample Book or derivative is ever copied there, and a guest never calls a model Provider.
- **The subject.** The Journeys, `ADMITTED_JOURNEYS` and `GATE_JOURNEYS`, the controller, its payload-safe output and every file under `e2e/`, `src/` and `tools/` are unchanged. This decision changes where a command runs, not what it runs.

### 6. When the test bed cannot serve

If the runner is missing, a guest is unreachable, or the self-check reports a blocking failure the runner cannot heal, the agent stops — a Worker or Reviewer reports `needs-commander`, any other session tells the Owner — quoting the runner's message, and the pull request stays Draft. There is no fallback to the host desktop. The agent does not change a guest by hand beyond what the scripts do, and does not weaken or skip a check to obtain a run. Both guests being down is an Owner matter.

### 7. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| ADR 0062, Local Verification Ladder | "on the actual supported development host" | For an agent that host is a background test guest; the layers and their order are unchanged |
| ADR 0062, Local debug fidelity | "Those artifacts exist only under `test-results/`" | For a guest `e2e:debug` or `e2e:repeat` run they exist in the guest checkout's ignored `test-results/` and, zipped by the runner, in the runner's results directories on the guest and on the development host (`C:\HyperV\results\<guest>\`, §3); they still never enter a repository, a CI log or an uploaded artifact |
| ADR 0069, Parallelism and the single E2E slot | "only one Electron Journey may run on this host at a time, so `e2e:all` cannot run in two attempts at once" and the `ready-for-e2e` hand-off | One run per guest; the hand-off applies only while no guest is idle (§3) |
| [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md), scope paragraph | ADR 0069 "owns … the single-E2E-slot rule for parallel attempts" | Names this decision as its replacement and as the owner of where an attempt's Electron Journeys run |
| Repository Development Dispatch, Parallel work and integration | "Only one Worker may run Electron Journeys on one host at a time; the Commander tells the other to hold its Journey rung." | Replaced by the one-run-per-guest sentence |
| Repository Development Dispatch, Local completion and return | "A Worker runs the Local Verification Ladder from inside its worktree on the supported host" | The ladder is run for the worktree's committed head on a background test guest through the host runner |
| [CI and test boundaries](../agents/ci-test-boundaries.md), Local Verification Ladder | — | New subsection "Where the ladder runs" owns the operating rule; Observed failures and diagnostics and CI-degraded operation say how their artifact and "retain no log" clauses read for a guest run |
| [Incremental development](../agents/incremental-development.md) §6 | "on the supported Windows host"; "full-fidelity debug output stays under ignored `test-results/`" | For an agent, a background test guest; for a guest run, also the runner's results directories |
| [Change Brief](../agents/change-brief.md), Change closure | the ladder line's host | Names the guest, and every disclosed skip |
| Root `AGENTS.md`, [agent document router](../agents/README.md), `PROGRESS.md` | — | Routing only; `PROGRESS.md`'s process rule "`e2e:all` is run in the foreground and waited on" and its Resume Prompt now name the guest runner |

ADR 0082 §3 lists ADR 0069's "single Electron Journey per host" among the clauses that continue under the hold; it continues as amended here.

[ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md), Completion and integration while CI is degraded, says "no proof artifact or payload is retained", and CI and test boundaries, CI-degraded operation, says "retain no log, receipt, payload, database, screenshot, trace, video, or proof artifact". That mode is inactive today. When it is active, an agent's Local completion is a guest run, and both clauses are read for the repository, the Issue and the pull request, which still carry only the head, the host, the commands and the outcomes. The runner's working record outside every repository (§3) is cited by nobody and is not retained evidence.

## Consequences

- The Owner's desktop is no longer taken by test windows, two attempts verify at once, and a local ladder returns about three times faster than the hosted Windows runner.
- The rule depends on tooling outside the repository. That is accepted: the tooling is host administration, a fresh agent learns the command from the runbook, and the tooling's absence is a stop, not a licence to use the desktop.
- A guest records its Windows build, vCPU, memory, desktop-session state and locale (`zh-CN`) in every result. Differences from the `en-US` hosted runners still surface in the nightly, as before.
- The `.doc` scenario of J-01 loses its routine local run, because agents no longer run J-01 where the local-only file lives. Its coverage now depends on the Owner's own run, or the Owner's word, whenever legacy `.doc` intake changes.
- A clean guest showed what no developer machine or hosted runner had: the Windows credential-store carrier needs the Microsoft VC++ runtime, without which the product reports the operating-system credential store as unavailable and J-12 fails. The guests carry the runtime; how the product declares or handles that dependency is separate work.

## Rejected alternatives

- **Keep the host desktop as a fallback when the guests are busy.** Rejected: the fallback is the behaviour the rule removes, and the wait it avoids is minutes.
- **Bring the runner and the guest scripts into the repository under `tools/`.** Rejected: they carry host paths, Hyper-V administration and guest hardening, none of which is product or delivery material, and `tools/` admission and the `check` layer would follow them in.
- **Copy the local-only `.doc` to a guest so J-01 stays whole there.** Rejected: it is a manuscript, and the rule that it is read by local tests alone, with no transmission, is older than this decision.
- **Run Electron headless on the host.** Rejected: the Journeys are defined against a real window and the hosted runners; changing the subject for convenience would weaken what a pass means.
- **Rely on the hosted pull-request lane alone.** Rejected: that lane never runs J-01 or J-02, and ADR 0062's local-first ladder stands.
- **PowerShell Direct instead of SSH.** Rejected: it needs an elevated session with Hyper-V rights, and agent sessions are neither.

This decision governs where repository-development agents run the ladder's Electron layer. It changes no AI7 product behaviour, Journey, Gate occurrence, Provider Processing scope, credential, policy document, export, publication, release, or `main` authority.
