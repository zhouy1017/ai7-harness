# Provider Processing Policy v14

This is the human projection of [the immutable v14 JSON](provider-processing-policy.v14.json), validated by [its schema](provider-processing-policy.v14.schema.json). It directly succeeds selected developer-live [v12](provider-processing-policy.v12.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0048](../adr/0048-enroll-and-evaluate-background-manuscript-analysis.md), [ADR 0070](../adr/0070-run-developer-live-unattended-and-size-the-ceiling-per-unit.md) and the Owner's 1.0.0 scope ([milestone scope](../development/milestone-1.0.0-scope.md)). Activation requires the exact [active-set v11](active-policy-set.v11.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v15](provider-processing-policy.v15.md).

## What is newly allowed

Under `developer-live` only, on the developer host, with admitted Public SampleBooks only, on the same Go route as v12: `opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`. v14 keeps all seven v12 rules, adds an eighth, and gives every Run-based rule a model question. Each rule is eligibility only: it authorizes no Run, no Apply, no export and no publication.

1. **Enrolled background analysis may now transmit, inside a mandatory ceiling.** The new rule `enrolled-background-manuscript-analysis-processing` admits baseline manuscript analysis (`baseline-manuscript-analysis`, nothing else) as a Run that an active, matching Background Analysis Enrollment dispatches in idle or quiet time. No new user-initiated Task is needed, but every dispatch creates one exact Run, and the rule is the only one in the document that admits the background origin (`backgroundAllowed: true`, `scheduledAllowed: true`). v12 refused every background origin; the baseline analysis rule still does (`backgroundAnalysisEnrollmentAllowed: false`).
   - **The ceiling is mandatory.** The enrollment must state a tokens ceiling (`enrollmentCeilingRequired: true`); an unset ceiling is refused (`unsetRunBudgetCeilingAllowed: false`). The foreground rules keep their own Run ceiling terms.
   - **Series and all-Books enrollments split the ceiling equally** across the Books they schedule, any remainder going to the first Book in the scope's Book order (`ceilingSplitAcrossBooks: "equal-remainder-to-first"`).
   - **A foreground Task always keeps a slot.** Background Runs hold at most the governor's capacity minus one concurrent slots (`backgroundSlotShare: "capacity-minus-one"`).
   - **Limits.** Manuscript analysis only (`scopeLimits`): no change to the formal manuscript, no external effect, no general background learning and no background policy work. A provider setup, a manuscript import or an artifact enablement never creates an enrollment; a matching Default Execution Rule is not an origin here.
   - **Same binding.** The Main Editorial Role on the Go route above; the admitted inputs, redaction, protected cache and account-limit terms are the baseline rule's.
2. **The model may ask the editor one question per unit.** Every rule that admits a Run (baseline analysis, review, writing, the three evaluation contracts and the new background rule) now declares `clarification` and counts the answer turns in its transmission bound (`transmissions.plusClarificationAnswerTurns: true`). In plain words: while working on a unit the model may ask one question (`maxQuestionsPerUnit: 1`); that unit waits for the editor while the other units continue (`unitWaitsOthersContinue: true`); if the editor does not answer within 24 hours (`timeoutHours: 24`) the question counts as unanswered and the Run continues, with the Run Report disclosing it (`timeoutContinuesAs: "unanswered-with-run-report-disclosure"`). The editorial dialogue, 润色这段 and 稿件冲突 › 基于当前稿件重新生成建议 declare `modelQuestionAllowed: false`: a foreground answer is not interrupted by a model question.
3. **Review may start under its default execution rule.** The review rule now admits, besides a directly authorized Run, a newly user-initiated Task that uses 审阅 快速开始 under its matching active Default Execution Rule (`matchingActiveDefaultExecutionRuleAllowed: true`), as writing already did. This policy only makes the origin nameable; the quick-start controls belong to the product slice.

## What stays exactly as v12

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Unchanged rules | Editorial dialogue, 润色这段 and 稿件冲突 › 基于当前稿件重新生成建议 differ from v12 only by `clarification: { modelQuestionAllowed: false }`; baseline analysis, review, writing and evaluation differ only by the two clarification terms (and review by the default-rule origin) |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`, for every rule; Role bindings unchanged |
| Origin | A newly user-initiated Task authorized directly; writing and, since v14, review also admit a matching active Default Execution Rule. Background origin is admitted only by the new rule and only through an active matching enrollment |
| Budget | Planned foreground Runs: a non-unset Run ceiling, default 30,000 tokens per frozen unit, evaluated before every dispatch; background Runs: the enrollment's mandatory tokens ceiling; the Fast rules have no Run ceiling |
| Account limit | `quota-exhausted` ends the Run or attempt; no retry, second model, Provider or spending-source fallback |
| Capture | The protected local cache outside every checkout; raw bytes never in logs, diagnostics, uploads or Git |

## What stays refused

The default is deny. Still refused: every web tool and web-bearing category (事实核查, 学术道德与引用, 出版政策与风险 / publication risk), fact-check, **书系一致性** (Series Knowledge) in any live rule, a Default Execution Rule without a newly user-initiated Task, a Default Execution Rule for any kind other than writing and review, background transmission of any kind but baseline analysis, import-triggered or unenrolled cross-Run dispatch, private manuscripts, the unpublished data categories, and every other task kind. Series Knowledge is `false` in every v14 rule.

House people names/roles, remarks and internal notes are stripped from every rule; author information and house name may be included. The enrollment helper alone reads the key file; the Credential Broker releases the secret only to the final adapter. Similar development evidence is reused under ADR 0089 and the existing protected Ledger/Result Cache; ordinary user business never inherits this cache or development credential.

Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission. A review, a draft, a score, a report, a rewrite, a clarification answer or a Suggestion changes no manuscript, and a background Run's finding changes none either.
