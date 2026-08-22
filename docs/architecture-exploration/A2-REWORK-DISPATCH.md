# A2 exact-review rework dispatch

Status: **completed at `dcbd437`; fresh exact-head review required; A3 and implementation remain blocked**

This is a repository-development correction brief, not canonical product architecture, an owner decision, or implementation authority.

## Exact assignment

- Candidate branch / worktree: `docs/4-v2-architecture-candidate` / `worktrees/1649`.
- Exact starting head: `4cd825028c72d57e23a56f95685d59c75f027e6a`.
- Sealed parent that must remain unchanged: `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`.
- Role / class: Worker / T3; returned candidate still requires independent T3-par Standards and Spec review.
- Preferred matching Worker binding: Claude Code / `claude-opus-5` / high.
- Actual fallback binding: GPT-5.6 Sol / `xhigh`.
- Exact fallback reason: the real A2 evidence-sync resume returned HTTP 429 `You've hit your session limit · resets 2am (Asia/Shanghai)` and that reset has not been evidenced. The binding rule says not to spend repeated attempts inside a known exhausted window, so the same T3 class falls back without another Claude probe.
- All earlier candidate Workers and both failed-head Reviewers are stopped before this transfer. One Worker alone owns the candidate worktree during correction.

## Review verdict being corrected

The independent exact-head review of `b507617...4cd8250` failed. Standards reported four P2 findings and one P3 finding; Spec reported two P1, four P2, and one P3 findings, with one overlap between axes. The exact read-only reports remain in Commander session evidence. The load-bearing failures are:

1. the supposedly closed capability set omitted explicit rows for subagents, provider fallback, symlink/junction confinement, and offline startup despite the exact owner direction;
2. the seam let the executor Module begin a new attempt, although AI7 alone owns Retry/continuation and ambiguous external outcomes stop automatic retry/fallback;
3. `CC-37` used unverified owner-direction license wording as if it were sufficient Codex evidence;
4. DeepSeek lacked the required explicit Keep/Adapt/Reject/Spike disposition;
5. gap-register coverage, A1-era checkpoints, A2 admission state, and probe-status summaries contain stale or overbroad prose; and
6. the target commit subject violates the lowercase convention.

## Authorized architecture correction

Re-open the row set because review disproved its completeness. Before re-scoring, trace every exact required-evidence bullet in `4741dd1b:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md` and this branch's A2 dispatch to a row. Add these four distinct load-bearing rows:

- `CC-41` — Harness-owned subagent lifecycle and event projection without creating an AI7 Task/Run, second loop, or authority record;
- `CC-42` — provider fallback obeys only the frozen AI7 Approved Fallback Chain and stops on ambiguous provider/Effect outcome rather than choosing or retrying autonomously;
- `CC-43` — Agent Data Root and Run Source Scope confinement survives Windows junctions/reparse points and any future supported symlink surface;
- `CC-44` — offline desktop startup and non-agent editorial access require no provider, authentication, marketplace, network, or executor availability.

Score all four **Unknown** because no admitted runtime observation or exact-source proof closes them. Reclassify `CC-37` from Candidate to **Unknown** because `S-A2-11` explicitly says the exact-pin `LICENSE`/`NOTICE` was not retrieved. Do not retrieve a new source in this correction. Freeze the re-derived set before re-scoring and record why review legitimately reopened it.

Expected reconciled result, if no arithmetic error exists: **44 rows; 43 load-bearing; 0 Proven; 15 Candidate; 2 Experimental; 26 Unknown; 1 Not applicable; 0 Gap claims; 0 Verified Codex Capability Gaps.** Add exact next-evidence entries `UNK-A2-22` through `UNK-A2-26` for `CC-37` and `CC-41`–`CC-44`. Non-closure remains an evidence state, no Codex gap is inferred, and no costed secondary development follows.

Correct the `PrimaryAgentHarness` Interface and invariants:

- `openExecution` for the same Run/attempt is restart-safe and returns or preserves an opaque durable handle/binding early enough to reattach without transcript copying or authority promotion;
- after executor death, the Module may restart the sidecar and safely reattach the **same attempt**, or emit a terminal/ambiguous outcome for AI7 to decide;
- the Module never creates or changes an attempt; only an explicit AI7 continuation decision may call it with a new attempt reference;
- ambiguity about committed Effects stops automatic retry/fallback;
- executor subagents remain internal technical activity projected through the closed signal set and never become AI7 Runs or domain authorities;
- provider fallback, reparse-point confinement, and offline-startup behavior appear as explicit Interface invariants/exit evidence without claiming they are proven.

Give DeepSeek candidate C the explicit disposition **Keep — deferred candidate evidence only for this A2 evaluation**. “Keep” does not inspect or select its runtime, activate the conditional Development Reference Framework role, open the re-entry gate, or promise later admission. Runtime evaluation remains excluded until both exact re-entry conditions pass and the owner makes a new choice.

Correct every exact review wording finding:

- narrow gap-register coverage to Unknown, Experimental, Gap claim, and Verified Gap rows; Candidate exit tests remain in the matrix;
- label the `DECISION-QUEUE.md` A1 admission paragraph historical and past tense;
- replace the current candidate `PROGRESS.md` A1-era next actions and stale seam-audit denials with the current review/rework state;
- record that version/help probes ran under Commander authority, while runtime-behavior and closure probes did not;
- make any “all probe-status statements updated” checkpoint true; and
- use a fully lowercase conventional commit subject.

## Write and evidence boundary

The Worker may amend only the existing A2 commit and may edit only the same seven A2 paths:

1. `PROGRESS.md`;
2. `docs/architecture-v2/README.md`;
3. `docs/architecture-v2/DECISION-QUEUE.md`;
4. `docs/architecture-v2/A2-CAPABILITY-CLOSURE.md`;
5. `docs/architecture-v2/A2-CODEX-SEAM.md`;
6. `docs/architecture-v2/A2-EVIDENCE-REGISTER.md`;
7. `docs/architecture-v2/A2-GAP-REGISTER.md`.

No new evidence source, web retrieval, local probe, source inspection, dependency, prototype, DeepSeek runtime evidence, ADR, owner answer, maintenance-form selection, A3 work, implementation, issue decomposition, push, PR, merge, or publication is authorized. Preserve every correct A1 claim and all three contributor trailers.

## Exit

Validate exact parent and two-commit history; seven-path boundary; clean worktree/index; `git diff --check`; 44 unique matrix rows and the expected score/load-bearing totals; exactly 26 unique Unknown entries mapped to all Unknown rows; two Experimental entries; zero Gap claim/Verified Gap; all local Markdown links/anchors and table shapes; no stale current-state wording; no new source; lowercase commit subject; and no post-amend work. Report exact head and stop for fresh independent T3-par review.

The Worker completed the bounded correction and one Commander-requested residual wording continuation at exact head `dcbd4375e8f230e7620065a714b6ab5248d4241b`, then stopped. Commander revalidated the exact parent/two-commit/seven-path/clean-tree/diff-check boundary, 44 unique rows, score totals, exact equality between 26 matrix Unknowns and 26 register mappings, two Experimentals, zero gap classes, and the lowercase subject. This is a checkpoint, not review acceptance.
