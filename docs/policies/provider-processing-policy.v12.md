# Provider Processing Policy v12

This is the human projection of [the immutable v12 JSON](provider-processing-policy.v12.json), validated by [its schema](provider-processing-policy.v12.schema.json). It directly succeeds selected developer-live [v11](provider-processing-policy.v11.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and the Owner's 1.0.0 scope ([milestone scope](../development/milestone-1.0.0-scope.md)). Activation requires the exact [active-set v10](active-policy-set.v10.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v13](provider-processing-policy.v13.md).

## What is newly allowed

Under `developer-live` only, on the developer host, with admitted Public SampleBooks only, on the same Go route as v11: `opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`. v12 keeps all seven v11 rules and widens three of them. Each rule is eligibility only: it authorizes no Run, no Apply, no export and no publication.

1. **Review now reads the house's materials and the Book's other deliverables.** The review rule (id `developer-live-public-samplebook-reference-free-review`, kept so rule ids stay stable across versions, although it is no longer reference-free) still runs 错别字与规范用语, 体例与格式 and 文学性与表达改进 as planned Runs on the Main Editorial Role. It now also admits **跨交付物一致性** (`editorial-review/cross-deliverable-consistency`): checking one deliverable of the Book against the others. Two new outbound data categories join its list: `frozen-material-reference-excerpt` (text of a 资料库 item consumed through a Material Reference pin) and `editorial-deliverable-excerpt` (the latest finalized revision text of an eligible Production Document of the same Book).
2. **Writing and evaluation may carry frozen material excerpts.** The writing rule (`writing`) and the evaluation rule (`evaluation`, `readers-report`, `evaluation-rewrite`) now name `frozen-material-reference-excerpt` beside their v11 categories, so a draft or an evaluation can be written with the editor's pinned 资料库 material in view.

What the new categories mean, in plain words:

- `frozen-material-reference-excerpt` is a piece of 资料库 text, taken from the exact version a Material Reference pinned. It is sent only after the consumption re-check of #759 item 1 confirms that the reference is still the one pinned and still usable. The re-check is the consuming service's duty; this document only makes the category nameable.
- `editorial-deliverable-excerpt` is the latest finalized text of a Production Document of the same Book, sent only for cross-deliverable consistency. No other rule names it.

The two new source terms follow: `source.materialReferencesAllowed` is now `true` on the review, writing and evaluation rules (the other four rules admit no Material Reference: their source blocks state `false` or do not name the term), and `source.editorialDeliverablesAllowed` is `true` on the review rule alone.

## What stays exactly as v11

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Unchanged rules | Baseline analysis, editorial dialogue, 润色这段 and 稿件冲突 › 基于当前稿件重新生成建议 are the exact v11 rules, unchanged in every field |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`, for every rule |
| Roles | Main Editorial Role and Fast Interaction Role bound to that route; Difficult Escalation Role and Frontier Model Role user-configurable and unbound by default, named by no rule |
| Origin | A newly user-initiated Task authorized directly; writing alone also admits its matching active Default Execution Rule for quick start. No background, scheduled, import-triggered or cross-Run origin |
| Budget | Planned Runs: a non-unset Run ceiling, default 30,000 tokens per frozen unit, evaluated before every dispatch; the Fast rules have no Run ceiling |
| Account limit | `quota-exhausted` ends the Run or attempt; no retry, second model, Provider or spending-source fallback |
| Capture | The protected local cache outside every checkout; raw bytes never in logs, diagnostics, uploads or Git |

## What stays refused

The default is deny. Still refused: every web tool and web-bearing category (事实核查, 学术道德与引用, 出版政策与风险 / publication risk), fact-check, **书系一致性** (Series Knowledge) in any live rule, Default Execution Rules outside writing quick start, Background Analysis Enrollment, idle/scheduled/import-triggered/cross-Run dispatch, private manuscripts, the unpublished data categories, and every other task kind. Material References and editorial deliverables never reach the dialogue, 润色 or conflict regeneration. Series Knowledge is `false` in every v12 rule.

House people names/roles, remarks and internal notes are stripped from every rule; author information and house name may be included. The enrollment helper alone reads the key file; the Credential Broker releases the secret only to the final adapter. Similar development evidence is reused under ADR 0089 and the existing protected Ledger/Result Cache; ordinary user business never inherits this cache or development credential.

Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission. A review, a draft, a score, a report, a rewrite or a Suggestion changes no manuscript.
