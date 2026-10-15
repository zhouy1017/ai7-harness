# Editorial-value evidence, 2026-10

Status: named evidence for [#812](https://github.com/zhouy1017/ai7-harness/issues/812) (P1 editorial quality, wave 5 slice 5a), measured on 2026-10-15. It records what one developer-live pass per kind showed an editor would get from the working AI loop on exact `sample1`, and how to repeat the measurement provider-free. It is not a benchmark, a quality score or an acceptance of model quality; fixture success elsewhere still proves application behaviour only.

## Method

**Case set.** [`tests/editorial-cases/`](../../tests/editorial-cases/README.md) holds thirteen `ai7.editorial-case/1` cases: review 错别字与规范用语, 体例与格式 and 文学性与表达改进 on `sample1` and one synthetic manuscript each for 错别字 and 体例; two 润色这段 sentences; AI7 初评; 审稿意见 (给作者); a 宣传文章 writing draft; model clarification; 跨交付物一致性; and a review with a pinned 资料库 item. Each case names its input, the editorial concerns an editor would expect, anchored to paragraph numbers and short `sample1` fragments (or to generator defects), and false-positive checks: words that must not be flagged or changed. The Coding Worker wrote the expectations before the pass (commit `5955f39d`); they encode editorial plausibility, not ground truth, and the Reviewer checks them.

**Synthetic manuscripts.** `synthetic-manuscripts.mjs` generates two short public synthetic texts deterministically from authored prose and a declared injection table — seven injected defects and three correct-as-written traps each. Every analysis kind reads only exact `sample1`'s lineage (ADR 0044), so a synthetic case's Book is an exact `sample1` import whose first twelve blocks the runner overwrites through the editor's own journal edits (Commander decision, 2026-10-15). These cases run only on the provider-free deterministic route over an authored fixture: they measure the harness and the product path — finding, mark, Apply, reversal — never a model.

**Harness.** `node tools/editorial-evidence.mjs --replay fixtures` (`pnpm run evidence:replay`) runs every case in its own disposable product: the real `EditorialStore`, execution owners, marks and Apply authority. Recorded `sample1` captures replay through the developer-live owner whose transport is the product's deterministic adapter, so the v14 model-question contracts are asked exactly as live; authored fixtures run on the deterministic route. The process refuses every `fetch`. A review or 润色 case goes finding → mark → simulated editor → Apply → reversal; 初评, 审稿意见 and writing go result → delivery record (a finalized Evaluation Record, a 审稿意见 draft document, a writing draft delivered to 宣传部). The harness writes `metrics.json` and a Markdown table, and `pnpm test` compares every case with the reviewed `replay-baseline.json` in about ten seconds.

**Metrics.** A located finding is *useful* when it overlaps a concern's words in that paragraph and *precise* when it covers them; a false-positive check fires when a finding flags its protected words or proposes text in which they no longer stand; other findings are *unclassified* — an editor must judge them. An unmet concern is *unmeasured* when its unit has no answer, and *raised but excluded* when the model quoted its words in a finding the product could not place; otherwise it is a *miss*. The **simulated editor** adopts a proposal that yields an acceptable correction, edits one at the right place to the preferred correction, rejects a false positive and leaves the rest; the harness then checks each Apply put a correction in place and that reversing every Apply restores every block digest. Structural concerns (初评, 审稿意见, writing) read cited paragraphs, evaluation items, passage kinds, named sections, keywords and a length bound — a coarse proxy.

**Evidence source.** Every replay is `fixture`. With `--ledger <provider-cache-root>` on the developer host, each capture's original Provider Test Ledger item labels it `fresh` (a transmitted first capture, configuration or input delta) or `cache` (an exact replay); a capture made under another cache root is `not-in-ledger`.

## The measured pass

One developer-live fresh-inference pass per kind on exact `sample1`, Provider Processing v14 / active set v11, route `opencode-go`, model `deepseek-v4.1-flash`, the enrolled development credential through the service's own broker, driven by an external payload-silent driver at the provider-cache root. The transmission count before and after and every per-case figure are on #812: [before](https://github.com/zhouy1017/ai7-harness/issues/812#issuecomment-6196854241), [after and per-case metrics](https://github.com/zhouy1017/ai7-harness/issues/812#issuecomment-6197961802).

| Kind | Validation case | Transmitted | Outcome-unknown | Incurred input / output tokens |
| --- | --- | ---: | ---: | ---: |
| Review, three categories (one Run) | `editorial-evidence/sample1-review-three-categories` | 38 | 1 | 79,241 / 191,471 |
| 润色这段, two sentences | `editorial-evidence/sample1-polish-two-sentences` (declared `input:` delta) | 2 | 0 | 956 / 4,405 |
| AI7 初评 | `editorial-evidence/sample1-initial-evaluation` | 9 | 1 | 21,976 / 24,369 |
| 审稿意见 | `editorial-evidence/sample1-readers-report-author` | 9 | 1 | 80,414 / 34,195 |
| Writing draft | `editorial-evidence/sample1-writing-promotion-brief` | 9 | 1 | 17,940 / 18,851 |

The ledger grew from 179 to 251 lines (163 to 230 transmitted); every added line belongs to this pass. No retry was made. Two incidents are part of the record: the review driver ran in a foreground tool call that hit its time limit, which stopped the service through `--parent-pid` after six 错别字 units — the same Run was continued without a declared retry, so 错别字 unit 7 is an outcome-unknown gap and its two later attempts were refused without sending; and each Run Report reflection of 初评, 审稿意见 and writing ended outcome-unknown 0.4–1.0 s after the long synthesis response, the pattern [#851](https://github.com/zhouy1017/ai7-harness/issues/851) tracks.

The captures became five reviewed fixtures (`sample1-recorded-v41-editorial-{review,polish,evaluation-initial,readers-report,writing-draft}`), each entry emitted by `tools/generate-model-fixture.mjs` with exact `sample1` source proof and its original capture provenance. One review capture (a 文学性 sampling turn) is refused `FIXTURE_GEN/identity-unmapped` because its answer cites a block its request never carried; its replay therefore records that turn and the reflection keyed on it as unanswered.

## Results

| Case | Source | Concerns met | Useful (precise) | Located / listed | FP checks fired | Missed (raised but excluded; unmeasured) | Editor adopt / edit / reject / leave | Applies correct; reversal exact |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| review-typos-sample1 | fresh | 5/8 | 5 (5) | 19 / 29 | 0/4 | 2 (2; 1 unmeasured) | 3 / 2 / 0 / 14 | 5 of 5; yes |
| review-style-sample1 | fresh | 2/5 | 2 (2) | 8 / 10 | 1/3 | 3 (1) | 2 / 0 / 1 / 5 | 批注; yes |
| review-literary-sample1 | fresh | 1/5 | 1 (1) | 38 / 77 | 0/4 | 4 (1) | 1 / 0 / 0 / 37 | 1 of 1; yes |
| polish-sample1-attributive | fresh | 1/1 | 1 (1) | 3 / 3 | 0/2 | 0 | 1 / 0 / 0 / 2 | 1 of 1; yes |
| polish-sample1-usage | fresh | 1/1 | 1 (1) | 2 / 2 | 0/1 | 0 | 1 / 0 / 0 / 1 | 1 of 1; yes |
| initial-evaluation-sample1 | fresh | 5/5 | — | 8/8 units; five items scored, 82.5; 146 cited observations | 0/2 | 0 | Evaluation Record finalized | — |
| readers-report-sample1 | fresh | 4/4 | — | 7/8 units; five sections | 0/2 | 0 | 审稿意见 draft document made | — |
| writing-draft-sample1 | fresh | 3/4 | — | 8/8 units; 592 graphemes in six sections | 0/2 | 1 | delivered to 宣传部 | — |
| clarification-sample1 (#865) | fresh | 1/1 | — | normal 0 questions; ambiguous 8/8 units asked and answered | 0/1 | 0 | — | — |
| material-review-sample1 (#809) | fresh | 2/8 | 2 (2) | 11 / 21 | 0/4 | 6 (4) | 2 / 0 / 0 / 9 | 2 of 2; yes |
| cross-deliverable-sample1 (#813) | not-in-ledger | 0/1 | 0 | 1 / 2 (outside the selected paragraph) | 0/1 | 1 (1) | — | — |
| review-typos-synthetic-lighthouse | fixture (authored) | 6/7 | 6 (6) | 8 / 9 | 1/3 | 1 | 5 / 1 / 1 / 1 | 6 of 6; yes |
| review-style-synthetic-museum | fixture (authored) | 5/7 | 5 (4) | 7 / 7 | 1/3 | 2 | 5 / 0 / 1 / 1 | 批注; yes |

What an editor gets, read from these numbers:

- **Proofreading proposals are adoptable when they are placed.** Every located 错别字 concern the model met could be applied — three as proposed, two after an edit to the preferred correction — and every Apply put the correction in place and reversed exactly. The model also proposed fourteen located corrections the case did not expect; they await an editor's judgement and are not counted as errors.
- **Location, not recognition, is the largest loss.** 51 of the 116 review findings the model listed (44%) were excluded as `quote-not-found`, every one with a quotation that occurs verbatim in the manuscript; 50 sit exactly in the block the declared ordinal names when a unit's leading overlap block is not counted. Three correct, verbatim findings on expected concerns never reached the editor. The same pattern appears in the pre-v14 #809 and #813 captures. This is [#879](https://github.com/zhouy1017/ai7-harness/issues/879).
- **Literary review is noisy for this text.** 77 findings were listed for 文学性与表达改进, 38 located, of which one met an expected concern; most of the rest are plausible line edits an editor would weigh one by one. The case's two gendered-simile concerns were not raised.
- **润色这段 is precise on the selection.** Both selections drew a correct fix of the concern, and every other suggestion kept the protected names and idioms.
- **Evaluation, report and writing produce usable delivery records.** The 初评 cited the expected passages for every item and named the oracle-bone letter as the selling point; the 审稿意见 drafted all five sections with the editor's finalized conclusion; the writing draft followed the brief's suspense and secrecy clauses within the length bound but never named the book (see Limitations).
- **The model asks only when it should.** With a clear instruction it asked nothing; with the declared ambiguous focus every unit asked once and completed after the answer.

## Limitations

- One model on one route, one run per kind, one Public SampleBook; no variance, no comparison and no claim about other manuscripts or genres.
- Expected concerns and false-positive checks are the Coding Worker's editorial judgement on a published novel's opening chapters; unclassified findings may be valuable and are not scored.
- The editor is simulated by fixed rules; real adoption, editing time and trust are not measured. "Effort" counts decisions, not minutes.
- Structural concerns use cited paragraphs and keywords as a proxy for reading the result; they can miss a correct point phrased differently.
- The synthetic manuscripts run on authored fixtures only (developer-live transmits exact `sample1` only); their numbers describe the harness, not a model.
- The writing case's Book was imported under a case label rather than its real title, so the draft's missing 《蟠虺》 partly reflects the input, not only the model.
- 错别字 unit 7 has no answer (the tooling incident), so one concern is unmeasured; three Run Report reflections and one 文学性 sampling turn have no capture, so their replay records them unanswered.
- The #809 and #813 captures predate the v14 model-question wrapper; their replays answer by unit header and report `contractsAgree: false` because the current review Task freezes a different contract than the one captured.
- Live elapsed time includes the Go route's latency on 2026-10-15 and the review's sequential category order; replay times measure the harness only.

## Defects

| Issue | Priority | Defect | Disposition |
| --- | --- | --- | --- |
| [#879](https://github.com/zhouy1017/ai7-harness/issues/879) | P1 | Review findings numbered against a unit's own blocks are excluded as `quote-not-found` | Open; not fixed here |
| [#880](https://github.com/zhouy1017/ai7-harness/issues/880) | P2 | The model fixture loader refused v14 model-question synthesis captures | Fixed in this slice as the brief's named one-line exception (`src/service/provider/model-fixture.ts`), with the generator's case-family branch |
| [#851](https://github.com/zhouy1017/ai7-harness/issues/851) | (existing) | Transport failure right after a long model response | Three more occurrences (Run Report reflections of 初评, 审稿意见, writing); referenced, not re-opened |

Observed but not filed as product defects: the model returned a block identity where 审稿意见 unit 7 required an ordinal (correctly refused as contract-invalid, as #807 saw for baseline unit 1); a 体例 finding flagged the punctuation of the oracle-bone inscription.

## Repeating the measurement

- Provider-free, anywhere: `pnpm run evidence:replay`; the reviewed baseline is `tests/editorial-cases/replay-baseline.json` and `pnpm test` checks it.
- On the developer host, labelling sources: `node tools/editorial-evidence.mjs --replay fixtures --ledger <provider-cache-root>`.
- A new measured pass needs a new question under ADR 0089: new cases or a changed contract, a new validation case, and the Provider Test Ledger's refusals respected; then the generator converts the captures and the baseline is updated in a reviewed PR.
