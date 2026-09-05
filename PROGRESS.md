# Current checkpoint

## What's done

- The Local Verification Ladder is complete and every layer is available: `doctor`, `bootstrap`, `check` and `test` (#235 / PR #236, admitting `vitest@4.1.11`), `test:service` (#243 / PR #254), `build`, the admitted Journeys through `e2e` / `e2e:all`, and the full-fidelity `e2e:debug` / `e2e:repeat` (#237 / PR #238). ADR 0062's landed-layer statement is current (#255 / PR #257).
- The J-02 Windows-only restart failure is fixed at the product (#239 / PR #245): `EditorialStore.open` runs terminal-schema-version store-truth validation only at its first and final positions instead of four times, and `ServiceClient.start` bounds startup readiness with its own 120 s deadline instead of the generic 30 s request timeout. Its runner-side classifications landed too: the restart renderer-target query settles on browser disconnect instead of hanging (#240 / PR #248), and the initial-launch readiness wait now names the missing half (`J-02/renderer-ready-flag` or `-landing`) with its deadline bound to the product's own 120 s plus a 15 s margin (#247 / PR #253).
- The six E2E runners share one browser-disconnect guard for child CDP sessions (#249 / PR #258) and one CDP operation-deadline helper, first shared between J-01 and J-12 (#256 / PR #260).
- The pure-module unit suites (docx, launch policy, recovery objects, request frames) and the `test:service` layer over the real `EditorialStore` (editorial store, recovery, Task authorization) exist (#242 / PR #251, #243 / PR #254).
- `bootstrap` fails closed on an incomplete installed closure instead of leaving an empty package payload directory undetected (#250 / PR #252).
- The dispatch runbook carries the `subagent` and `cli-session` launch modes and the `subagent` retention-marker rule (#241; #244 / PR #246).

## What's next

- No wave work is pending. Three open work-ready Issues remain launchable on either harness in any applicable launch mode once each base is re-resolved to the current `dev` head: #215 (archive-only lifecycle routing, Draft PR #216), #198 (J-01 completion diagnostics, Draft PR #199), and #91 (foreground execution boundary, Draft PR #193, which also edits `src/service/index.ts` and must rebase over #242's extraction of `src/service/request-frames.ts`).
- Product integration remains serial.
- One candidate follow-up without an Issue: the controller's debug-capture child session (`captureBrowserScreenshots` in `e2e/controller.mjs`) is bounded by `withTimeout` only, not the shared disconnect guard.

## Key decisions

- Launch modes are `top-level-session` (both harnesses, same-harness only), `subagent` (Claude Code Commander only), and `cli-session` (either harness, the only mode for a cross-harness attempt); the Commander chooses per attempt. In the `subagent` and `cli-session` modes the Commander launches, relays, and audits but never edits the attempt's worktree or branch.
- Bindings per harness: Codex Commander `gpt-5.6-sol @ ultra`, T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`; Claude Code Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`.
- Local Verification Ladder layers are required local surfaces, never hosted gates; a product pull request records its ladder attestation in the Change closure before Ready.
- A red Gate returns to Draft for local, then CI-parity, reproduction; a marker-only change is the last resort after that, and a red Gate whose root cause is already known gets no new diagnostic marker. A red Gate or Local diagnostic failure that does not reproduce gets one documented reproduction attempt, and then one fresh clean occurrence of the same rung stands as the required completion.
- A `subagent` preflight leaves exactly one untracked `.ai7-preflight-<dispatch_id>` marker at the worktree root so the harness does not auto-clean it before the attach step; the Worker deletes it after verifying the Launch Receipt, and it never enters a commit.
- Workers run every ladder step in the foreground; the six Electron Journeys run one at a time per host.
- A continuation attempt attaches the existing Issue branch in the attach step and rebases the prior attempt's commit onto the re-resolved base with `git range-diff` proof of no content change; the Commander then force-pushes the branch with a lease on the previous tip.
- Model-dependent testing uses synthetic deterministic fixtures by default and the ADR 0044 recorded fixture only as a replayed realism anchor; recording authority is unchanged.
- Debug artifacts are developer-host material under ignored `test-results/`; nothing from them is committed or uploaded, and CI output stays payload-safe.
- Screenshots are captured through a browser-level CDP session from the controller, so the runners need only small hooks and no per-session wiring.
- Product Provider, Model Role, DSH, Provider Processing/fallback, credential, Effect, export, publication, distribution, release, and `main` authority are unchanged.

## Unresolved matters or blockers

- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev`, archival of `handoff20260817/`, and removal of stale local worktree registrations are separate Owner decisions.
- The self-hosted Gate question is shelved by the Owner on 2026-09-05.
- One local `LOCAL_COMPLETION/J-01/fail` of unknown cause recorded on #249 did not reproduce in six subsequent runs at the same head.

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then query the Dispatch Register and current Issue receipts with your own session, agent, and background-process tools. Treat the 2026-09-04 test-integration wave and its follow-ups as integrated; the Local Verification Ladder is complete (doctor, bootstrap, check, test, test:service, build, e2e/e2e:all, e2e:debug, e2e:repeat). Relaunch #215, #198, or #91 only after re-resolving each base to the current dev head, one fresh Task Session per attempt in its own worktree, with schema-v4 receipts; keep product integration serial and require the ladder attestation before Ready. Under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
