---
status: accepted
---

# Default the Run Budget Ceiling to unset

AI7 records an exact Run Budget Ceiling state in every Plan Envelope but defaults it to `unset`. In that state AI7 applies no product-side per-Run monetary or usage stop; the Model Provider's account-side quota, spending controls, credit state, and billing terms remain the default spend boundary. Editors may opt into an explicit AI7 per-Run hard ceiling. Reaching that explicit ceiling terminates the current Run with its existing Task Outcome classified as `Run Budget Ceiling Reached / 任务运行预算已达上限` and preserves candidates, evidence, unresolved matters, actual usage, Effects, and receipts; raising or removing the ceiling requires a Plan Revision, renewed Run Authorization, and linked Redo Run. A Provider Account Limit denial is a distinct model-service blocker and never masquerades as the AI7 ceiling or silently reroutes spend. This decision refines the earlier “budget governor” wording in ADRs 0021 and 0024: AI7 owns usage observation and any explicit ceiling enforcement, not a mandatory default local cap or provider-account quota pool.

> Amended by [ADR 0095 §2](./0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#2-an-execution-governor-and-real-throughput): an explicit ceiling reserves capacity for every request in flight plus each proposed dispatch before admitting it; the unset default, terminal partial outcome, renewed authorization to raise the ceiling and separate account-limit blocker remain unchanged.

## Considered options

A product-defined default ceiling would impose an arbitrary local limit that may conflict with the editor's provider-side controls. Calling the default “unlimited” would falsely imply provider availability and cost freedom. Allowing in-place top-up and continuation after an explicit ceiling is reached would mutate the authorized cost boundary and blur a terminal Run with Resume or Retry.
