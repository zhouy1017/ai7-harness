# Dispatch Register

This is a live query over Orca task/workspace records and GitHub Issues/PRs. [Orca dispatch](orca-dispatch.md) owns role permissions, record fields, messages, handoff, waits and integration. The register creates no separate database, status file or receipt protocol.

## Sources

| Source | Owns |
| --- | --- |
| Issue body | Bounded outcome, brief revision, dependencies, allowed change and acceptance |
| Orca task/workspace and messages | Actual assignment, workspace, current writer, handoff and live state |
| Slice PR | Incoming review head, corrections, validation candidate and slice-to-wave merge |
| Wave PR | Cumulative candidate, Commander release and final dev integration |
| Git history | Exact branch/merge commits and superseded document content |

## Query procedure

1. Read the assigned Issue and the actual Orca task/workspace identifiers.
2. Correlate the recorded role, model pair, branch, baseline and current writer with the live task/workspace state.
3. Inspect the linked PR and checks for its current head/base. A task marked done, a green check or a local commit does not alone establish a released merge.
4. Distinguish slice completion in the wave from final integration on dev; record actionable drift or missing evidence in the existing Issue/task record.

Use only the installed Orca version's documented commands. If Orca is unavailable, report that prerequisite honestly and apply only an explicit bootstrap exception from the rulebook. A different tool's session is not an Orca task.

Retention and workspace cleanup follow Orca dispatch and the installed runtime's documented lifecycle. [Document lifecycle](document-lifecycle.md) handles repository prose separately.
