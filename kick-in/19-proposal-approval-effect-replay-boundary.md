# Proposal, Authority, Effect, and Replay Boundary

Status: **accepted**

## Recommendation

Keep original AI7's exact-target proposal, durable effect-authority, idempotent publication, receipt, ambiguity, and replay guarantees. Replace its overloaded “approval” vocabulary with named authorities and records, keep their meanings separate even when one user interaction creates more than one, and expose them to Harness through narrow capabilities rather than treating a tool call or Session event as product authority.

## Pinned original-AI7 evidence

Audit pin: `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`.

| Concern | Current evidence | Finding |
| --- | --- | --- |
| Generated manuscript changes | ADRs 0070 and 0092; `runtime/manuscript_proposal.py`; `tests/backend-contract/manuscript-proposal-contract.test.mjs` | Generated wording remains isolated on a Proposal Branch. Acceptance authorizes an integration attempt, not silent conflict resolution or proof of publication; failed/conflicted apply changes neither branch. |
| Coarse task-skill grant | `runtime/task_skill_orchestrator.py:1320-1484`; ADR 0081 | `approvalGrant.approvedRisks` intersects manifest, handler, user, source, provider, and risk authority, but is not a first-class actor/time/effect-bound durable approval record. Preserve the frozen-envelope grant idea, not this schema. |
| Exact Effect approval | `runtime/publication_lifecycle_commands.py:2560-2690,3625-3858,4168-4258`; ADR 0081; `tests/backend-contract/lifecycle-command-contract.test.mjs` | Prepare freezes target, expected revision, payload/source/destination/authority digests, Effect identity, and idempotency key. A durable request binds them; commit revalidates and atomically publishes record, audit, receipt, and terminal state. This is the strongest reusable approval model. |
| Effect identity and receipt | ADR 0083; `CONTEXT.md:417-435`; `tests/backend-contract/manuscript-publication-contract.test.mjs` | Identity/key stays stable across Resume and linked Retry under unchanged semantics; changed target/payload/semantics gets a new identity. Replay returns the verified receipt; attempt identity is never the idempotency key. |
| Ambiguous external outcome | ADR 0083; `tests/backend-contract/provider-ambiguous-outcome-contract.test.mjs`; `tests/backend-contract/word-effects-contract.test.mjs` | Uncertain dispatch does not prove failure. AI7 reconciles read-only when possible; otherwise it waits without automatic retry or fallback and requires evidence-bound manual resolution. |
| Restart, drift, rejection, cancellation | ADR 0079; proposal, lifecycle-command, and operation-continuation contract tests | Pending authority survives restart; material drift invalidates it; denial publishes no Effect; proposal rejection preserves provenance; cancellation is cooperative and does not roll back committed Effects. |
| Old approval endpoint | `docs/reference/current-ai7/plans/agent-layer.md`; conflicting reference overview status | The old `/agent/approve` step-ID continuation and agent console are reference-only and lack the current durable exact-effect contract. Archive them. |

The current source has conflicting presentation contracts: ADR 0070 specifies six always-visible proposal actions, while ADR 0092 and root instructions describe four inline actions. Preserve the underlying editorial outcomes, not either fixed menu or layout; proposal interaction design belongs to the future UI/UX session.

## Accepted authority vocabulary

Never expose or persist an unqualified **Approval**. Use the exact authority or decision name:

| Term | Meaning | Explicit non-meaning |
| --- | --- | --- |
| **Run Authorization** | The user's decision to start one exact provider, data, source-scope, Run Budget Ceiling state, and task preflight envelope. | Not manuscript acceptance or permission for an unplanned Effect. |
| **Execution Grant** | One-shot authority for the agent/Harness to execute one frozen Plan or guarded step within that Run envelope. | Not durable editorial acceptance, standing permission, or proof of an outcome. |
| **Proposal Decision** | The editor's content decision to accept, modify, selectively use, retain as an alternative branch, redo, or reject one exact generated proposal. | Not proof that accepted text was successfully integrated. |
| **Review Decision** | A professional editorial judgment such as accept, accept with conditions, revise, defer, or reject at a review gate. | Not an Effect Approval and not factual proof by itself. |
| **Effect Approval** | Durable authority to attempt one exact mutation, local export, destructive action, or other governed Effect Intent. | Not a blanket risk-class grant, external-send authority, or proof of commitment. |
| **Public Release Permission** | Authority to release identified Unpublished Editorial Material through an identified public channel. | Not implied by Run Authorization, Proposal Decision, or Effect Approval for an internal action. |
| **Effect Receipt** | Durable outcome evidence for one exact Effect Intent, binding its identity and key to the target/result or classified external reconciliation evidence. | Not an approval, success toast, tool result, proposal-storage receipt, or raw payload. |

One `Accept and apply` interaction may create both a Proposal Decision and an Effect Approval so the editor is not asked twice. The records remain separately identifiable: the content decision remains historical evidence, while target or payload drift invalidates application authority and requires a freshly reviewed Effect Approval against the new exact target.

## Accepted Effect lifecycle

```text
Result or requested action
  → Effect Intent (identity, exact semantic envelope, target, payload digest, policy)
  → Stage and validate when applicable
  → Required authority (Effect Approval or explicitly applicable Policy Document rule)
  → Revalidate target, scope, payload and authority
  → Publish/dispatch under the target's concurrency fence
  → Effect Receipt, or ambiguous-outcome reconciliation/wait
  → Run Continuation Checkpoint or owning Workflow state records the next safe dispatch
```

Rules:

1. Every authoritative or externally visible side effect declares its execution policy before dispatch: intrinsically replay-safe, idempotency-keyed, staged local publication, externally reconcilable, or non-repeatable. No classification means no automatic Resume or Retry claim.
2. An Effect Intent binds the semantic envelope, planned Run/workflow/command transition, source/provider plan when relevant, target/destination, expected revision/version, payload digest, authority requirements, and Policy Document versions. Material change creates a new Effect Intent and invalidates stale authority.
3. Stable Effect identity and idempotency key survive Resume and linked Retry for the same semantics. Attempt IDs are separate. Reusing a key with a different target or payload is a conflict.
4. Low-risk internal Effects may be policy-authorized when a later accepted Policy Document explicitly permits the exact type and scope. High-impact, destructive, external-publication, or otherwise review-required Effects need exact durable Effect Approval. Eligibility or Execution Grant never expands Effect authority.
5. Local authoritative output is staged and verified outside active state. Publication atomically advances the authoritative pointer/state, writes its domain audit, and writes the Effect Receipt, or publishes none of them.
6. A concrete local file export first freezes one Local Export Preparation after the native save/copy workflow resolves the exact final path and create/replace disposition. That record is distinct from the destination-independent Delivery Package, Effect Intent, Effect Approval, and receipt. AI7 records exact approval before commit; native cancellation attempts no file Effect; a changed path/disposition invalidates preparation and approval; one verified file yields one receipt; ambiguity stops automatic retry. Native rename/cancel/replace presentation is only an input seam: AI7 retains authority and history, no Harness Run receives roaming filesystem access, and no local receipt proves sending, handoff, delivery, or publication.
7. Atomicity is per Effect, not per whole Run, workflow, or command sequence. If a later independent Effect fails or is cancelled, earlier committed Effects remain valid and visible.
8. Manuscript publication also requires an expected Manuscript Pin and fenced single-writer authority. The concurrency implementation is replaceable; stale or superseded workers cannot commit.
9. Persisting a Proposal Branch is an internal Effect with its own receipt. That receipt proves only proposal persistence and can never stand in for the later manuscript-publication receipt.
10. Resume continues the same Run from authoritative state and, when needed, a verified Run Continuation Checkpoint; Retry creates a new Execution Binding/Span attempt under unchanged Run semantics; Redo creates a new Run when request, plan, scope, skill, provider plan, revision, target, or payload semantics change.
11. A committed receipt makes replay return the existing verified result rather than repeating the Effect. An attempted call, progress event, agent assertion, or ordinary tool result never proves commitment.
12. After a possibly successful external dispatch, read-only reconciliation runs when supported. If proof remains insufficient, the owning Run/workflow transition waits in an ambiguous-outcome state and neither retries nor advances fallback automatically.
13. Manual outcome handling is evidence-bound to the exact Run, Execution Binding, attempt, Effect, and target. A user-attested completion remains visibly classified as manual evidence rather than being presented as system verification; a retry is allowed only after evidence makes “not completed” safe enough under policy.
14. Denying an Effect Approval, rejecting a Proposal Decision, cancelling a Run or dispatch, and withholding Public Release Permission are different outcomes. Cancellation stops at a safe boundary and never promises rollback of committed Effects.
15. Receipts, checkpoints, approvals, and diagnostics retain safe identities, digests, times, actors, evidence classes, and status—not manuscript text, credentials, raw prompts/provider bodies, or executable command lines.

## Keep / modify / drop

| Legacy element | Recommendation | New-project treatment |
| --- | --- | --- |
| Isolated generated proposals and exact editorial decisions | Keep | Proposal Decision bound to Proposal Branch and Manuscript Pin; preserve semantic outcomes, redesign presentation. |
| Exact durable approval before governed Effect | Keep and elevate | Effect Intent plus Effect Approval; exact actor, target, payload, plan, policy, and drift binding. |
| Task-skill risk-set `approvalGrant` | Modify | Execution Grant/policy input only; never reuse as editorial acceptance or Effect Approval. |
| Stable Effect identity, idempotency, staging, fencing, receipts | Keep guarantees | Deep AI7 Effect capability with replaceable resource publication ports. |
| Per-Effect atomicity and honest partial Run/workflow outcomes | Keep | Show every committed/failed/waiting Effect rather than claiming whole-task rollback. |
| Ambiguous external outcome stop and reconciliation | Keep | No automatic retry/fallback; evidence-bound manual resolution. |
| Resume/Retry/Redo and cancellation safety | Keep with accepted Q22 mapping | Use Run Continuation Checkpoints plus exact Execution Bindings/Spans; no active Operation ledger. |
| One generic `Approval` type or label | Drop | Named Run Authorization, Execution Grant, Proposal Decision, Review Decision, Effect Approval, and Public Release Permission. |
| Old `/agent/approve`, step-ID continuation, agent console, Python/JSON layouts | Drop/archive | Reference evidence only. |
| Exact legacy four/six-action UI, Approval queue, Word/Electron widgets | Drop as architecture | UI/UX agent receives required states and outcomes, not layout inheritance. |
| Tool success, Session event, model statement, or attempted dispatch as completion proof | Drop/prohibit | Only exact Effect Receipt or classified reconciliation/manual evidence establishes outcome state. |

## Verification contracts to preserve

Applicable complete provider-free E2E journeys preserve at least: approval-required work stops before dispatch; stale or forged authority cannot mutate; one exact approval commits once; response loss replays or reconciles without duplicate dispatch; restart returns the same receipt; changed payload cannot reuse a key; ambiguous outcomes wait; manual decisions bind exact evidence; concurrent workers produce at most one commit; native local-export cancellation attempts no file Effect; and diagnostics/receipts contain no manuscript text or secrets. These checks remain inside the one logical E2E Functional Gate rather than becoming a separate Effect gate.

## Decision resolution

Question 18 accepted the named-authority model, the one-interaction/two-record rule for proposal acceptance and application, and the Effect lifecycle/replay guarantees above while dropping legacy schemas and UI machinery. Issue #8 Batch 5 later applied those guarantees to native-OS local-export collision resolution without moving preparation, approval, commit, receipt, or reconciliation authority out of AI7. See [ADR 0007](../docs/adr/0007-separate-decisions-authority-and-effect-proof.md) and [ADR 0039](../docs/adr/0039-delegate-local-export-collisions-to-native-os-workflows.md).
