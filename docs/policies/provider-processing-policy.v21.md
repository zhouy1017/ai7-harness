# Provider Processing Policy v21

This is the human projection of [the immutable v21 JSON](provider-processing-policy.v21.json), validated by [its schema](provider-processing-policy.v21.schema.json). It directly succeeds the `ordinary-production` document [v19](provider-processing-policy.v19.md) and is written in the same schema family as developer-live [v20](provider-processing-policy.v20.md). It is selected by [active-set v14](active-policy-set.v14.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0004](../adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md) and the [Learning Eligibility Policy](learning-eligibility-policy.md); an internal active label grants no dispatch authority.

## In plain words

Everything v19 let the editor do with their own manuscripts, on their own computer, with their own model-service account, v21 still lets them do, byte for byte: the same nine rules, the same two model routes, the same redaction, ceilings, account-limit stop, web tools and local tools. One thing is new, and only on the review rule: the house's **review-preference block** — what the editor's own house has decided about review findings — may accompany a review request. It is eligibility only: the rule authorizes no Run, Apply, export or publication, and it does not by itself make any request carry the block; the product slice that composes the block decides that within these terms.

## What is newly allowed

The review rule `ordinary-production-review` (every `editorial-review/*` kind and `factual-review`) names one more outbound data category, `house-review-preference-excerpt` (本社审阅偏好摘录), and states its declaration in a `houseReviewPreference` block: the block is derived only from judged review decisions of the same house (an editor's adoption, adoption with edit, or ignoring with a stated reason); it carries at most **12** lines and **200** graphemes in total per request; it names the record version it rests on; it never contains manuscript text and never an author's or an editor's name (`housePeopleNamesAndRolesStripped` stays `true`); and under `ordinary-production` it comes only from ordinary-production sources. No other rule names the category or the block.

## What stays exactly as v19

The rules, role bindings, redaction, capture, ceilings, clarification, platform tools, local tools and 来源译文 term are v19's; for every term not named above, [the v19 projection](provider-processing-policy.v19.md) is the description.

## What stays refused

The default is deny. Everything v19 refused stays refused, and the category never admits learning material of any other kind, or from any other source, into a request.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set pin and reads every rule whole: the review rule must list the new category and state the declaration exactly, and any other rule that names either is a policy this launch cannot read, which denies processing. Provider eligibility is not Run Authorization, Apply, export, learning, publication or credential configuration; the editor's own model-service binding still decides the route.
