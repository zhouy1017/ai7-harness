# Orca repository dispatch

Status: Owner-approved on 2026-10-12 and amended on 2026-10-26 under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). This is the single current owner of repository-development dispatch (both manual per-Issue dispatch by the Owner and Orca wave dispatch), test-gated repair and integration. It does not define AI7 product Tasks or grant manuscript publication authority.

## Session precedence

These dispatch modes, model recommendations, branch names and verification sequences are defaults. Owner startup/session instructions and an authorized Commander dispatch apply immediately, including custom models, branch targets, serial/parallel delivery and verification scope; no exemption, receipt or rulebook revision is needed. Wave 23 follows [#1279](https://github.com/zhouy1017/ai7-harness/issues/1279) and its assigned Issues. Keep one active writer per slice and respect the session's merge owner.

## 1. Choose the outcome and dispatch mode

Work starts from the [development plan](../development/development-plan.md), [PROGRESS](../../PROGRESS.md) and a self-contained GitHub Issue carrying the [bounded brief](change-brief.md). Classify by complexity:

- **T0:** an unresolved outcome or authority decision; resolve before coding.
- **T1:** mechanically checkable documentation, small deterministic corrections and narrowly specified edits.
- **T2:** a standard feature or refactor with a known seam and written acceptance criteria.
- **T3:** cross-module behavior, architecture, data/recovery, credentials, policy, source scope or authority boundaries.

**Two supported dispatch modes:**

1. **Manual per-Issue dispatch (default for step-by-step delivery):** The Owner assigns a single GitHub Issue directly to a coding agent session. That agent is the sole writer for the slice, implements the brief, runs verification, fixes any failing CI or E2E tests, and prepares the branch/PR for merge.
2. **Orca wave dispatch:** A Commander coordinates multiple slice workspaces in parallel over disjoint file owners using Orca (`orca-cli` / `orchestration`).

**No mandatory cross-provider check:** Cross-provider review (requiring a second agent on a different subscription channel to review and hand off every slice) is permanently retired. Any available subscription channel (**ChatGPT**, **Claude**, or **OpenCode Go**) and capable model may execute the assigned Issue. Do not block or hold completed coding work waiting for another provider's quota recovery.

| Class | Recommended Coding Agent | Default verification |
| --- | --- | --- |
| T1 | OpenCode Go (`deepseek-v4.1-flash` / `glm-5.3-flash`), ChatGPT, or Claude | Pass applicable doc/unit checks; fix only if CI fails |
| T2 | ChatGPT (`gpt-6.1-sol`) or Claude (`claude-sonnet-5-5` / `claude-opus-5-5`) | Pass local check/unit/service/build + E2E Gate; fix only on E2E or CI test failure |
| T3 | ChatGPT (`gpt-6.1-sol` / `gpt-6-astra`) or Claude (`claude-opus-5-5`) | Run checks and affected Journeys appropriate to the outcome + existing Gate; fix only on E2E or CI test failure |

Completion: the Issue has a bounded outcome, dependencies, hint paths, non-goals and acceptance checks.

## 2. Branch and workspace setup

A wave uses `codex/integration-<wave>` branched from `dev` (or slices may target `dev` / the active wave branch as specified in the Issue). A slice uses `codex/<issue>-<slug>`. Dependent tasks start after their prerequisites land; independent tasks with disjoint ownership may proceed in parallel. Integration stays serial.

Record in the Issue/PR:

- Issue and brief revision, dependency links and acceptance criteria;
- slice/target branches and exact baseline commit;
- tested head/base, verification results and final merge commit.

Keep live attempt chronology out of PROGRESS. Subscription exhaustion on one tool means switching to an available tool or waiting; it never authorizes extra paid API fallback.

## 3. Build, verify and open the PR

The coding agent implements the outcome, including necessary upstream/downstream files and runner/test repairs, and follows anti-defensive coding and test-proportionality rules ([incremental development](incremental-development.md)), runs the applicable [verification](ci-test-boundaries.md), commits its slice branch, and opens or updates a PR to the target branch. On the test guests a slice runs only the part of the ladder its change touches; the full ladder runs at each merged integration tip ([where the ladder runs](ci-test-boundaries.md#where-the-ladder-runs)). The slice brief names the exact layer list.

The PR describes the resulting behavior, linked Issue, exact tested head, checks and remaining limitations. A single slice has one active writer at a time.

## 4. Review Gate: fix only when E2E or CI tests fail

The Review Gate is strictly test-driven:

- **Pass path:** When `pnpm run check`, `pnpm test`, `pnpm run test:service`, `pnpm run build`, and the applicable E2E Journeys (`e2e:gate` / `e2e:all` on the background test guest or hosted CI Gate) pass at the candidate head, the slice is ready to merge. No separate Reviewer agent, cross-provider audit, or multi-round handoff ceremony is required.
- **Failure path:** Repair or follow-up review is triggered **only when E2E tests or CI tests fail** (or when a merge conflict needs repair). The coding agent (or a newly dispatched repair agent) reproduces the failing check/Journey, applies the minimal fix on the slice branch, and re-verifies until E2E and CI pass.
- **Documentation-only changes:** Use `pnpm run docs:check` and `git diff --check`; they do not trigger model inference or an unrelated product build.

## 5. Integrate into wave and dev

Slices merge serially into the wave branch (or `dev` when dispatched directly). For wave integration, once the wave's slices are merged, open the wave-to-`dev` PR, raise `package.json` to the wave's version and add the version-ledger row ([ADR 0098](../adr/0098-adopt-one-x-y-z-version-across-releases-and-internal-management.md)).

Each merged integration tip runs the full guest ladder, split over the guest pool, and a failure there returns to the slice that caused it. The final integration candidate passes the provider-free Gate at its current head/base, updates [PROGRESS](../../PROGRESS.md) and closes implemented Issues. The Gate depends on actual build/test results, without Orca JSON comments, model admission, branch-name admission or separate slot-release receipts. Record exact tested head/base and slice merge commits in the PR. Promotion to `main`, release and manuscript publication remain separate Owner decisions. After the wave PR merges into `dev`, the Commander refreshes the Owner's fixed local human-test build with `pwsh tools/human-test-build.ps1` (Windows host; it packages `dev` into one fixed folder, replaces `AI7/app`, preserves the tester's `AI7/data`, keeps the previous application for one generation and writes `BUILD-INFO.txt`) and names that folder and the built commit in the wave closure; human testing uses that folder, never an ad-hoc build. Wave 23 targets `0.5.0` Beta; `1.0.0` requires completed human testing and new explicit Owner authorization.

## 6. Keep the three model uses separate

| Use | Rule |
| --- | --- |
| Repository coding agents | Normal live subscription inference under this rulebook; do not apply product test live-once rules to agent conversations |
| AI7 developer-live product tests | Necessary new questions may call the approved Provider autonomously; reuse prior evidence and fixtures for identical/similar development validation under ADR 0089 |
| Actual AI7 user business | New user-initiated tasks perform real model steps, even for repeated input; product resume/incremental reuse follows its own semantics |
| CI/Gate/ordinary automated regression | Provider-free; no product model credential or live model call |

Coding-agent model recommendations do not register models in AI7's product runtime. The [policy index](../policies/README.md) and generated [provider support](../development/provider-support.md) own current selection and capability evidence.

## 7. Summary of active gate rules

- **Manual per-Issue dispatch:** Allowed at any time; the Owner may dispatch one Issue at a time to any coding agent.
- **Cross-provider check:** Not required; single-writer delivery and same-channel completion are valid.
- **When to fix:** Only when E2E tests or CI checks fail, or when a merge conflict occurs.
