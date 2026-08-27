# Issue #45 manuscript recovery — 2026-08-28

| Field | Record |
| --- | --- |
| Lifecycle node | Issue #45 closed and PR #105 squash-merged into `dev@76e7ee36b281464d8d44938e57d36c52c4c0e10a`. |
| Archive scope | The single outgoing root checkpoint and cold-start handoff that still described PR #105 as pending merge. |
| Final status | Consumed historical evidence. |
| Reason | The merge completed; these routers no longer belong in the active reading path. |
| Current replacement | Root `PROGRESS.md` and `HANDOFF.md` provide concise current routing; stable authorities remain at their existing paths. |
| Retrieval condition | Read only when a task needs the exact pre-merge Issue #45 routing or verification of the completed lifecycle node; do not treat these files as current authority. |

## Preserved artifacts

| Original path at `76e7ee3` | Fixed blob | Archived path | Final status |
| --- | --- | --- | --- |
| `PROGRESS.md` | `aa70402e2541e02debae0fd70f16b8edbfeabb09` | `PROGRESS.md` | consumed |
| `HANDOFF.md` | `56781a1e4a56e0998e53365646c4c93de3824410` | `HANDOFF.md` | consumed |
