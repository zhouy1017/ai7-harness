# Document lifecycle and archiving

Documentation is active working state only while it helps the current development node converge. Archiving is triggered by lifecycle completion, never by elapsed time.

## Archive-triggering lifecycle nodes

Run one archive sweep when:

1. a design decision is accepted and integrated;
2. an Issue or pull request is merged, closed, or abandoned;
3. an implementation phase or release milestone completes;
4. a design, plan, or rule is formally superseded;
5. a successor task confirms it has consumed a handoff; or
6. a long-running task freezes behind a new unique resume entry.

Individual commands, minor edits, ordinary small sub-tasks, and calendar dates are not triggers. The date in an archive node name is an identifier, not a schedule.

## Four dispositions

### Keep current

Keep stable authority owners and active entry points at stable paths:

- root `AGENTS.md`, `HANDOFF.md`, `PROGRESS.md`, `CLAUDE.md`, and `LICENSE`;
- accepted and superseded root ADRs;
- canonical context definitions, `CONTEXT-MAP.md`, current Policy Documents, and the root glossary index;
- active agent runbooks;
- the current Issue/Change Brief and supported-journey definitions; and
- active implementation documentation that still owns current behavior.

Keep the root entry concise; move detail behind task-routed links rather than duplicating it.

### Archive

Archive consumed working material only after its live conclusion has been promoted to a stable authority owner, explicitly rejected, or explicitly superseded. Eligible material includes:

- prior `PROGRESS.md` checkpoints and replaced root handoff text;
- consumed session/freeze handoffs;
- candidate or superseded design packages;
- review packets, dispatch records, phase plans, issue-local analysis, and prototype notes; and
- historical migration or verification plans that must remain available as evidence but must not guide current work.

### Delete

Delete disposable scratch, raw diagnostics, generated logs, temporary screenshots, failed intermediate drafts, local caches, and prototype outputs with no durable evidence value. They do not become archival clutter. Follow repository destructive-action safeguards and never delete an unclear target.

After material deletion, record exactly what was removed and whether Git, trash, or another named source can recover it.

### Retain externally or in Git history only

Do not copy protected or unnecessary external material into the repository for archival convenience. Manuscripts, derivatives, credentials, private sample Books, provider payloads, and secrets remain prohibited. Git history may be the sufficient record for an ordinary superseded edit when no reader needs a named artifact.

## Archive layout

Use:

```text
docs/archive/<node-slug>-<yyyy-mm-dd>/
├── INDEX.md
└── <preserved files and directories>
```

The node slug names the completed outcome, not a generic “old” bucket. `docs/archive/README.md` lists nodes. Ordinary agents exclude the whole directory from default search and context assembly.

Each `INDEX.md` records:

| Field | Meaning |
| --- | --- |
| Lifecycle node | The accepted/integrated/closed/superseded/consumed/frozen event that triggered the sweep |
| Archive scope | The Issue, phase, branch, or handoff boundary inspected |
| Original path | Where each artifact lived while active |
| Final status | consumed, superseded, rejected, frozen-reference, or historical evidence |
| Reason | Why it no longer belongs in the active reading path |
| Current replacement | Stable authority or current router that now carries its live conclusion |
| Retrieval condition | The concrete reason a future task may read it |

Archive contents preserve historical meaning. Do not edit an archived document to make it current; add clarification to the node index and change the current authority owner instead.

## Sweep procedure

1. Name the lifecycle node and exact scope. Do not launch an unbounded whole-repository cleanup from an ordinary Issue.
2. Identify current entry points, authority owners, working documents, handoffs, scratch, and links inside that scope.
3. Confirm every conclusion worth keeping has a current owner, or mark the source explicitly rejected/superseded.
4. Classify each artifact as keep current, archive, delete, or external/Git-only.
5. If there is nothing to archive or delete, record `archive sweep: none` in the existing closure record and stop. Do not create an empty archive directory or index.
6. If material moves, place it in one node directory and write its index. Preserve original paths in the index.
7. Replace stable root entry points with concise current versions; update ordinary links so they do not route through archives.
8. Delete approved disposable material and report what was removed and recoverability.
9. Replace root `PROGRESS.md` with one current checkpoint and one safe Resume Prompt. When the outgoing checkpoint represents the completed, consumed, superseded, or frozen node, archive exactly that one named snapshot. Do not archive intermediate checkpoints from the same node; the Issue, PR, accepted decision, and Git history carry their detail.
10. Run lightweight documentation checks: local links outside archives, root wrappers/routers, archive-index completeness for moved files, and `git diff --check`. This is maintenance, not a new proof gate.

## Progress and handoff rules

`PROGRESS.md` is updated after every sub-task by replacing its current checkpoint rather than appending chronology. Individual commands and minor edits inside one sub-task do not create separate checkpoints. At a triggering lifecycle node, archive at most one outgoing node-level checkpoint under Sweep step 9, then write the new current state. Intermediate sub-task updates within that node are replaced without archival. This creates periodic node-driven snapshots without an append-only log or one archive per command.

`HANDOFF.md` is a current cold-start router, not a narrative transcript. A task-specific handoff is archived only after its successor confirms consumption or the task is frozen/closed. The successor records the new current Resume Prompt before the old handoff leaves the active path.

No parallel `MEMORY.md`, duplicate progress ledger, or archive-derived current-state summary is created.
