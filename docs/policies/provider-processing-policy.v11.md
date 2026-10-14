# Provider Processing Policy v11

This is the human projection of [the immutable v11 JSON](provider-processing-policy.v11.json), validated by [its schema](provider-processing-policy.v11.schema.json). It directly succeeds selected developer-live [v10](provider-processing-policy.v10.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and the Owner's 1.0.0 scope ([milestone scope](../development/milestone-1.0.0-scope.md)). Activation requires the exact [active-set v9](active-policy-set.v9.json) pin and trusted launch carrier; an internal active label grants no dispatch authority.

## What is newly allowed

Under `developer-live` only, on the developer host, with admitted Public SampleBooks only. All three new rules use the same route as v10: `opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`. Each is eligibility only: it authorizes no Run, no Apply, no export and no publication.

1. **Writing** (`writing`), rule `developer-live-public-samplebook-writing`, **Main Editorial Role**. The editor drafts a Production Document of a house type. It runs like baseline analysis: a newly user-initiated Task under direct Run Authorization, Coverage Manifest units, declared safe retries, one Run Report reflection turn, and the same non-unset Run ceiling (default 30,000 tokens per frozen unit). A writing Task sends the sample text of each unit, then one book-level synthesis turn that writes the document. Its other inputs are the Book's frozen metadata and synopsis, the house's 范例 of the type (referenced, never copied), and the editor's audience, channel and requirements. The categories are `public-or-synthetic`, `book-metadata-and-synopsis`, `house-exemplar-excerpt` and `frozen-material-reference-excerpt`. A Task that lists 资料库 materials is reference-bearing: it is admitted only through the consumption re-check (Issue #759, item 1), which refuses a withdrawn reference at the moment of use.
2. **Evaluation** (`evaluation`, `readers-report`, `evaluation-rewrite`), rule `developer-live-public-samplebook-evaluation`, **Main Editorial Role**. These are the three implemented contracts: AI7 初评 scores, 审稿意见, and 按我的评分重写评语. They run like writing: planned Runs with one synthesis turn, no web verification. The categories are `public-or-synthetic`, `editor-authored-evaluation-text` (the editor's saved scores, comments, conclusion and finalized Evaluation Record, and the house's Evaluation Profile), `house-exemplar-excerpt` and `frozen-material-reference-excerpt`, with the same reference-bearing condition as writing.
3. **润色这段 and 稿件冲突 › 基于当前稿件重新生成建议** (`editorial-polish`, `conflict-regenerate`), rule `developer-live-public-samplebook-selection-suggestions`, **Fast Interaction Role**. Each is one foreground action by the editor: one technical session and one bounded payload per attempt, carrying the frozen contract and the editor's own manuscript words, which are the selected passage, or for a conflict the conflict region and the competing draft. The only category is `editor-selected-manuscript-excerpt`. The output is a Suggestion only (`suggestionsOnly`): it changes no manuscript text, and Apply stays the editor's separate Effect. This rule does not itself require or exempt a Run ceiling; the account limit still ends the attempt.

New in the schema, each field stated once:

- `transmissions.plusOneCrossUnitSynthesisTurn` and `crossUnitSynthesisAllowed`: the kind's one book-level synthesis turn (全书综合 / 综合) is a named, bounded transmission. It is `true` for writing and evaluation and `false` for the suggestions rule. The launch projection `providerProcessing.admittedRules[].crossUnitSynthesisAllowed` carries it per rule (`false` for the v10 rules, which name their own reduction and reflection fields instead). It is separate from `crossUnitReductionAllowed`, which stays `false` on the new rules.
- `transmissions.plusAssuranceSampleAnchorUnits` and `assuranceSamplingAllowed` are `false` on writing and evaluation: none of these kinds declares an assurance sample.
- `source.materialReferencesAllowed` and `source.materialReferenceConsumptionRecheckRequired`: references are allowed on writing and evaluation only with the re-check.
- `source.editorSelectedPassageOrConflictRegionOnly`: the suggestions rule sends only an editor-selected passage or a conflict region of the editor's own manuscript.
- `output.suggestionsOnly` and `output.appliesManuscriptChange`: the suggestions rule yields proposals and never applies them.
- Four outbound categories join the vocabulary (Chinese labels in the JSON): `editor-authored-evaluation-text`, `house-exemplar-excerpt`, `book-metadata-and-synopsis` and `frozen-material-reference-excerpt`. They declare what the final Egress Gate must recognise; under `developer-live` every transmittable source is still derived from admitted Public SampleBooks.

## What stays exactly as v10

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| v10 rules | The baseline analysis, editorial dialogue and reference-free review rules are the exact v10 rules, unchanged in every field |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`, for every rule |
| Roles | Main Editorial Role and Fast Interaction Role bound to that route; Difficult Escalation Role and Frontier Model Role user-configurable and unbound by default, named by no rule |
| Budget | Planned Runs (analysis, review, writing, evaluation): existing non-unset Run ceiling, default 30,000 tokens per frozen unit, evaluated before every dispatch |
| Account limit | `quota-exhausted` ends the Run or attempt; no retry, second model, Provider or spending-source fallback |

## What stays refused

The default is deny. Still refused: every web tool and web-bearing category (事实核查, 学术道德与引用, 出版政策与风险), 书系一致性 (Series Knowledge), 跨交付物一致性 (deliverables), and every other task kind. Ordinary production is unchanged and still has no developer-live rule. Default Execution Rules, Background Analysis Enrollment, idle/scheduled/import-triggered/cross-Run dispatch, private manuscripts and the unpublished data categories remain refused.

House people names/roles, remarks and internal notes are stripped from every rule; author information and house name may be included. The enrollment helper alone reads the key file; the Credential Broker releases the secret only to the final adapter. Request/response captures stay outside every checkout and never enter logs, diagnostics, uploads or Git. Similar development evidence is reused under ADR 0089 and the existing protected Ledger/Result Cache; ordinary user business never inherits this cache or development credential.

Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission. A draft, a score, a report, a rewrite or a Suggestion changes no manuscript.
