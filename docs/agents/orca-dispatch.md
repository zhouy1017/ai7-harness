# Orca repository dispatch

Status: Owner-approved on 2026-10-12 under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), tracked by [#805](https://github.com/zhouy1017/ai7-harness/issues/805). This is the single current owner of repository-development roles, model pairing, dispatch and handoff. It does not define AI7 product Tasks or grant manuscript publication authority.

## 1. Choose the outcome and the pair

The Commander reads the [development plan](../development/development-plan.md), [PROGRESS](../../PROGRESS.md) and the Issue, then writes the [bounded brief](change-brief.md). Classify by uncertainty and consequence:

- **T0:** an unresolved outcome or authority decision; the Commander resolves it before dispatch.
- **T1:** mechanically checkable documentation, small deterministic corrections and narrowly specified edits.
- **T2:** a standard feature or refactor with a known seam and written acceptance criteria.
- **T3:** cross-module behavior, architecture, data/recovery, credentials, policy, source scope or authority boundaries.

The three subscription channels are **ChatGPT**, **Claude** and **OpenCode Go**. Record the actual channel separately from the client/harness and model maker. Two Go models are the same channel for review independence, even when one is DeepSeek and the other GLM.

| Class / route | Coding Worker | Reviewer |
| --- | --- | --- |
| T1 / Go | `opencode-go/deepseek-v4.1-flash` or `opencode-go/glm-5.3-flash`, `low` | ChatGPT `gpt-6.1-sol`, `medium`; or Claude `claude-sonnet-5-5`, `high` |
| T2 / ChatGPT | `gpt-6.1-sol`, `medium` | Claude `claude-opus-5-5`, `high` |
| T2 / Claude | `claude-sonnet-5-5`, `high` | ChatGPT `gpt-6.1-sol`, `high` |
| T3 / ChatGPT | `gpt-6.1-sol`, `high` or `xhigh` | Claude `claude-opus-5-5`, `xhigh` |
| T3 / Claude | `claude-opus-5-5`, `high` or `xhigh` | ChatGPT `gpt-6-astra`, `xhigh` |

These are approved project pairings satisfying the review capability floor; they are not a universal benchmark ranking. A Reviewer must be on a different subscription channel and an approved equal-or-higher pairing for the actual Worker binding. Raising effort alone never promotes a weaker model into another capability tier.

Use balanced routing: choose a task-fitting row, prefer an available subscription over an exhausted one, then prefer the eligible channel with fewer active tasks; break ties by rotating eligible pairs within the current wave. Go is useful for T1 work, not the default for every class. Select the Reviewer at the same time as the Worker.

Only the two Go IDs in this table are allowed for repository agents. Do not substitute an older DeepSeek Flash alias or another model available in the Go catalog. Pin full model IDs and explicit supported effort; a requested setting is not proof of the effective binding. Verify the available model, subscription route and effort at launch. If the client does not expose an effective setting, record it as unverified and resolve it before coding/review, rather than reporting it as verified.

The Commander retains the main conversation's actual binding; this rulebook does not silently change it. A complex decision can be delegated for investigation within the approved channels while the Commander retains decision and integration ownership.

Completion: the Issue has a bounded outcome, dependencies, permitted paths, non-goals, acceptance checks, and a valid Worker/Reviewer pair.

## 2. Establish the Orca wave

Resolve the Orca executable from the session's documented environment and load that installation's `orca-cli` and `orchestration` skill guides before using its commands. Use only documented commands for that version. Orca owns managed workspaces, task dispatch, messages, waits and handoff; GitHub owns Issues and PRs. The [Dispatch Register](dispatch-register.md) is a query over those records, not a new database.

The Commander creates one `codex/integration-<wave>` branch from the recorded current `dev` commit. A slice uses `codex/<issue>-<slug>` and an isolated Orca workspace based on the named wave commit. Dependent tasks start after their prerequisites land; independent tasks with disjoint ownership may proceed in parallel. Integration into the wave stays serial.

Record in the Issue/PR and Orca task record:

- Issue and brief revision, class, dependency links and acceptance criteria;
- wave/slice branches and exact baseline;
- role, subscription channel, client, full model ID, requested and verified effort;
- real Orca task/workspace identifiers and current writer;
- PR, reviewed head, tested head/base, test results and final merge commit.

Reuse these existing records; keep live attempt chronology out of PROGRESS. A model fallback, changed class or material scope change returns to the Commander for a newly recorded assignment and a valid pair. Routine reassignment among approved pairs needs no new Owner approval. Subscription exhaustion means reassign or wait; it never authorizes extra paid credits, another billing route or a weaker Reviewer.

**Environment prerequisite:** at the 2026-10-12 documentation bootstrap, `orca` was unavailable on the editing host. No Orca dispatch was validated. [#806](https://github.com/zhouy1017/ai7-harness/issues/806) owns runtime and CI adaptation. An unavailable executable is reported with its exact error; another orchestration mechanism is not reported as Orca.

#806 itself is the first infrastructure wave once a real Orca runtime is available. It establishes CI readiness rather than depending on its own completion. Use the existing exact-ref provider-free verification path to validate its candidate and enforce Reviewer/Commander release explicitly during that bootstrap; do not start a product implementation wave until the adaptation integrates. If the existing check path cannot validate the candidate, record the missing prerequisite instead of skipping it.

Completion: actual runtime/task/workspace identities and the baseline are known, or the Issue explicitly records the unmet prerequisite without starting implementation.

## 3. Worker builds and opens the PR

The Coding Worker implements only the brief, runs the applicable [verification](ci-test-boundaries.md), commits and pushes its own slice branch, and opens a PR **to the wave branch**. It may update its assigned Issue/PR with implementation and validation evidence. Branch protection, material handling and the brief's allowed paths still apply.

The PR describes the resulting behavior, linked Issue, exact tested head, checks and remaining limitations. It never claims that fixture success establishes real editorial quality.

The Worker reports the PR and hands over the branch, then stops writing. The Reviewer acknowledges ownership before changing it. A single slice has exactly one writer at a time; background Worker sessions must not keep editing after handoff.

Completion: the PR exists, its head and validation evidence are recorded, and the Reviewer is the sole writer.

## 4. Reviewer reviews, fixes, tests and merges the slice

The Reviewer starts from the Issue, accepted design and PR diff at the recorded head, with a fresh context rather than the Worker's conversation history. It checks both implementation intent and repository standards.

The Reviewer directly fixes findings inside the brief, commits/pushes those corrections to the slice branch and tests the resulting head. Its review report distinguishes the incoming reviewed head from the final corrected/tested head. It is responsible for final correctness, not limited to advisory comments. An expansion of product scope or unresolved design returns to the Commander for re-slicing.

For product changes, run the applicable Local Verification Ladder and the required supported Journeys through the existing background test guests. Documentation-only changes use links, directive consistency, scenario walkthroughs and `git diff --check`; they do not trigger model inference or an unrelated product build. [#806](https://github.com/zhouy1017/ai7-harness/issues/806) must define the existing Gate's wave-branch invocation before product waves use this new integration flow.

After the Commander assigns the next merge slot, the Reviewer checks that the wave base and PR head still match the validated candidate, revalidates any changed candidate and merges that slice PR into the wave branch. A failing check or outdated result does not count as acceptance. Record the merge commit and release branch ownership.

Completion: the exact validated candidate is merged into the assigned wave, with Reviewer identity, fixes, checks and commit recorded.

## 5. Commander integrates the wave into dev

The Commander checks cumulative behavior, dependency completion, outstanding findings and integration conflicts, then opens the wave-to-`dev` PR. It owns final integration readiness and acceptance of the cumulative diff, including integration-only corrections.

The final integration candidate passes the appropriate checks and existing provider-free dev Gate at its current head/base. Any cumulative or base-changing correction invalidates earlier candidate evidence and is revalidated. The Commander releases and merges this final PR, records the resulting dev commit, updates the plan/PROGRESS and closes implemented slices. A slice merged only into a wave is not yet integrated into dev.

The current nightly queue can merge green dev PRs and does not implement the new role checks. Until #806 enforces exact-candidate Commander release, keep final integration PRs Draft while unapproved. Do not claim this documentation changed the queue. An automation may execute an expressly released merge; green CI alone is never that authorization.

Promotion to `main`, release and manuscript publication remain separate decisions.

Completion: the final dev commit, cumulative verification, updated status and Issue closures agree.

## 6. Keep the three model uses separate

| Use | Rule |
| --- | --- |
| Repository coding/review agents | Normal live subscription inference under this rulebook; do not apply product test live-once rules to agent conversations |
| AI7 developer-live product tests | Necessary new questions may call the approved Provider autonomously; reuse prior evidence and fixtures for identical/similar development validation under ADR 0089 |
| Actual AI7 user business | New user-initiated tasks perform real model steps, even for repeated input; product resume/incremental reuse follows its own semantics |
| CI/Gate/ordinary automated regression | Provider-free; no product model credential or live model call |

The Go model allowlist here does not register GLM in AI7's product runtime. [#807](https://github.com/zhouy1017/ai7-harness/issues/807) migrates the product target to DeepSeek V4.1 Flash. No new daily, batch or call-count ceiling is added.

## 7. Rulebook checks and bootstrap

Walk through: a normal Worker PR and Reviewer correction; two Go models proposed as a pair (reject); an unavailable model/effort (reassign or wait); exhausted subscription (no paid fallback); changed PR head/wave base (invalidate acceptance); failed tests (do not merge); completed wave with an unreleased final PR (keep Draft).

The Owner-authorized documentation bootstrap [#805](https://github.com/zhouy1017/ai7-harness/issues/805) may be coauthored using the current editing tools and submitted as one documentation PR to dev while Orca is unavailable. Record those tools honestly; this exception neither validates Orca nor supplies a cross-provider Reviewer receipt. Subsequent product waves require #806's runtime/CI readiness.

Model/effort identifiers were checked on 2026-10-12 against the local Codex/OpenCode catalogs, [OpenAI's model guide](https://developers.openai.com/api/docs/guides/latest-model), [Claude Code model configuration](https://code.claude.com/docs/en/model-config), and [OpenCode Go](https://docs.opencode.ai/docs/go/). Recheck availability at launch; modify this one table when the Owner approves a different capability pairing.
