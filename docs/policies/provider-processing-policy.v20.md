# Provider Processing Policy v20

This is the human projection of [the immutable v20 JSON](provider-processing-policy.v20.json), validated by [its schema](provider-processing-policy.v20.schema.json). It directly succeeds selected developer-live [v18](provider-processing-policy.v18.md) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0004](../adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md) and the [Learning Eligibility Policy](learning-eligibility-policy.md). Activation requires the exact [active-set v14](active-policy-set.v14.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v21](provider-processing-policy.v21.md).

## In plain words

Everything v18 allowed under `developer-live` it still allows, byte for byte: the same nine rules, the same Go route (`opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`), the same web and local tools, the same bounds. One thing is new, and only on the review rule: a house **review-preference block** — what the house's own editors have decided about review findings — may accompany a review request. It is eligibility only: the rule authorizes no Run, no Apply, no export and no publication, and it does not by itself make any request carry the block; the product slice that composes the block decides that within these terms.

## What is newly allowed

The review rule `developer-live-public-samplebook-reference-free-review` (every `editorial-review/*` kind and `factual-review`) names one more outbound data category, `house-review-preference-excerpt` (本社审阅偏好摘录), and states its declaration in a `houseReviewPreference` block: the block is derived only from judged review decisions of the same house (an editor's adoption, adoption with edit, or ignoring with a stated reason); it carries at most **12** lines and **200** graphemes in total per request; it names the record version it rests on; it never contains manuscript text and never an author's or an editor's name (`housePeopleNamesAndRolesStripped` stays `true`); and under `developer-live` it comes only from the admitted public-or-synthetic Books. No other rule names the category or the block.

## What stays exactly as v18

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Rules | The same nine rules — kinds, outbound categories (except the review rule's one addition), origins, ceilings, clarification, platform tools, local tools and 来源译文 term |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`; Role bindings unchanged |
| Capture | The protected local cache outside every checkout; raw bytes never in logs, diagnostics, uploads or Git |

For every term not named above, [the v18 projection](provider-processing-policy.v18.md) is the description.

## What stays refused

The default is deny. Everything v18 refused stays refused: 出版政策与风险, 书系一致性 in any live rule, any web tool outside the three research rules, any manuscript outside the authorized development samples, the unpublished data categories, hosted and CI execution, and every other task kind. The category also never admits learning material of any other kind, or from any other source, into a request.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set pin and reads every rule whole: the review rule must list the new category and state the declaration exactly, and any other rule that names either is a policy this launch cannot read, which denies processing. Provider eligibility is not Run Authorization, Apply, export, learning, publication or credential configuration.
