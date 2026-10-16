# Provider Processing Policy v22

This is the human projection of [the immutable v22 JSON](provider-processing-policy.v22.json), validated by [its schema](provider-processing-policy.v22.schema.json). It directly succeeds selected developer-live [v20](provider-processing-policy.v20.md) under [ADR 0090](../adr/0090-admit-procedure-recommendation-foreign-skill-import-and-custom-analysis-dimensions.md) §4 and §5, [ADR 0002](../adr/0002-book-series-cross-project-and-house-learning-scopes.md) and [ADR 0037](../adr/0037-enforce-versioned-series-retrieval-exclusions-immediately.md). Activation requires the exact [active-set v15](active-policy-set.v15.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v23](provider-processing-policy.v23.md).

## In plain words

Everything v20 allowed under `developer-live` it still allows, byte for byte: the same nine rules, the same Go route (`opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`), the same web and local tools, the same bounds. Two things are new. An editor's own **custom analysis dimension** — a question the editor wrote once in 知识库 › 工序与规则 and asks of every unit of the Book — may now run on the model, through a tenth rule. And the **review rule** may now carry **Series Knowledge** when a review Run is scoped to a Series. Both are eligibility only: the rules authorize no Run, no Apply, no export and no publication, and they do not by themselves make any request carry a template or a Series clause; the product slices that compose the payloads decide that within these terms.

## What is newly allowed

**Custom analysis (the tenth rule).** `developer-live-public-samplebook-custom-analysis` runs the analysis kind family `custom-analysis/<dimension-id>` on the Main Editorial Role, planned like the baseline: a newly user-initiated Task with a plan envelope and a Run Authorization, bound to the Coverage Manifest's units, one technical session per unit, the Run Budget Ceiling and the provider account-limit stop, and at most one model question per unit. It has no cross-unit reduction or synthesis, no web, no platform tool and no local retrieval (`localTools.targetedRetrieval.allowed: false`), and `source` names no Material Reference, Series Knowledge or editorial deliverable. The rule's `allowedTaskKinds` holds the single entry `custom-analysis/*`: a trailing `/*` admits every kind of that one family under the prefix, where the part after `custom-analysis/` is one non-empty segment; the entry is not a general pattern, no other rule uses one, and the launch resolver verifies the exact literal.

**The question template.** The rule names one more outbound data category, `editor-authored-question-template` (编辑自拟的单元提问模板), beside `public-or-synthetic`, and states its declaration in an `editorAuthoredQuestionTemplate` block: the template is an editor-authored per-unit question from a 工序与规则 document, at most **400** graphemes, attributed to the exact dimension version, never manuscript text and never an author's or an editor's name (`housePeopleNamesAndRolesStripped` stays `true`), and only a bounded data parameter of AI7's fixed contract framing — it never overrides that framing (`contractFramingOverrideAllowed: false`). No other rule names the category or the block.

**Series Knowledge on the review rule.** The review rule `developer-live-public-samplebook-reference-free-review` now states `source.seriesKnowledgeAllowed: true` and names the outbound data category `series-knowledge-excerpt` (书系知识摘录) with a `seriesKnowledgeExcerpt` declaration: Series Knowledge item revisions pinned by the Run's frozen Series scope, cut into at most **40** clauses of at most **300** graphemes each (the bounds 书系一致性 already keeps), only items of the pinned Series, honouring every Series Retrieval Exclusion frozen in the Run, naming the item revisions they rest on, and under `developer-live` only from admitted public-or-synthetic Books. No other rule states `seriesKnowledgeAllowed: true` or names the category.

**The Series consistency kind.** The review rule's `allowedTaskKinds` gains `editorial-review/series-consistency` as its last kind, so that category runs live only on this rule, only over the Run's frozen Series scope, with the `series-knowledge-excerpt` category and the frozen Series Retrieval Exclusions. Which kinds a launch really sends stays the consuming slice's decision.

## What stays exactly as v20

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Rules | The same nine rules — kinds (except the review rule's one added kind), outbound categories (except the review rule's one addition), origins, ceilings, clarification, platform tools, local tools, 来源译文 term and 本社审阅偏好 declaration — and, appended, the custom analysis rule |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`; Role bindings unchanged |
| Capture | The protected local cache outside every checkout; raw bytes never in logs, diagnostics, uploads or Git |

For every term not named above, [the v20 projection](provider-processing-policy.v20.md) is the description.

## What stays refused

The default is deny. Everything v20 refused stays refused, except 书系一致性 on the review rule as stated above: 出版政策与风险, Series Knowledge in any other live rule, any web tool outside the three research rules, any manuscript outside the authorized development samples, the unpublished data categories, hosted and CI execution, and every other task kind. A custom analysis dimension never sends tools, never mutates the Book and never widens the Run source scope.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set pin and reads every rule whole: the custom analysis rule must state its terms and its declaration exactly; the review rule must list the Series category and kind and state the flag and the declaration exactly; and any other rule that names either category, states `seriesKnowledgeAllowed: true` or lists a `/*` kind is a policy this launch cannot read, which denies processing. Provider eligibility is not Run Authorization, Apply, export, learning, publication or credential configuration.
