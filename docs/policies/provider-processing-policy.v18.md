# Provider Processing Policy v18

This is the human projection of [the immutable v18 JSON](provider-processing-policy.v18.json), validated by [its schema](provider-processing-policy.v18.schema.json). It directly succeeds selected developer-live [v16](provider-processing-policy.v16.md) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0026](../adr/0026-manuscript-retrieval-returns-candidates.md), [ADR 0047](../adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) and [ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §5 and §7. Activation requires the exact [active-set v13](active-policy-set.v13.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v19](provider-processing-policy.v19.md).

## In plain words

Everything v16 allowed under `developer-live` it still allows, on the same Go route (`opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`), the same eight rules, the same web tools on the same three rules and the same bounds. Two things are new. While a model works on a unit, it may now **look things up in the Book's own authorized sources** through a tool AI7 itself runs on this computer — targeted retrieval. And **来源译文**, a Chinese translation of source text, becomes a named step: a ninth rule translates one 资料库 excerpt, and the research review rule may have a retained external source's passage translated. Both are eligibility only: the rule authorizes no Run, no Apply, no export and no publication, and it does not by itself make the tool run; the product slice that executes the tool decides that within these terms.

## What is newly allowed

Every rule that admits a model task kind carries a `localTools` block. Enrolled background analysis and material translation set `targetedRetrieval.allowed: false`; every other rule sets it to `true`. The block says:

1. **What the tool may read.** Only what the Run was authorized to read (`source: "authorized-pinned-sources-only"`): the Book's pinned Manuscript Revision, the 允许参考 items at their frozen index version, and the sources the Run retained. It cannot reach any other manuscript, any other Book's material or anything the Run was not authorized to see. Whether the rule admits Material Reference or editorial-deliverable excerpts at all stays the rule's own `source` terms.
2. **That it sends nothing.** The tool runs inside AI7's process (`scope: "no-egress"`): it makes no request to any host, takes no Egress Gate ticket and leaves the computer with nothing. What it returns enters the model's context under the outbound categories the rule already lists; the transmissions, role bindings and route of the rule are unchanged.
3. **The per-unit cap.** At most **5** retrieval calls per Run unit (`callsPerUnit: 5`), each returning at most **8** ranked candidates (`candidatesPerCall: 8`). A candidate is a pointer with its anchor, not a quotation: ranking is approximate and proves neither relevance to the editor's question nor coverage of the manuscript.
4. **Quotation needs an Exact Fetch.** A passage may be quoted or cited only after an Exact Fetch of that exact record against the pinned revision (`exactFetchRequiredBeforeCitation: true`). A citation without one is refused by the result validator.
5. **The breaker.** A unit that reaches **128** consecutive tool round trips is ended and disclosed as **检索未完成** (`breaker`). The breaker is a loop guard, not a budget: retrieval calls and the tokens their results add count into the Run Budget Ceiling, which remains the only budget.

6. **来源译文 of a 资料库 material.** The ninth rule, `developer-live-public-samplebook-material-translation` (kind `material-translation`), runs on the Fast Interaction Role with the same route, model and credential slot as the dialogue rule. It is one foreground editor action: one session and one bounded payload — a frozen excerpt of a 资料库 item, which under developer-live is an admitted public text (outbound category `public-or-synthetic`) — and the model returns a Chinese translation labelled as machine translation. It has no Run and so no Run ceiling, no web, no question and no retrieval; its output replaces nothing and applies nothing, and an account limit ends the attempt.
7. **来源译文 of a retained external source.** The research review rule also states `sourceTranslationAllowed: true`: a passage of an external source the Run retained may be translated into Chinese by the Run's own model, labelled as machine translation, attributed to the exact captured range, and never in place of the original. No other rule states the term.

Material translation admits no synthesis, cross-unit reduction, assurance sampling or Run Report reflection and names no output block.

## What does not use retrieval

**Enrolled background analysis** and the **来源译文 rule** carry the same block with `targetedRetrieval.allowed: false`: a background Run makes no model-initiated retrieval, and a bounded translation of one excerpt has nothing to search. The other terms are stated identically so the block reads the same in every rule; apart from the ninth rule and the review rule's translation term, every rule's other terms are byte-for-byte v16's.

The baseline analysis rule states `localTools.targetedRetrieval.allowed: true` to keep the rule family uniform. Covered baseline analysis does not exercise that allowance: the product registers no local tools for it, and it deterministically enumerates the pinned revision under ADR 0047's separate covered-analysis contract.

## What stays exactly as v16

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Rules | The same eight rules — kinds, outbound categories, origins, ceilings and one-question-per-unit clarification — and, appended, the 来源译文 rule |
| Web | Review, writing and evaluation keep their `platformTools` unchanged (five shipped search backends, citation-bound webfetch, 128-round-trip breaker ending 联网核查未完成); dialogue, baseline analysis, 润色, conflict regeneration and background analysis stay without web |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`; Role bindings unchanged |
| Capture | The protected local cache outside every checkout; raw bytes never in logs, diagnostics, uploads or Git |

## What stays refused

The default is deny. Still refused: **出版政策与风险**, **书系一致性** (Series Knowledge) in any live rule, any web tool outside the three research rules, any search backend the evaluation did not ship, a provider-side search tool, any manuscript outside the authorized development samples, the unpublished data categories, hosted and CI execution, and every other task kind. Retrieval also never stands in for covered analysis: a Task that claims whole-manuscript coverage still enumerates the whole pinned revision. House people names/roles, remarks and internal notes are stripped from every rule; author information and house name may be included.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set pin and reads every rule whole. Each projected rule (`providerProcessing.admittedRules`, now nine) also carries `localTools` — the verified retrieval terms above, read exactly (a missing, malformed or altered term makes the policy unreadable and denies processing) — and `sourceTranslationAllowed`, `true` for the research review rule alone. Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission.
