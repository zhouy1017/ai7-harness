# Provider Processing Policy v11

This is the human projection of [the immutable v11 JSON](provider-processing-policy.v11.json), validated by [its schema](provider-processing-policy.v11.schema.json). It directly succeeds selected developer-live [v10](provider-processing-policy.v10.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and the Owner's 1.0.0 scope ([milestone scope](../development/milestone-1.0.0-scope.md)). Activation requires the exact [active-set v9](active-policy-set.v9.json) pin and trusted launch carrier; an internal active label grants no dispatch authority.

## What is newly allowed

Under `developer-live` only, on the developer host, with admitted Public SampleBooks only. The seven rules retain v10's three and add four rules on the same route: `opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`. Each is eligibility only: it authorizes no Run, no Apply, no export and no publication.

1. **Writing** (`writing`), rule `developer-live-public-samplebook-writing`, **Main Editorial Role**. The editor drafts a Production Document of a house type. It runs as a newly user-initiated Task authorized directly (`standard-direct`) or by its matching active Default Execution Rule for writing quick start (`default-execution-rule`, S75/#421), with Coverage Manifest units, declared safe retries, one Run Report reflection turn, and the same non-unset Run ceiling (default 30,000 tokens per frozen unit). A writing Task sends the sample text of each unit, then one book-level synthesis turn that writes the document. Its other inputs are the Book's frozen metadata and synopsis, the house's 范例 of the type (referenced, never copied), and the editor's audience, channel and requirements. The categories are `public-or-synthetic`, `book-metadata-and-synopsis` (including the editor's audience, channel and requirements) and `house-exemplar-excerpt`. Material-bearing writing stays refused this wave.
2. **Evaluation** (`evaluation`, `readers-report`, `evaluation-rewrite`), rule `developer-live-public-samplebook-evaluation`, **Main Editorial Role**. These are the three implemented contracts: AI7 初评 scores, 审稿意见, and 按我的评分重写评语. They run like writing: planned Runs with one synthesis turn, no web verification. The categories are `public-or-synthetic`, `editor-authored-evaluation-text` (the editor's saved scores, comments, conclusion and finalized Evaluation Record, and the house's Evaluation Profile) and `house-exemplar-excerpt`. Material-bearing evaluation stays refused this wave.
3. **润色这段** (`editorial-polish`), rule `developer-live-public-samplebook-editorial-polish`, **Fast Interaction Role**. Its only category is `editor-selected-manuscript-excerpt`, carrying the frozen contract and the editor-selected passage.
4. **稿件冲突 › 基于当前稿件重新生成建议** (`conflict-regenerate`), rule `developer-live-public-samplebook-conflict-regenerate`, **Fast Interaction Role**. Its only category is `manuscript-conflict-region-excerpt`: the base, current and proposal texts of one conflict unit, all derived from the editor's own manuscript.

Each Fast rule allows one request per foreground invocation: one technical session and one bounded payload per attempt, no cross-unit synthesis or reduction, no reflection and no assurance sample. The Run budget ceiling is not applicable (`runBudgetCeilingApplies: false`), as for editorial dialogue; the account limit still ends the attempt. The output is a Suggestion only (`suggestionsOnly`): it changes no manuscript text, and Apply stays the editor's separate Effect.

Writing alone sets `authorityOrigin.matchingActiveDefaultExecutionRuleAllowed: true`; every other rule keeps it `false`. Writing still requires a newly user-initiated Task; this exception grants no background or scheduled origin.

New in the schema, each field stated once:

- `transmissions.plusOneCrossUnitSynthesisTurn` and `crossUnitSynthesisAllowed`: the kind's one book-level synthesis turn (全书综合 / 综合) is a named, bounded transmission. It is `true` for writing and evaluation and `false` for both Fast rules. The launch projection `providerProcessing.admittedRules[].crossUnitSynthesisAllowed` carries it per rule (`false` for the v10 rules, which name their own reduction and reflection fields instead). It is separate from `crossUnitReductionAllowed`, which stays `false` on the new rules.
- `transmissions.plusAssuranceSampleAnchorUnits` and `assuranceSamplingAllowed` are `false` on writing and evaluation: none of these kinds declares an assurance sample.
- `source.materialReferencesAllowed` is `false` on all four new rules. Reference-bearing writing, evaluation and review remain for wave 3's successor; the service keeps `TASK_MATERIAL_LIVE_UNAVAILABLE` / `WRITING_MATERIAL_LIVE_UNAVAILABLE`.
- `source.editorSelectedPassageOnly` and `source.singleManuscriptConflictRegionOnly`: each Fast rule sends only its own kind's manuscript excerpt.
- `output.suggestionsOnly` and `output.appliesManuscriptChange`: the suggestions rule yields proposals and never applies them.
- Four outbound categories join the vocabulary (Chinese labels in the JSON): `editor-authored-evaluation-text`, `house-exemplar-excerpt`, `book-metadata-and-synopsis` and `manuscript-conflict-region-excerpt`. They declare what the final Egress Gate must recognise; under `developer-live` every transmittable source is still derived from admitted Public SampleBooks.

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

The default is deny. Still refused: fact-check, every web tool and web-bearing category (事实核查, 学术道德与引用, 出版政策与风险), reference-bearing writing, evaluation and review, 书系一致性 (Series Knowledge), 跨交付物一致性 (cross-deliverable consistency), and every other task kind. Ordinary production is unchanged and still has no developer-live rule. Default Execution Rules outside writing quick start, Background Analysis Enrollment, idle/scheduled/import-triggered/cross-Run dispatch, private manuscripts and the unpublished data categories remain refused.

House people names/roles, remarks and internal notes are stripped from every rule; author information and house name may be included. The enrollment helper alone reads the key file; the Credential Broker releases the secret only to the final adapter. Request/response captures stay outside every checkout and never enter logs, diagnostics, uploads or Git. Similar development evidence is reused under ADR 0089 and the existing protected Ledger/Result Cache; ordinary user business never inherits this cache or development credential.

Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission. A draft, a score, a report, a rewrite or a Suggestion changes no manuscript.
