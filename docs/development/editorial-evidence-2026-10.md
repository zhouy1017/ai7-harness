# Editorial-value evidence, 2026-10

Status: named evidence for [#812](https://github.com/zhouy1017/ai7-harness/issues/812) (P1 editorial quality, wave 5 slice 5a), measured on 2026-10-15. It records what one developer-live pass per kind showed an editor would get from the working AI loop on exact `sample1`, and how to repeat the measurement provider-free. It is not a benchmark, a quality score or an acceptance of model quality; fixture success elsewhere still proves application behaviour only.

## Method

**Case set.** [`tests/editorial-cases/`](../../tests/editorial-cases/README.md) holds thirteen `ai7.editorial-case/1` cases: review 错别字与规范用语, 体例与格式 and 文学性与表达改进 on `sample1` and one synthetic manuscript each for 错别字 and 体例; two 润色这段 sentences; AI7 初评; 审稿意见 (给作者); a 宣传文章 writing draft; model clarification; 跨交付物一致性; and a review with a pinned 资料库 item. Each case names its input, the editorial concerns an editor would expect, anchored to paragraph numbers and short `sample1` fragments (or to generator defects), and false-positive checks: words that must not be flagged or changed. The Coding Worker wrote the expectations before the pass (commit `5955f39d`); they encode editorial plausibility, not ground truth, and the Reviewer checks them.

**Synthetic manuscripts.** `synthetic-manuscripts.mjs` generates two short public synthetic texts deterministically from authored prose and a declared injection table: lighthouse has seven injected defects and three correct-as-written traps; museum has six defects and four traps after review. Every analysis kind reads only exact `sample1`'s lineage (ADR 0044), so a synthetic case's Book is an exact `sample1` import whose first twelve blocks the runner overwrites and whose later blocks it clears through the editor's own journal edits (Commander decision, 2026-10-15). These cases run only on the provider-free deterministic route over an authored fixture: they measure the harness and the product path — finding, mark, Apply, reversal — never a model.

**Harness.** `node tools/editorial-evidence.mjs --replay fixtures` (`pnpm run evidence:replay`) runs every case in its own disposable product: the real `EditorialStore`, execution owners, marks and Apply authority. Recorded `sample1` captures replay through the developer-live owner whose transport is the product's deterministic adapter, so the v14 model-question contracts are asked exactly as live; authored fixtures run on the deterministic route. The process refuses every `fetch`. A review or 润色 case goes finding → mark → simulated editor → Apply → reversal; 初评, 审稿意见 and writing go result → delivery record (a finalized Evaluation Record, a 审稿意见 draft document, a writing draft delivered to 宣传部). The harness writes `metrics.json` and a Markdown table, and `pnpm test` compares every case with the reviewed `replay-baseline.json` in about ten seconds.

**Metrics.** A located finding is *useful* when it overlaps a concern's words in that paragraph and satisfies any issue-specific keywords in its note or replacement; it is *precise* when it covers those words. These names describe anchor matching, not an independent semantic quality judgement. A false-positive check fires when a finding flags its protected words or changes them, including any untouched part of a partially covered span; other findings are *unclassified* — an editor must judge them. An unmet concern is *unmeasured* when its unit has no answer. Other unmet concerns are *misses*, with *raised but excluded* identifying the subset whose matching finding the product could not place. The **simulated editor** adopts a proposal that yields an acceptable correction, edits one at the right place to the preferred correction, rejects a false positive and leaves the rest; the harness then checks each Apply put a correction in place and that reversing every Apply restores every block digest. Structural concerns (初评, 审稿意见, writing) read cited paragraphs, evaluation items, passage kinds, named sections, keywords and a length bound — a coarse proxy. A citation alone does not meet the language-defect concerns.

**Evidence source.** Every replay is `fixture`. With `--ledger <provider-cache-root>` on the developer host, each capture's original Provider Test Ledger item labels it `fresh` (a transmitted first capture, configuration or input delta) or `cache` (an exact replay); a capture made under another cache root is `not-in-ledger`.

The report also aggregates matched, missed, unmeasured and false-positive counts by kind, keeping this measured pass, earlier captures and authored controls separate. `measuredPassLedger` recomputes before/after line and transmission counts and per-case usage from read-only ledger metadata; it does not infer an orphaned claim's outcome. Both the standalone command and `pnpm test` check the reviewed baseline by default. Stable outcomes, contract agreement and fixture hashes are pinned; elapsed times, source labels and generated Task identities are not. Baseline updates refuse any failed case.

## The measured pass

One developer-live fresh-inference pass per kind on exact `sample1`, Provider Processing v14 / active set v11, route `opencode-go`, model `deepseek-v4.1-flash`, the enrolled development credential through the service's own broker, driven by an external payload-silent driver at the provider-cache root. The transmission count before and after and every per-case figure are on #812: [before](https://github.com/zhouy1017/ai7-harness/issues/812#issuecomment-6196854241), [after and per-case metrics](https://github.com/zhouy1017/ai7-harness/issues/812#issuecomment-6197961802).

| Kind | Validation case | Transmitted | Outcome-unknown | Incurred input / output tokens |
| --- | --- | ---: | ---: | ---: |
| Review, three categories (one Run) | `editorial-evidence/sample1-review-three-categories` | 38 | 1 | 79,241 / 191,471 |
| 润色这段, two sentences | `editorial-evidence/sample1-polish-two-sentences` (declared `input:` delta) | 2 | 0 | 956 / 4,405 |
| AI7 初评 | `editorial-evidence/sample1-initial-evaluation` | 9 | 1 | 21,976 / 24,369 |
| 审稿意见 | `editorial-evidence/sample1-readers-report-author` | 9 | 1 | 80,414 / 34,195 |
| Writing draft | `editorial-evidence/sample1-writing-promotion-brief` | 9 | 1 | 17,940 / 18,851 |

The ledger grew from 179 to 251 lines (163 to 230 transmitted); all 72 added lines belong to this pass: 67 transmitted, three failed and two refused, with 200,527 input / 273,291 output tokens recorded. No retry was declared. The review driver ran in a foreground tool call that hit its time limit, which stopped the service through `--parent-pid` after six 错别字 units. The same Run was continued; unit 7, `S40/review-first/59`, remains outcome-unknown, with no ledger completion line. Its two later attempts, `/60` and `/61`, were refused without sending. This follows the Commander's recorded decision and is not a successful seventh unit.

Each Run Report reflection of 初评, 审稿意见 and writing ended outcome-unknown 0.4–1.0 s after the long synthesis response, the pattern [#851](https://github.com/zhouy1017/ai7-harness/issues/851) tracks. The ledger's three failed rows are `S40/evaluation-first/10`, `S40/readers-report-first/20` and `S84/writing-first/30`; none was retried. The replay's unanswered turns and adapter-failure labels are fixture coverage observations, not new live outcomes. Report replay usage includes its prerequisite evaluation (102,390 / 58,564 combined); the table above counts only the report's own live calls.

The captures became five reviewed fixtures (`sample1-recorded-v41-editorial-{review,polish,evaluation-initial,readers-report,writing-draft}`), each entry emitted by `tools/generate-model-fixture.mjs` with exact `sample1` source proof and its original capture provenance. One review capture (a 文学性 sampling turn) is refused `FIXTURE_GEN/identity-unmapped` because its answer cites a block its request never carried; its replay therefore records that turn and the reflection keyed on it as unanswered.

Review provenance is head `5955f39d`; the four subsequent kind fixtures were captured at `db58a668`. The Reviewer read every case, expectation, trap and new fixture response, and regenerated all 66 recorded entries in memory from the read-only cache with exact-sample1 source proof. No other manuscript, secret or credential contents were found; the sixth new fixture contains only authored synthetic prose. The evidence document quotes no manuscript passages. The measured pass was not rerun.

## Results

| Case | Source | Concerns met | Useful (precise) | Located / listed | FP checks fired | Missed (raised but excluded; unmeasured) | Editor adopt / edit / reject / leave | Applies correct; reversal exact |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| review-typos-sample1 | fresh | 2/7 | 2 (2) | 19 / 29 | 0/4 | 4 (2; 1 unmeasured) | 2 / 0 / 0 / 17 | 2 of 2; yes |
| review-style-sample1 | fresh | 1/2 | 1 (1) | 8 / 10 | 1/3 | 1 (0) | 1 / 0 / 1 / 6 | 批注; yes |
| review-literary-sample1 | fresh | 0/2 | 0 (0) | 38 / 77 | 0/4 | 2 (1) | 0 / 0 / 0 / 38 | no Apply; yes |
| polish-sample1-attributive | fresh | 1/1 | 1 (1) | 3 / 3 | 0/2 | 0 | 1 / 0 / 0 / 2 | 1 of 1; yes |
| polish-sample1-usage | fresh | 1/1 | 1 (1) | 2 / 2 | 0/1 | 0 | 1 / 0 / 0 / 1 | 1 of 1; yes |
| initial-evaluation-sample1 | fresh | 4/5 | — | 8/8 units; five items scored, 82.5; 146 cited observations | 0/2 | 1 | Evaluation Record finalized | — |
| readers-report-sample1 | fresh | 2/4 | — | 7/8 units; five sections | 0/2 | 2 | 审稿意见 draft document made | — |
| writing-draft-sample1 | fresh | 3/4 | — | 7/8 units; 592 graphemes in six sections | 1/3 | 1 | delivered to 宣传部 | — |
| clarification-sample1 (#865) | fresh | 1/1 | — | normal 0 questions; ambiguous 8/8 units asked and answered | 0/1 | 0 | — | — |
| material-review-sample1 (#809) | fresh | 2/7 | 2 (2) | 11 / 21 | 0/4 | 5 (2) | 2 / 0 / 0 / 9 | 2 of 2; yes |
| cross-deliverable-sample1 (#813) | not-in-ledger | 0/1 | 0 | 1 / 2 (outside the selected paragraph) | 0/1 | 1 (1) | — | — |
| review-typos-synthetic-lighthouse | fixture (authored) | 6/7 | 6 (6) | 8 / 9 | 1/3 | 1 | 5 / 1 / 1 / 1 | 6 of 6; yes |
| review-style-synthetic-museum | fixture (authored) | 5/6 | 5 (4) | 7 / 7 | 1/4 | 1 | 5 / 0 / 1 / 1 | 批注; yes |

What an editor gets, read from these numbers:

- **Two measured proofreading proposals meet the reviewed concerns.** Both were adopted as proposed, put the correction in place and reversed exactly. Seventeen other located proposals remain unclassified and await an editor's judgement.
- **Location, not recognition, is the largest loss.** 51 of the 116 review findings the model listed (44%) were excluded as `quote-not-found`, every one with a quotation that occurs verbatim in the manuscript; 50 sit exactly in the block the declared ordinal names when a unit's leading overlap block is not counted. Three correct, verbatim findings on expected concerns never reached the editor. The same pattern appears in the pre-v14 #809 and #813 captures. This is [#879](https://github.com/zhouy1017/ai7-harness/issues/879).
- **Literary review needs editorial judgement.** 77 findings were listed for 文学性与表达改进, 38 located, none matching the two remaining concerns. All 38 located findings remain unclassified; this does not show that they lack value.
- **润色这段 is precise on the selection.** Both selections drew a correct fix of the concern, and every other suggestion kept the protected names and idioms.
- **Delivery records are produced, with substantive omissions.** 初评 and 审稿意见 meet four of five and two of four concerns respectively; their citations do not demonstrate recognition of the specified language slips. The report has all five sections and follows the finalized conclusion. The writing draft fits the 600-grapheme bound and suspense/secrecy clauses, but omits the book title and contradicts the source chronology by treating the letter as unopened after the return home.
- **Earlier clarification captures distinguish the two tested instructions.** The clear instruction prompted no question; the ambiguous focus prompted one per unit, each answered. This is #865 reuse, not another measured live pass.

For the measured pass, the by-kind totals are review 3/11 matched, seven missed (three raised but excluded), one unmeasured and one FP check; polish 2/2, no misses or FP checks; 初评 4/5, one miss; 审稿意见 2/4, two misses; writing 3/4, one miss and one FP check. Authored review controls separately match 11/13 with two misses and two FP checks. Earlier material review, cross-deliverable and clarification remain separate cohorts in the generated table.

## Reviewer corrections to the initial measurement

The linked #812 comment preserves the Worker's initial scoring. The replay above supersedes those editorial scores, using the same responses and unchanged live ledger; the changed numerators are measurement corrections, not a second pass.

| Expectation or claim | Review decision and effect |
| --- | --- |
| A short intensifier in proofreading and material review | Removed as a mandatory typo: optional concision is not a normative error. Retained, explicitly labelled optional, only in the user-requested polish case. |
| Two circle-zero anchors in proofreading, style and material review | Require a note/replacement identifying the zero issue. Converting a date to Arabic numerals or discussing relative dates no longer counts as recognizing the distinct character problem. |
| Title and two chapter headings necessarily need styles | Removed all three mandatory concerns: imported plain paragraph classification does not establish a visible typesetting defect. Conditional checks remain unclassified. |
| Two gendered similes and a deliberate antithesis necessarily need rewriting | Removed all three literary concerns: they are defensible narrative choices. Their presence is neither a required defect nor automatically an error to discuss. |
| Museum's generic gazetteer mention needs book-title marks | Reclassified as a correct-as-written trap; it names a kind of source, not a specific title. The alleged injection had not changed its text. Generated manuscript and authored responses remain identical. |
| Museum's unit symbol itself is invalid | Clarified the concern as missing number/unit spacing and local inconsistency, without treating the Latin symbol as inherently wrong. |
| 初评/report citations alone demonstrate language-slip detection | Added issue-specific keywords and defect paragraphs. Initial evaluation changes 5/5 → 4/5; report 4/4 → 2/4. |
| Writing's 600-character brief permits an 800-grapheme check | Tightened to 600 including title/headings; the recorded 592 still passes. Added the source-chronology trap, which fires. |
| Writing closed 8/8 units | Corrected to 7/8: unit 6 is contract-invalid (extra `passages_note` key), already visible in the incoming baseline. This was a reporting error in the document/#812 comment, not a new regression. |
| A protected span is lost whenever a partial replacement does not repeat all of it | Scoring now includes untouched span edges; an unchanged subspan is not a false positive. The polish viewpoint trap is explicitly a conservative text proxy, not a complete semantic test. |

Together these changes move proofreading 5/8 → 2/7, style 2/5 → 1/2, literary 1/5 → 0/2, material 2/8 → 2/7 and authored museum 5/7 → 5/6. Other matched counts stay unchanged. The 51/116 exclusions, token/transmission counts, Apply/reversal path and capture outcomes are not rewritten by these corrections.

## Limitations

- One model on one route, one run per kind, one Public SampleBook; no variance, no comparison and no claim about other manuscripts or genres.
- Expected concerns and false-positive checks are editorial judgements on a published novel's opening chapters, corrected in review as listed above; unclassified findings may be valuable and are not scored.
- The editor is simulated by fixed rules; real adoption, editing time and trust are not measured. "Effort" counts decisions, not minutes.
- Structural concerns use cited paragraphs and keywords as a proxy for reading the result; they can miss a correct point phrased differently.
- The synthetic manuscripts run on authored fixtures only (developer-live transmits exact `sample1` only); their numbers describe the harness, not a model.
- The writing case's Book was imported under a case label rather than its real title, so the draft's missing 《蟠虺》 partly reflects the input, not only the model.
- 错别字 unit 7 has no answer (the tooling incident), so one concern is unmeasured. Three Run Report reflections have no successful capture. The 文学性 sampling capture cannot enter the fixture; its dependent reflection cannot match replay either. These gaps do not block all delivery records, but a recorded delivery is not evidence of complete coverage.
- The #809 and #813 captures predate the v14 model-question wrapper; their replays answer by unit header and report `contractsAgree: false` because the current review Task freezes a different contract than the one captured.
- Live elapsed time includes the Go route's latency on 2026-10-15 and the review's sequential category order; replay times measure the harness only.

## Defects

| Issue | Priority | Defect | Disposition |
| --- | --- | --- | --- |
| [#879](https://github.com/zhouy1017/ai7-harness/issues/879) | P1 | Review findings numbered against a unit's own blocks are excluded as `quote-not-found` | Open; not fixed here. Explicit provider-free assertions outside the baseline measure 51/116 lost, all 51 verbatim and 50 at the own-block ordinal; a future fix must replace that open-defect measurement with a positive regression. |
| [#880](https://github.com/zhouy1017/ai7-harness/issues/880) | P2 | The model fixture loader refused v14 model-question synthesis captures | Fixed in this slice as the brief's named one-line exception (`src/service/provider/model-fixture.ts`), with the generator's case-family branch |
| [#851](https://github.com/zhouy1017/ai7-harness/issues/851) | (existing) | Transport failure right after a long model response | Three more occurrences (Run Report reflections of 初评, 审稿意见, writing); referenced, not re-opened |

Observed but not filed as product defects: the model returned a block identity where 审稿意见 unit 7 required an ordinal (correctly refused as contract-invalid, as #807 saw for baseline unit 1); writing unit 6 carried an unexpected field and was also correctly refused; a 体例 finding flagged the punctuation of the oracle-bone inscription; writing contradicted the already-opened letter chronology.

The #880 exception accepts a synthesis contract mismatch only when the task contract is exactly the clarification-wrapped digest of the stage contract. Tests reject an unrelated digest and the same relation on a unit capture. Removing the exception locally made the acceptance regression fail; restoring it passed. Regenerating the existing `sample1-recorded-v41-polish.json` left its bytes and Git diff unchanged.

## Repeating the measurement

- Provider-free, anywhere: `pnpm run evidence:replay`; the reviewed baseline is `tests/editorial-cases/replay-baseline.json` and `pnpm test` checks it.
- On the developer host, labelling sources: `node tools/editorial-evidence.mjs --replay fixtures --ledger <provider-cache-root>`.
- A new measured pass needs a new question under ADR 0089: new cases or a changed contract, a new validation case, and the Provider Test Ledger's refusals respected; then the generator converts the captures and the baseline is updated in a reviewed PR.
