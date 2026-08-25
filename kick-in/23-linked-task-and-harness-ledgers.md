# Linked Task and Harness Ledgers

Status: **accepted in Question 22**

## Recommendation

Use **one logical causal graph, two physical ledgers, and one authority for each fact**:

1. the **Task Ledger** is AI7's authoritative business record; and
2. the **Harness Session Ledger** is the authoritative model-execution record.

Connect them with stable **Execution Bindings** and exact **Harness Execution Spans**. Do not copy the Harness transcript, tool-result bodies, chunks, or step timeline into AI7 records. Do not make Harness Sessions authoritative for editorial decisions, manuscript revisions, Policy Documents, Effects, or workflow state.

This is not a generic dual-write design. Each datum has one authoritative home; the other side keeps only an ID, digest, range, or rebuildable projection.

## Why the old model must change

At the audited original-AI7 pin, three execution notions overlap:

- semantic `runRecords`;
- generic `operationRecords`; and
- technical retry-group `operationRuns`.

`runtime/operation_journal.py:174-319` assigns the same semantic Run ID to an `operationRuns` attempt group, while `tests/backend-contract/canonical-lifecycle-contract.test.mjs:744-832` expects two Runs, two Operations, and two `operationRuns` for one canonical lifecycle path. Project Q&A also copies provider-attempt evidence into an Operation, then a Run, then the Q&A turn (`runtime/project_qa_operation.py:1409-1448` and `:3163-3178`). Those records preserve useful provenance, but their overlapping execution timelines should not be carried beside the Harness Session event log.

The accepted legacy semantics still matter:

- a **Run Record** captures the authorized semantic request, plan, evidence, decisions, and typed outcome;
- an Effect has stable identity, exact authority, an idempotency boundary, and a durable receipt;
- restart, retry, redo, drift, and ambiguous outcomes remain visibly distinct; and
- workflow and manuscript state must survive executor restart.

The migration therefore keeps those business meanings while retiring duplicate executor timelines.

## Two authoritative ledgers

| Ledger | Authoritative contents | Explicitly does not own |
| --- | --- | --- |
| **Task Ledger** | Task Intent; Plan and Run Authorization digests; Run Record; Task Outcome; workflow/profile state; editorial decisions; Policy/source/artifact/skill/provider pins; Effects and receipts; Domain Commands; continuation state; causal links | Model transcript, streamed chunks, raw request headers, tool-call timeline, Harness step/turn state, copied provider bodies |
| **Harness Session Ledger** | Model-visible user/assistant/tool-result history; request headers and effective model/tool context; turns, steps, chunks, tool calls/results; Session lifecycle; Harness goal/workflow/job observations; subagent Session lineage | Book or manuscript truth; workflow signoff; Proposal Decision; Effect Approval or Receipt; Public Release Permission; Learning Eligibility; durable AI7 business outcome |

The Task Ledger can store the canonical structured Task Intent. Its rendered model input is a real Harness `user/message`, correlated by stable IDs. These are different representations with different owners: the Task Intent defines what AI7 authorized; the Session message proves what the model actually saw.

## Proposed record model

### Task Intent

Keep the accepted Task Intent as the exact, structured request. It owns Book/deliverable, Manuscript Pin, selection, source scope, editorial-dimension snapshot, requested outcome, and user constraints. It does not own an execution transcript.

### Run Record

Keep and narrow the Run Record as the stable-identity, append-only or versioned semantic/provenance record for one authorized effort under an unchanged Task Intent and Plan Envelope. It may link multiple safe execution attempts or spans and one terminal Task Outcome, referencing rather than copying:

- the accepted Execution Plan and Plan Envelope digest;
- Run Authorization;
- Task Skill Activation and Capability Grants;
- Provider Resolution Plan and Policy Document versions;
- source, memory, manuscript, and artifact pins;
- relevant editorial decisions and Effects;
- one or more Harness Execution Spans; and
- the typed Task Outcome.

A Run Record is not a Harness Session, turn, step, job, goal, or transcript. A Run may span more than one Session or Span; a Session may contain more than one Run's activity.

### Retire Operation as an active authority

Retire the legacy **Operation Record**, **Operation Event**, and `operationRuns` collections from the new AI7 write model. Harness Session owns model/executor state, technical events, diagnostics, turns/steps, native cancellation mechanics, technical flush/checkpoint evidence, and attempt history; AI7 retains semantic pause, continuation, decision, and outcome policy.

Do not replace Operation with another universal AI7 execution aggregate. Business facts previously hidden inside an Operation move to their actual owners:

- workflow progress belongs to the Deliverable Workflow Instance;
- durable task meaning and outcome belong to the Run Record;
- exact decisions belong to their named decision records;
- mutation authority and outcome belong to Effect Intent, Effect Approval, and Effect Receipt;
- staged deterministic changes belong to Prepared Commands and domain audit records; and
- live status is a disposable projection from Harness events.

Legacy Operation records remain available only in the old source repository or an explicitly retained offline archive, clearly labeled non-authoritative; they are not imported into the new product. The old UI's Operations presentation remains discarded.

The previously accepted `Operation Checkpoint` term is revised by this decision:

- task continuation uses **Run Continuation Checkpoint**;
- deliverable continuation uses versioned Workflow Instance state;
- deterministic mutation uses Prepared Command/staging/Effect records; and
- technical execution checkpointing remains Harness-owned.

No bare `Operation`, `Operation Attempt`, `Operation Event`, or `Operation Checkpoint` enters the new canonical glossary.

### Harness Session and Harness Execution Span

A **Harness Session** is the Harness-native durable interaction context. Its event sequence is the canonical execution history.

A **Harness Execution Span** identifies the exact contiguous Session event range or explicit event-range set attributable to one AI7 dispatch, continuation, or retry. It is an execution range, not a Run, attempt identity, authorization, result, or receipt.

An **Execution Binding** connects the AI7 and Harness identities without transferring truth ownership. At minimum it contains:

```text
taskId
intentId
runId (when applicable)
sessionId
firstSessionSeq
lastSessionSeq
messageId
continuationKind and attempt ordinal
turn/step/callId references when applicable
childSessionId or workflowRunId when applicable
semantic-envelope digest
```

Do not infer causality from adjacency. Every cross-ledger association uses explicit stable identifiers.

### Effect identity

An AI7 Effect keeps its stable business identity across restart and retry. A Harness `{sessionId, callId}` pair identifies one execution **attempt** of that Effect; it must never become the canonical Effect ID.

The guarded tool/capability adapter carries the stable `effectId` and idempotency key into each attempt. A durable Harness `tool/call` proves only that an attempt was requested. Only an AI7 Effect Receipt, or an explicitly classified reconciliation/manual-evidence record, proves the outcome.

## Harness model-execution truth

At the pinned Harness revision, the canonical model-visible projection is the ordered sequence of:

- `user/message`;
- `assistant/message`; and
- `tool/result`.

`assistant/chunk` supports streaming and replay fidelity but is not independently projected back into model history. `tool/call`, turn/step boundaries, request headers, and context records are structural execution evidence. The request header records the effective provider/model, rendered system prompt, adapter defaults, and assembled tool schemas; this proves what the executor used, not whether AI7 business policy or editorial truth was satisfied.

Relevant exact-pin Harness evidence:

- [`packages/core/session/src/types.ts`](https://github.com/zhouy1017/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/src/types.ts)
- [`packages/core/session/src/surface.ts`](https://github.com/zhouy1017/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/src/surface.ts)
- [`packages/core/session/src/request-header.ts`](https://github.com/zhouy1017/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/src/request-header.ts)
- [`docs/subsystems/session.md`](https://github.com/zhouy1017/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/session.md)

Harness Goals, Workflows, Jobs, and subagents remain useful execution mechanisms but subordinate to the Task Ledger:

- a Goal is same-Session continuation policy, not AI7 Task state;
- Harness workflow events are observations, not a restartable editorial-workflow journal;
- local Jobs are process-local and cannot be durable Run records; and
- subagents use linked child Sessions, never copied/flattened AI7 transcripts.

## Reliable command bridge

There is no atomic transaction across the Task Ledger and Harness Session persistence. Use an AI7-owned at-least-once **Command Outbox** with explicit deduplication:

1. Validate and freeze a **Prepared Command** against exact targets, versions, authority, policy, and idempotency state.
2. Commit the Domain Command and its outbox item in the same Task Ledger transaction.
3. Dispatch a stable message ID and AI7 correlation source to Harness.
4. Flush the Harness Session.
5. Record the Execution Binding and mark the outbox item delivered.
6. After a crash, scan durable Session and inbox history for the stable message ID before redispatch.

The reverse direction uses a rebuildable **Event Projection**. A projector consumes Session events by sequence, stores a **Durable Session Watermark**, and writes only typed business projections or references. It never copies the transcript and never triggers a new agent turn merely because it observed output. Only an explicit AI7 state transition may enqueue another command; this prevents a Harness continuation loop and an AI7 coordinator from competing.

## Commands and continuation semantics

Use **Domain Command** for a request to change AI7 business state. `Prepare` is non-mutating and produces an exact Prepared Command. `Commit` revalidates and performs the applicable AI7 mutation/Effect under its domain contract. A Harness tool result is not the business receipt.

| Action | Identity rule | Harness consequence |
| --- | --- | --- |
| **Resume / 续行** | Explicit user continuation of the same Run under unchanged semantics from authoritative Task Ledger/workflow/Effect state | After lightweight revalidation, creates a new Session or Harness Execution Span; never auto-dispatches merely because restart reconciliation is safe and never claims mid-tool continuation |
| **Retry / 重试** | Same semantic request and Run, but a new explicitly linked safe execution attempt | New Span and possibly new Session; forbidden automatically when an Effect outcome is unknown |
| **Redo / 重做** | Changed semantics or a user request for a fresh result creates a new Run and new authorization | New dispatch and Span; old Run remains immutable |
| **Replay / 重放** | Read and reconstruct existing records | Does not invoke the model, repeat an Effect, or create a new attempt |

Pause belongs to AI7 workflow/task policy because Harness has no general durable pause primitive. Cancellation records both the requested command and the observed terminal or uncertain outcome. Harness `dispose()` is runtime cleanup, not business cancellation or Session deletion.

## Continuation and restart contract

A Session flush is a persistence barrier, not a business checkpoint. A Run Continuation Checkpoint should contain only the durable semantic state AI7 needs to decide a safe next dispatch:

```text
Task Ledger event watermark
Harness Session ID and durable sequence watermark
Run and Workflow Instance state
outstanding decision/input state
Effect reconciliation states
policy and plan digests
manuscript/artifact pins
outbox/projector watermarks
next safe business transition
```

On restart, AI7 acquires the Session lease, loads and repairs the Session, and reconciles outbox items and unknown Effects. A safely reconciled interrupted Run settles as `任务已中断 · 可续行`; its existing Run Authorization remains, but no new Harness Execution Span starts until the user explicitly invokes Resume and lightweight revalidation succeeds. Material drift routes to Plan Revision and Redo, while an ambiguous Effect remains unresolved. The separately authorized deferred-connectivity path may auto-dispatch after unchanged Reconnect Preflight because that future start was already explicit. AI7 never pretends to continue inside a partially completed model or tool step.

A newly effective Series Retrieval Exclusion is material source-authority drift, not an ordinary interruption. AI7 preserves the original Plan Envelope, Run Authorization, Execution Binding, already fetched evidence, and Session history but refuses every later affected read. The Run requires Plan Revision plus renewed Run Authorization or cancellation; superseding the exclusion never restores the old binding or auto-resumes work, and excluded historical context cannot silently enter a new provider payload.

## Persistence and migration consequences

The pinned Harness Session format is pre-release version `0`, rejects unsupported versions and unknown non-ignorable events, and has no built-in migration or public retention/deletion contract. Therefore:

- pin the first AI7 Harness revision and Session schema;
- version and migrate the Task Ledger independently;
- treat Event Projections as disposable and rebuildable;
- validate Session export/import before every Harness upgrade;
- coordinate transcript retention separately from business-record retention while preserving live references; and
- do not import legacy AI7 business records or fabricate historical Harness transcripts; the separately accepted allowlist permits only protected credential transfer, reviewed mock-provider evidence, and selected test sample Books.

## Original-AI7 keep / modify / drop decision

| Legacy concept | Accepted disposition | New treatment |
| --- | --- | --- |
| Task Intent | **Keep** | Exact structured request in Task Ledger; rendered model input linked to Harness message |
| Run Record | **Keep and narrow** | Stable-identity, append-only or versioned semantic/provenance record with references, never a copied transcript |
| Generic Operation Record | **Drop as active authority and migration target** | Old-repository/offline history only; Harness Session/Span owns new technical execution |
| `operationRuns` retry group | **Drop** | Explicit Resume/Retry/Redo identity plus Harness Execution Spans |
| Operation Event technical timeline | **Drop as AI7 authority** | Harness Session events are canonical; AI7 keeps sparse bindings and rebuildable projections |
| Domain/business events | **Keep** | Typed Task Ledger transitions with one business owner |
| Operation Checkpoint | **Retire and split** | Run Continuation Checkpoint, Workflow Instance state, domain staging/Effect evidence, or Harness technical checkpoint |
| Lifecycle commands | **Generalize and preserve semantics** | Domain Command → Prepared Command → commit/Effect; no fake Task Skill Run for direct deterministic actions |
| Provider/Q&A attempt copies across records | **Drop** | One Harness execution record plus AI7 outcome/provenance bindings |
| Effect identity, authority, receipt, reconciliation | **Keep strongly** | AI7-owned stable records linked to, but never replaced by, Harness tool attempts/results |

The old UI, activity feeds, Operations presentation, Task Composer, and agent console remain discarded. A later UI/UX session may project both ledgers into a unified user experience without changing record ownership.

## Accepted bilingual terms

These terms are canonical after Question 22 acceptance.

| English canonical term | Preferred Simplified Chinese |
| --- | --- |
| Task Ledger | 任务账本 |
| Harness Session Ledger | Harness 会话账本 |
| Run Record | 任务运行记录 |
| Harness Session | Harness 会话 |
| Harness Session Event | Harness 会话事件 |
| Execution Binding | 执行绑定 |
| Harness Execution Span | Harness 执行区段 |
| Domain Command | 领域命令 |
| Prepared Command | 已准备命令 |
| Command Outbox | 命令发件箱 |
| Event Projection | 事件投影视图 |
| Durable Session Watermark | 持久会话水位线 |
| Run Continuation Checkpoint | 运行续行检查点 |
| Resume | 续行 |
| Retry | 重试 |
| Redo | 重做 |
| Replay | 重放 |

Avoid `AI7 Business Ledger` as a second synonym for Task Ledger. Avoid bare `Operation` for generic execution, and never call a Session, Span, attempt, Effect, tool result, or projection a Run Record.

## Question 22 decision

Accepted linked-ledger boundary:

- Task Ledger owns semantic/business truth;
- Harness Session Ledger owns model-execution truth;
- Operation Record, Operation Event, and `operationRuns` are retired from the active AI7 model;
- cross-ledger correlation uses Execution Bindings and Harness Execution Spans; and
- Resume, Retry, Redo, Replay, Effects, commands, and continuation state retain the distinct rules above.

Issue #8 Batch 3 later fixed the restart-dispatch consequence: a safely reconciled interrupted Run retains authorization but waits in Resume-ready Run State for explicit `续行`; only the separately authorized deferred-connectivity path may auto-dispatch after unchanged Reconnect Preflight. See [ADR 0011](../docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md) and [ADR 0034](../docs/adr/0034-require-explicit-resume-after-interruption.md).
