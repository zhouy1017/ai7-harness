# Manuscript Revision and Recovery Boundary

Status: **accepted**

## Recommendation

Keep original AI7's manuscript-native history and recovery semantics as a core product asset, but place them behind narrow AI7-owned capabilities and do not inherit the legacy storage classes, JSON shape, Python module names, command surface, Word merge-frontier machinery, or old linear-version vocabulary.

The Harness Agent Behavior Layer may inspect pinned manuscript state and request proposals or decisions. It does not own the manuscript graph, write journal entries directly, choose conflict text, or treat a Harness Session as manuscript history.

## Pinned original-AI7 evidence

Audit pin: `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`.

| Concern | Current semantic guarantee | Evidence |
| --- | --- | --- |
| Structural identity | Editable text is an ordered structure of stable blocks such as titles, headings, paragraphs, quotations, and list items. Moves and text edits retain identity; inserts create identity; split/merge records lineage; retrieval chunks never own merge identity. | `docs/adr/0066-stable-manuscript-blocks-anchor-revisions-and-merges.md`; `runtime/manuscript_workspace.py:290-414,3322-3505`; `tests/backend-contract/manuscript-revision-contract.test.mjs:137-280` |
| Revisions | A manuscript revision is immutable and reconstructable over complete ordered blocks, parent revision(s), and origin. Merge revisions may have two parents; restore creates a new descendant rather than rewriting history. | ADR 0064; `runtime/manuscript_workspace.py:432-480,2077-2091`; manuscript-revision contract `:282-333` |
| Branch scope | A branch versions the complete editable manuscript only. Source assets, approvals, review gates, Runs, proof state, and lifecycle records remain Book-authoritative and reference the exact branch/revision they governed. | ADR 0065; `CONTEXT.md:289-311` |
| Continuous editing | Each branch has a base-bound, ordered, hash-chained durable edit journal. “Saved” means the edit is durable, not that every keystroke became an immutable revision; restart reconstructs dirty working state and labels it recovered. | ADR 0069; `runtime/manuscript_workspace.py:1341-1493,2450-2547`; `tests/backend-contract/manuscript-journal-contract.test.mjs:23-78` |
| Meaningful checkpoints | Explicit, task-input, idle/session, accepted-proposal, import, merge, restore, and protected-lifecycle boundaries may materialize complete working state as immutable revisions. Dirty graph operations first create a verified safety checkpoint; failure preserves edits and aborts the operation. | ADR 0069; `runtime/manuscript_workspace.py:1495-1791,2674-2925`; manuscript-journal contract `:80-149` |
| Proposal branches | Model-generated text changes begin from an exact clean revision on an isolated proposal branch with Run, skill/version, provider attempt, evidence, and approval provenance. The active branch is unchanged before acceptance. | ADR 0070; `runtime/manuscript_proposal.py:160-430`; `tests/backend-contract/manuscript-proposal-contract.test.mjs:144-259` |
| Conservative merge | Acceptance uses a shared-base three-way merge. Identical and stable-block-disjoint changes may merge automatically; different changes to one block, delete/edit, competing moves, split/merge, and interacting insertion structures require explicit editor resolution. | ADR 0067; `runtime/manuscript_merge.py:112-268,1847-2011,2321-2445`; manuscript-merge contract `:244-299,1472-1542,1699-1795` |
| No partial apply | Conflict preserves both active and proposal branches. A clean acceptance creates a verified two-parent revision; stale or forged pins stop before effects. | `runtime/manuscript_proposal.py:1356-1697`; manuscript-proposal contract `:277-363,617-815` |
| Recovery gate | High-risk graph changes require a checksum-verified, independently reconstructable local recovery snapshot before mutation. Failed, incomplete, last-known-good, user-pinned, and protected-milestone snapshots survive ordinary cleanup. | ADR 0068; `runtime/manuscript_recovery.py:249-438,1344-1450,3537-3601`; manuscript-recovery contract `:146-184,593-728,1577-1624` |
| Atomic publication and replay | Candidate state is staged and verified; the expected target and recovery evidence are rechecked under a short fence; revision, branch tip, audit, Effect, and receipt commit together. Exact retry returns the committed receipt rather than applying twice. | ADR 0083; `runtime/manuscript_publication.py:630-889`; manuscript-publication contract `:123-285` |
| Restart and drift | Resume requires the same semantic envelope and verified Run Continuation Checkpoint. Changed base, journal, proposal, target, recovery, staged bytes, or receipt binding fails closed rather than continuing against a near match. | ADR 0079; `CONTEXT.md:421-454`; manuscript-proposal/publication restart tests |

The reference-only older AI7 used a linear `manuscript_versions.parent_version_id` chain, version-specific chunks/content hashes, Word bookmark/text fallback, and reimport-as-new-version behavior. Its backup/restore system was a roadmap gap. Those older contracts are superseded by the current manuscript graph and should remain historical evidence only.

## Accepted semantic model

These concepts remain distinct even if one storage engine implements several of them:

1. **Source Version** — immutable Book-owned explicitly acquired evidence that may seed editable text; it remains part of textual-source lineage and is distinct from retrieval candidates and separately governed Task/evidence records.
2. **Manuscript Block** — stable structural identity across text edits, moves, branches, and revisions; split, merge, delete, and reimport ambiguity carry explicit lineage.
3. **Manuscript Revision** — an immutable, reconstructable checkpoint of one complete editable manuscript state and its parent revision(s).
4. **Manuscript Branch** — a named line of editable manuscript revisions and working state; it does not branch Book lifecycle authority.
5. **Edit Journal** — durable continuous changes since the branch's base revision; it protects recent work but is not itself an immutable revision graph.
6. **Manuscript Checkpoint** — the transition that validates complete journal-reconstructed state and commits it as a Manuscript Revision; the `Task Input / 任务输入` purpose is a label on this type, not another checkpoint or a Milestone Version.
7. **Proposal Branch** — an isolated Manuscript Branch for one lineage of proposed generated changes, based on one exact revision.
8. **Manuscript Conflict** — an explicit competing textual or structural decision that cannot be silently resolved by order, timestamp, last writer, or model fluency.
9. **Recovery Snapshot** — separately stored and verified pre-operation state sufficient to reconstruct the protected graph state if the live store or operation fails.
10. **Manuscript Pin** — the required `{book, branch, revision, digest}` identity bound to every dependent Run, approval, proposal, merge, proof, and lifecycle record.

A Run Continuation Checkpoint determines the next safe dispatch under unchanged task semantics and is not a Manuscript Checkpoint. A Source Index Chunk belongs to retrieval/evidence and is not a Manuscript Block. A Harness Session belongs to agent execution and is not a Manuscript Branch or Revision.

## Accepted behavior rules

1. Branches version editable manuscript text, never the complete Book record set or its approvals, lifecycle, source records, or production state.
2. Restoring old text creates a new descendant revision; accepted historical revisions and provenance are not rewritten.
3. Moving a block keeps identity. New text gets a new identity. Split, merge, delete, and ambiguous reimport must record lineage or stop for resolution.
4. A user-visible save acknowledgment requires a durable journal append. Merge and other protected operations consume verified Manuscript Revisions, never an uncheckpointed buffer.
5. Dirty working state receives a labeled safety checkpoint before branch switching, merge, restore, reimport reconciliation, bulk apply, or other graph-changing work. Whenever a Task would use journal-newer acknowledged manuscript state as target, range, source, or evidence, that state also receives a Manuscript Checkpoint with purpose `Task Input / 任务输入` before Plan Preview or Run Authorization. Every attached prior-revision pin and pending manuscript target/range/source/evidence reference must exact-resolve on the resulting revision and create a new task-bound pin without mutating its original identity or provenance; changed or ambiguous references block planning until explicit reselection or removal. The Task Intent, resolved ranges, sources, evidence and Run then bind the resulting exact revision. This purpose creates no Milestone Version or Signoff; checkpoint failure preserves the Task draft and edits but blocks authorization, and later edits never retarget the Run. Checkpoint failure for any protected transition aborts without discarding journaled edits.
6. Read-only agent work creates findings/artifacts without branches. Any model-generated manuscript mutation begins on a Proposal Branch; approval means permission to attempt integration, not permission to resolve conflicts silently.
7. The default versioned merge policy auto-merges only identical changes and non-interacting changes to different stable blocks. Different edits within the same block and ambiguous structural interactions become conflicts even if character ranges appear disjoint. AI7 may propose a combined resolution, but an editor decides it.
8. Apply is atomic: either a verified merge revision advances the target branch or neither branch changes. Retry is idempotent and target drift invalidates stale authority.
9. High-risk graph operations require a verified recovery snapshot stored independently from the live manuscript graph. The physical format may be full-copy, incremental, or content-addressed as long as independent reconstruction is proven.
10. Recovery after interruption is visible as recovered working state or a restored descendant revision; it must not be mislabeled as a clean prior checkpoint.

## Keep / modify / drop

| Legacy element | Recommendation | New-project treatment |
| --- | --- | --- |
| Stable structural block identity and explicit lineage | Keep | AI7 Manuscript History capability; never reuse retrieval chunks, text hashes, or Word bookmarks as canonical identity. |
| Immutable manuscript-native revision DAG and text-only branches | Keep | Complete editable text history with exact pins; lifecycle records remain outside branches. |
| Per-branch durable journal plus meaningful checkpoints | Keep | Separate continuous-save durability from readable immutable history. |
| Proposal branches for generated text | Keep | Narrow agent capability; no direct model write to active text. |
| Conservative three-way merge and no partial apply | Keep as default, make policy versioned | AI suggestions may assist conflict review but remain proposals. |
| Independent verified recovery before high-risk mutation | Keep | Persistence representation replaceable; invariant is reconstructability before mutation. |
| Source-Version/Manuscript-Revision/Run-Continuation-Checkpoint/Recovery-Snapshot distinction | Keep and sharpen | Separate types and vocabulary; the legacy Operation Checkpoint umbrella is retired. |
| General DOCX/reimport identity reconciliation | Modify/add | Preserve block lineage when provable; surface ambiguous mapping rather than silently reassigning identity. |
| Current Python classes, CLI, JSON `ProjectStore`, ID prefixes, exact hash/layout algorithms | Drop as architecture | Select implementation only after the new module boundary and storage requirements are accepted. |
| Legacy linear editable-version table, chunk/hash structural identity, direct overwrite/reimport-as-edit | Drop/archive | Historical/reference-only behavior. |
| Proof-v1 stores, current Word merge-frontier projection, binary-trie ancestry optimization, exact six-action UI labels | Relocate or drop | Do not import the persisted stores; reconstruct only still-useful behavioral scenarios under the new model, while UI presentation remains deferred. |

## Known gaps for later design

- ADR 0030 now settles the general reimport semantics: use three-way comparison only when prior Source Version lineage is verified, otherwise disclose a conservative two-way comparison. A host-neutral exact structural mapping algorithm remains an implementation decision; the current strongest reference implementation is Word-paragraph-specific.
- Initial block seeding is deterministic inside one import. Continuity across a newly imported Source Version is established only when exact lineage is verified; the concrete continuity proof and mapping algorithm remain implementation decisions.
- Recovery representation should be deep enough to prove reconstruction while avoiding an unnecessary full graph copy when a compact content-addressed form is safe.
- The exact module interface, persistence engine, concurrency primitive, retention defaults, and user presentation remain later design decisions.

## Decision resolution

Question 17 accepted the semantic model and keep/modify/drop boundary above, including the conservative default that different concurrent edits to the same stable block require explicit editor resolution. Issue #8 Batch 2 later resolved the general verified-versus-unconfirmed reimport comparison boundary without choosing a storage or mapping algorithm, and Batch 3 fixed the journal-newer `Task Input / 任务输入` materialization rule. None adopts legacy storage or UI implementation. See [ADR 0006](../docs/adr/0006-preserve-manuscript-native-history-and-recovery.md), [ADR 0030](../docs/adr/0030-compare-reimports-without-inventing-source-lineage.md), and [ADR 0032](../docs/adr/0032-materialize-task-input-before-exact-run-pinning.md).
