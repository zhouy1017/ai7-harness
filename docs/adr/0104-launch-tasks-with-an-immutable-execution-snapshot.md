---
status: accepted
---

# Launch tasks with an immutable execution snapshot

The Owner decided in [#1458](https://github.com/zhouy1017/ai7-harness/issues/1458#issuecomment-6825225507), D1=b and 准则 1, that task dispatch becomes one step: 「仅包裹旧状态机不算完成」. [#1455 revision 2](https://github.com/zhouy1017/ai7-harness/issues/1455) implements that decision in two end-to-end slices.

For ordinary starts of review, baseline/custom analysis, writing, initial evaluation, readers reports, evaluation rewrites and scoped AI edits, the editor chooses a model and thinking effort for this task. The shared `RuntimeExecutionConfig` remains the only execution-choice shape. Settings role defaults remain unchanged. The launch owner resolves the choice once and pins the manuscript current at launch. Selected blocks and locks retain their existing identity/drift checks. Every category, unit, report and mark of the run uses its frozen binding.

Schema 115 adds the instance-local `task_launch_snapshots` table without rebuilding any existing table. One transaction records the command identity, resolved execution choice, credential reference (never a credential value), manuscript pins and run handle, together with the task inputs, necessary execution plan components and runnable records. For launched runs, the authorization relation is the run's authority record written at launch; its name is historical until the R5 storage round. There is no separately committed prepared or awaiting-approval state and no prepare-then-authorize function sequence. Reconfirm, plan-revision and digest-approval ceremony is absent from this path.

Repeating a client command returns its original run, including after a settings change. Reusing that command for different inputs is refused. Distinct commands resolve independently. Typing before starting pins the new manuscript; results still cannot overwrite subsequent edits. An estimate is optional information and never changes what the start action launches.

Launch snapshots stay on the instance. Database package copies empty this relation while retaining its schema; Book merge treats it as transient and neither imports nor exports its rows. Replacement installs the replacement database's empty relation; it does not replay old commands. Existing manuscript history, results and authority records keep their existing export and replacement semantics. Remembered model choices belong to the existing instance-preferences owner alongside favourite models and never to Book data.

This supersedes only the pre-start plan/approval requirements of [ADR 0009](0009-use-authority-bearing-plan-envelopes.md), the prepare-and-approve implementation prescribed for these starts by [ADR 0096 §4](0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md), and [ADR 0103 §4](0103-send-role-reasoning-effort-through-protocol-families.md)'s preparation-time binding for these task kinds. The corresponding ordinary-start ceremony in [editor surfaces](../ui-ux-v2/editor-surfaces.md) and [requirements](../ui-ux-v2/requirements.md) yields to this decision. Their other authority, drift, proposal, effect, export and publication boundaries remain applicable. Legacy prepared work, quick entries, captured/composite procedure workflows, reconnect, resume and explicit idle/online queuing retain their existing owners until their own slice changes them.

PR A delivers review launch, scoped-edit execution snapshots, the shared chooser and schema. PR B delivers the remaining launch surfaces and remembered choices from PR A's integrated tip. Automated checks remain provider-free; this decision authorizes no live recording.
