# A2 offline-authority mapping correction

Status: **authorized from exact candidate head `059dd658`; same-class T1 fallback pending; A3 and implementation remain blocked**

This is a repository-development wording/evidence correction, not architecture expansion, new evidence, an owner decision, or implementation authority.

## Exact assignment

- Candidate branch / worktree: `docs/4-v2-architecture-candidate` / `worktrees/1649`.
- Exact starting head: `059dd658beb5191cc06abdc9fb8264db4be16b82`.
- Sealed parent: `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`.
- Control merge-base: `c383afd2fdb5f08342cde277b7babced6c1207fc`.
- Role / class: Worker / T1, exact and mechanically verifiable. The candidate's review floor remains T3-par.
- Preferred T1 binding: Claude Code / `claude-haiku-4-5-20251001` / low.
- Actual same-class fallback: GPT-5.6 Luna / medium. Do not repeat a Claude attempt inside the current evidenced exhausted window: post-reset Opus session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` already returned exit 1 / API HTTP 429 before inference, cost `$0`, and no later reset or availability evidence exists.
- All prior Workers and both final Reviewers are stopped before transfer. Exactly one Worker owns the candidate worktree.

## Exact review result

Fresh T3-par review of `b507617...059dd658` returned:

- **Standards: PASS, zero findings.** All contract corrections, counts, links, tables, provenance shapes, and Git mechanics passed.
- **Spec: FAIL, one P2.** `A2-EVIDENCE-REGISTER.md` wrongly attributes an offline/non-agent-startup requirement and `CC-44` support to sealed A1 source `S-A2-08` and canonical `S-A2-09` / `AGENTS.md`. Exact search found no such requirement in those objects. The offline-startup requirement is supplied by owner-direction source `S-A2-04` only. `CC-44` correctly remains Unknown; the verdict and every count remain unchanged.

Both reports are read-only and bound to exact clean head `059dd658`. Both disclose `same-provider review — independence reduced for the corrected A2 content`.

## Authorized correction

Edit exactly three existing paths:

1. `docs/architecture-v2/A2-EVIDENCE-REGISTER.md`:
   - in `S-A2-08`, remove the offline-candidate-invariant claim and remove `CC-44` from its supported-row list;
   - in `S-A2-09`, remove the offline-constraint claim and remove `CC-44` from its supported-row list;
   - retain every other exact identity, claim, row mapping, evidence kind, verification fact, and warning.
2. `docs/architecture-v2/A2-CAPABILITY-CLOSURE.md`:
   - in matrix part 1 `CC-44`, remove `S-A2-09` and retain `S-A2-04` as the offline-startup requirement source;
   - in matrix part 2 `CC-44`, remove `S-A2-08` and `S-A2-09`; retain the exact already-admitted source(s) that document the executor surface/absence and owner requirement;
   - change no invariant text, behavior, maturity, disposition, adapter, exit test, row, or count.
3. `PROGRESS.md`:
   - record Standards PASS / Spec one-P2 failure at `059dd658`, this exact correction, requested/actual T1 binding and fallback reason, local validation, current next action, and one-sentence Resume Prompt;
   - do not claim the amended head has passed review. Its final SHA belongs in the Worker report because a commit cannot contain its own SHA.

Do not edit README, Decision Queue, Seam, Gap Register, A1 content, canonical records, or any other path. Do not add/remove a source or probe ID, change a supported claim other than the two exact offline attributions, fetch evidence, run a probe, inspect runtime source, answer an owner question, select a maintenance form, enter A3, inspect DeepSeek runtime, implement, push, open a PR, merge, publish, or take external action.

## Git and exit

Amend only the existing A2 commit; preserve sole parent `b507617`, exact two-commit control history, lowercase subject, and all three contributor trailers. Validate:

- exactly the same seven A2 paths remain in the sealed-parent-to-head range, while this correction's old-head-to-new-head diff contains exactly the three paths above;
- clean index/worktree, `git diff --check`, no post-amend work;
- 44 ordered unique rows in both parts, 43 load-bearing, unchanged `0 Proven / 15 Candidate / 2 Experimental / 26 Unknown / 1 Not applicable / 0 Gap claims / 0 Verified Gaps`;
- exact Unknown/Experimental register equality and unchanged `S-A2-01`–`11` / `P-A2-01`–`02` sets;
- `CC-44` is still Unknown and cites no `S-A2-08` or `S-A2-09` in either matrix part;
- `S-A2-08` and `S-A2-09` no longer claim offline/non-agent startup or map to `CC-44`;
- all evidence-register table rows retain seven cells, local links/anchors and all table shapes remain valid.

Report exact amended head and stop for a fresh exact-head Spec re-review plus Standards non-regression re-review.
