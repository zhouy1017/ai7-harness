---
status: accepted — development execution and product target amended by ADR 0089
---

# Carry editorial dialogue under developer-live and keep development separate from production

The Owner admits a real-model Interactive Editorial Dialogue on an exact editor-selected passage. This decision preserves the dialogue's product authority and persistence boundaries; [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) owns the new Go target, autonomous development testing and business-versus-test reuse.

## Dialogue contract

1. One foreground `ask`, `continue` or `regenerate` attempt starts from an exact selection and question. Selecting and asking is the authority; no Plan Envelope, Run Authorization or separate `开始任务` is needed. A schedule, Default Execution Rule or Background Analysis Enrollment cannot originate a dialogue attempt.
2. Each attempt uses one technical Session and one bounded payload: the frozen dialogue contract, selected words, question and, for continuation, complete fragments retained from the stopped answer. `继续回答` and `重新回答` are new attempts, not an automatic resend inside the old Session.
3. The final Payload/Egress Gate binds outbound category `editor-selected-manuscript-excerpt` to the admitted rule and exact Execution Binding. House-people identity, editor notes and internal notes remain stripped according to ADR 0079 §4.4. Dialogue changes no manuscript and grants no Apply, external Effect or publication authority.
4. A dialogue has no Run or Coverage Manifest, so a per-Run ceiling does not apply. The bounded payload and existing account-limit stopping remain; this ADR introduces no daily allowance, call-count quota or new per-call approval.
5. The Harness Session Ledger under the Agent Data Root persists the question, answer and fragments. AI7's dialogue relations hold identities rather than duplicate text; payloads never enter repository files, logs or hosted artifacts.

## Development validation and normal business

Development uses admitted Public SampleBooks, including allowed tester edits of `sample1`, through the protected credential and existing Ledger/Result Cache tooling. Necessary new tests may run autonomously within the Owner's authorized rules, existing product Run budget semantics and subscription limits. Exact response replay and similar validation-family fixture reuse follow [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md), with original capture provenance and no fresh-model claim.

Ordinary production processes the editor's own manuscript under its own policy. A user deliberately asking, continuing or generating again is a new business attempt and receives real model processing where its contract requires it; development-test deduplication and caches do not answer or refuse it. Product interruption, continuation and result reuse retain their explicit semantics.

## Runtime migration

The [policy index](../policies/README.md) owns current selected runtime policies and bindings. [ADR 0094 §1](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#1-one-model-service-interface-and-one-governed-runtime) expands the intended product set to unified selectable Zen/Go and official services; it does not change current runtime policy bytes. Dialogue keeps its exact ask/continue/regenerate authority, bounded persistence and final egress checks. Pure non-web dialogue remains independent of a combined web experiment.

CI and the Gate remain provider-free; the product's Main Editorial Role is distinct from repository agent model assignments in [Orca dispatch](../agents/orca-dispatch.md).
