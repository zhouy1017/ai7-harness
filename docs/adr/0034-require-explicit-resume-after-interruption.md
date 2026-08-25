# Require explicit Resume after Run interruption

After restart or service recovery reconciles an interrupted Run to an unambiguous safe continuation point, AI7 preserves the existing Run Authorization but does not dispatch automatically. The Run appears as `任务已中断 · 可续行`; the user's explicit `续行` triggers lightweight revalidation and, if unchanged, opens a new Harness Execution Span from the current Run Continuation Checkpoint in the same Run. Material drift requires Plan Revision and a newly authorized Redo Run, while ambiguous Effect outcomes remain `结果待确认`. The separately authorized `授权并在联网后开始` path is the narrow exception because the user already consented to later automatic dispatch after unchanged Reconnect Preflight.

## Considered options

Automatic restart continuation would reduce one click but could resume provider transmission and spending after an interruption the editor reasonably believes stopped work. Always requiring a new Run would discard the value of exact continuation state and duplicate unchanged authorization. Treating deferred connectivity start the same as an unexpected interruption would contradict its explicit future-start consent.
