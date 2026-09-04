# Current checkpoint

## What's done

- The Local Verification Ladder debug layers land on this branch: `pnpm run e2e:debug -- --journey <id>` writes the complete failure error with `cause` chain and stack, runner and product stdout/stderr, and renderer screenshots only under ignored `test-results/e2e/<journey>/<timestamp>/`; `pnpm run e2e:repeat -- --journey <id> --times <n>` repeats one Journey and keeps only the failing run's artifacts. The controller-only switch is refused under CI and never reaches the product process; `e2e`, `e2e:all`, and `e2e:diagnose` output is byte-identical to before.
- ADR 0061 is revised and ADR 0063 is added on 2026-09-04. The Owner reversed ADR 0060's rejection of in-session subagent attempts: a Claude Code Commander may launch a Worker or Reviewer attempt as a background subagent through its Agent tool (`run_in_background: true`, `isolation: "worktree"`, explicit class alias), beside the hand-created top-level session. The Owner then allowed cross-harness dispatch: the Commander selects each attempt's harness, and a cross-harness attempt runs as a `cli-session` launched from the Commander's shell with the exact class model and effort. Receipts move to schema v4 with `commander_harness`, `launch_mode`, and `agent_id`; the commit trailer follows the attempt's harness.
- ADR 0062 accepts a required developer-run Local Verification Ladder (type check, unit, service-integration, build, admitted Journeys, full-fidelity local debug and repeat) beside the unchanged per-Ready-pull-request Hosted E2E Functional Gate. It amends ADR 0027's local rigor trade-off and ADR 0049/0053's Local diagnostic clauses; the Gate identity, provider-free boundary, platform parity, and CI exclusion list are unchanged.
- Work-ready Issue bodies carry one requested binding per harness; the attempt's harness selects the line, so no body changes for a launch mode or a cross-harness launch.
- Issue #209 / PR #214 is the last product integration; Issues #229, #231, #233, and this ADR 0061/0063 revision are governance-only. Issue #235 (PR #236, vitest plus `check`/`test`) still holds its ladder layer as a Draft pull request; Issue #237 (PR #238) carries `e2e:debug`/`e2e:repeat` here.

## What's next

- Integrate PR #236 (#235, vitest plus `check`/`test`) after its exact-head Windows Local completion and one paired Hosted Gate occurrence; then shape the pure-module unit-test batch, the service-integration batch, and the J-02 CI-only failure reproduction campaign — which now has `e2e:debug` and `e2e:repeat` — as fresh attempts with schema-v4 receipts.
- Open Issues #215, #198, #217, #227, and #91 are in ADR 0061 form and remain launchable on either harness in any applicable launch mode; their fresh-Task-Session wording covers every mode. #215 is the reshaped archive-only lifecycle Issue. Product relaunches follow the ladder rules as their layers become available.
- Product integration remains serial; the Commander resolves order after each base is re-resolved.

## Key decisions

- Launch modes are `top-level-session` (both harnesses, same-harness only), `subagent` (Claude Code Commander only), and `cli-session` (either harness, the only mode for a cross-harness attempt); the Commander chooses per attempt, and the Issue body restricts a harness or mode only when a body line names exactly one. In the `subagent` and `cli-session` modes the Commander launches, relays, and audits but never edits the attempt's worktree or branch; a Reviewer never spawns an agent.
- In the `subagent` mode the Agent call passes the class alias (`sonnet`, `opus`, `fable`) and no effort; the attempt inherits the Commander session's effort, the receipt records `<alias> @ inherited` as call parameters rather than readable metadata, and the effort component is excluded from `mismatch` and `class_match`. A `cli-session` carries the exact model and effort as CLI arguments.
- The target harness's CLI is an Owner host prerequisite, never a repository dependency, script, daemon, or connector. On 2026-09-04 the Owner installed both host-wide from an unpackaged terminal as global npm packages (`@anthropic-ai/claude-code` 2.1.260; `@openai/codex` 0.153.2 with its `win32-x64` alias), both logged in through the desktop apps' existing accounts; because packaged desktop apps virtualize `%APPDATA%`, each Commander still verifies the target CLI from its own shell before a cross-harness launch.
- Local Verification Ladder layers are required local surfaces, never hosted gates; a product pull request records its ladder attestation in the Change closure before Ready.
- A red Gate returns to Draft and local reproduction; CI-parity reproduction precedes any diagnostic-marker Issue.
- Model-dependent testing uses synthetic deterministic fixtures by default and the ADR 0044 recorded fixture only as a replayed realism anchor; recording authority is unchanged.
- Debug artifacts are developer-host material under ignored `test-results/`; nothing from them is committed or uploaded, and CI output stays payload-safe.
- Screenshots are captured through a browser-level CDP session from the controller, so the six runners need only five small hooks each and no per-session wiring.
- Bindings per harness: Codex Commander `gpt-5.6-sol @ ultra`, T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`; Claude Code Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`.
- Product Provider, Model Role, DSH, Provider Processing/fallback, credential, Effect, export, publication, distribution, release, and `main` authority are unchanged.

## Unresolved matters or blockers

- `check` and `test` (#236) exist only on their Draft branch until integrated; `e2e:debug` and `e2e:repeat` land with this branch; `test:service` has no Issue yet. Until then the ladder consists of the available layers.
- The J-02 Windows-only restart failure behind #217/#227 has no root cause; its reproduction campaign is now unblocked by the debug and repeat commands.
- The `subagent` mode is now observed: Issue #239's attempts confirmed that the harness removes a still-unchanged worktree when the agent's turn ends, which destroyed two no-write preflights before their attach step, and that one untracked `.ai7-preflight-<dispatch_id>` marker keeps the worktree alive. The dispatch owner, Change Brief, and Dispatch Register carry that rule. No attempt has used the `cli-session` mode yet; its worktree start, CLI permission coverage, and Codex sandbox network access are still specified only from the tool contracts and documentation, and the first such attempt's receipts record what is actually observed.
- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev`, archival of `handoff20260817/`, and removal of stale local worktree registrations are separate Owner decisions.

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then query the Dispatch Register and current Issue receipts with your own session, agent, and background-process tools. Integrate the Draft ladder pull requests serially (#236 vitest/check/test, then #238 e2e:debug/e2e:repeat), each after exact-head Windows Local completion and one paired Hosted Gate; then shape the unit and service test batches and the J-02 reproduction campaign with pnpm run e2e:repeat, each as a fresh Task Session in its own worktree — a hand-created top-level session, a Claude Code Agent-tool subagent, or a cli-session on either harness (the only mode for a cross-harness attempt) — with schema-v4 receipts. Keep product integration serial and require the Local Verification Ladder attestation before Ready. Under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
