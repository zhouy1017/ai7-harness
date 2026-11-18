# Editorial-value evidence, 2026-11

Status: named evidence for [#1074](https://github.com/zhouy1017/ai7-harness/issues/1074) (F-24 editorial quality baseline and re-measurement), measured on 2026-11-18 at the 0.7.2 Alpha product (service lane `codex/integration-0.7.3-service`, protocol 204, schema 116; behaviour unchanged since `dev@790acbcb`). It is the input to the [#1027](https://github.com/zhouy1017/ai7-harness/issues/1027) decision. Like the [2026-10 report](./editorial-evidence-2026-10.md) it records what one developer-live Review Run per book showed an editor; it is not a benchmark and no general claim about model quality follows from it.

## Question and method

**Validation question (ADR 0089).** On the current product (review contract v2, the #879/#1022 location fix), what does one developer-live Review Run per Public SampleBook give an editor: located rate, false positives, time per chapter and tokens, and on `sample1` also the useful rate against the reviewed cases? Existing evidence could not answer it: 2026-10 measured `sample1` alone before the location fix, and #1538 recorded current `sample1` 错别字 units but no complete Review Run. Family `editorial-quality-measurement` (the product refuses dates in validation names), one case per book, model `opencode-go/deepseek-v4.1-flash` only.

**Scope.**

| Book | Scope | Categories | Units in scope (no-send preflight) |
| --- | --- | --- | ---: |
| `sample1` | whole book (8,289 characters) | 错别字与规范用语, 体例与格式, 文学性与表达改进 | 8 each |
| 《朝花夕拾》 | 狗·猫·鼠, 阿长与《山海经》 (8,114 characters) | 错别字与规范用语 | 9 |
| 《呐喊》 | 狂人日记, 孔乙己 (7,429) | 错别字与规范用语 | 17 |
| 《老残游记》 | 第一回, 第二回 (9,399) | 错别字与规范用语 | 10 |
| 《儒林外史》 | 第一回, 第二回 (13,087) | 错别字与规范用语 | 16 |

The four ADR 0091 books were first planned with 体例与格式 too. `sample1`'s measured call rate (2.75, 2.5 and 3.6 calls per unit for the three categories, against the 2 per unit the plan assumed) broke the call budget, so the Commander cut the four to 错别字与规范用语: a budget reason, not a result.

**References, fixed before any live call** (commits `e57ea5ab`, `c6c9394a`, `48885e07`; the category cut `ba8ded5d`). `sample1` uses the repository's reviewed 2026-10 cases unchanged (11 concerns, 11 false-positive checks); its 2026-11 cases carry exactly those references, which a unit test checks. The four ADR 0091 books are reviewed on their exact, unedited files: only `sample1` admits a tester's edits, so no defect was planted and they have **no useful rate or concern recall** — planting defects in them needs an Owner decision. Each has three false-positive traps: a name, and two period-authentic forms whose modern variant occurs 0 times in the range. Under the reprint-fidelity rule every located finding on the four proposes to change or flags the pinned original; that count is an **upper bound of false positives**, stricter than a modern manuscript's editor would be. A suggestion that only turns 著 into 着 (the zh-hans conversion's residue: 著 / 着 in range 47 / 0 in 《朝花夕拾》, 39 / 0 in 《老残游记》, 98 / 0 in 《儒林外史》, 1 / 47 in 《呐喊》, which therefore declares no residue) is counted apart; 错别字 results on three books therefore largely measure the Wikisource conversion. Twelve traps prove little: 0 of 12 would still allow a true firing rate of about 22 % (95 %).

**Harness.** `sample1`: its captures were converted by `tools/generate-model-fixture.mjs` with exact source proof into `tests/fixtures/model/sample1-recorded-v2-editorial-quality-review.json`, and `pnpm run evidence:replay` replays the three cases `review-{typos,style,literary}-sample1-remeasure` (cohort `measured-pass-2026-11`; the reviewed baseline gains exactly those three entries). The four: no fixture may be generated (ADR 0091 §3.3); `node tools/editorial-evidence.mjs --score <data root> --case <id>` scores a copy of the developer-live data root with `fetch` refused, after binding it to the case — one Book, one Review Run (the ledger also shows one Run per book), a settled 选章 Run over the case's chapters and categories, an unedited Book. A Run that is not settled is not scored. Counts below are computed by scripts from the ledger, the score files and the replay metrics.

## The measured pass

Live window 2026-11-18 15:49Z–17:36Z, external payload-silent driver at the provider-cache root, product built from `48885e07` / `ba8ded5d` (no product code changed). The interface lane ran no DeepSeek agent during the window; no foreign ledger line is interleaved (ledger lines 778 → 941).

Each launch declared the product's `--validation-delta input:<rationale>` (Commander-approved): the live-once rule refuses a new request at a review step that already holds evidence under the same configuration (`PROVIDER_VALIDATION_SIMILAR_EVIDENCE`), and #1538's `sample1` 错别字 units cover `review-first/unit-1…8`. The first `sample1` attempt, launched without it, was refused 16 times at zero cost and stopped before anything was sent; its data root is kept unchanged, never restarted. Rationales: `sample1` `input:whole-book-review-without-baseline-context` (#1538's Book had a completed baseline analysis and another title; the exact byte difference was not read), the four `input:different-public-samplebook-chapters`. The ledger records each such call as decision `input-delta` linked to the earlier evidence.

| Book | Live calls | Outcome-unknown | Input / output tokens | Wall time | Run | Measured |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `sample1` | 72 | 0 | 358,811 / 156,645 | 42.7 min | partial | via fixture replay |
| 《朝花夕拾》 | 23 | 0 | 85,799 / 53,313 | 14.0 min | settled | yes |
| 《呐喊》 | 35 | 0 | 96,894 / 73,518 | 20.0 min | settled | yes |
| 《老残游记》 | 10 | 2 | 39,000 / 23,438 | 8.7 min | cancelled | **no** |
| 《儒林外史》 | 7 | 2 | 12,280 / 14,452 | 6.6 min | cancelled | **no** |
| Total | **147** | **4** | **592,784 / 321,366** | | | 3 of 5 |

Plus 16 zero-cost refusals. Money per call is not observable on the subscription; the four outcome-unknown calls carry no usage and may still have been billed. Nothing was resent.

- **`sample1` ended partial.** 错别字 (22 calls, 32 findings on the manuscript) and 体例 (20 calls, 12 findings, one gap unit) settled and the 全书审阅统合总结 completed, but 文学性与表达改进 (29 calls) stopped at the developer-live default **Run Budget Ceiling** (30,000 tokens per frozen unit, 240,000 for eight units) before its result set was materialized. The product's own detail: coverage 8/8 units, all reduction/synthesis stages closed, 74 located findings, 27 sampled, estimated precision 0.78. This ceiling is developer-live's default; ordinary production leaves the ceiling unset. Per the plan, `sample1` is scored through the fixture replay, not the partial live Run.
- **《老残游记》 and 《儒林外史》 stopped on outcome-unknown.** 《老残游记》 unit 9 (`S40/review-first-range/65`, 17:28:01.214Z) and 《儒林外史》 unit 7 (`/72`, 17:36:06.250Z) each ended outcome-unknown exactly 180 s after the previous ledger line, i.e. at the product's fixed request deadline (`config/runtime-execution-defaults.json` › `transport.requestDeadlineSeconds: 180`, applied once from the start of the request and not extended while the answer streams; an abort after send is classified outcome-unknown). The next unknown in each Run (`/66` +0.66 s, `/73` +0.45 s) was the next unit, aborted when the driver cancelled the Run, as the stop rule required. Typical unit calls took 40–75 s. Both books are **not measured**: re-measuring would mean the same questions again (refused as `PROVIDER_VALIDATION_EVIDENCE_EXISTS`) plus retries of unknown outcomes, which the rules forbid. Filed as [#1599](https://github.com/zhouy1017/ai7-harness/issues/1599): an editor's long unit answer fails the same way.
- **Tool turns.** In the current contract the model used platform tools on 10 of `sample1`'s 24 units (错别字 2, 体例 2, 文学性 6). Of the 72 captures, 38 convert into the fixture; the generator refuses the 34 tool-use captures (24 continuation turns `request-shape-unsupported`, 10 first answers that were tool calls `response-shape-unsupported`), and the replay transport has no tool calls. Filed as [#1598](https://github.com/zhouy1017/ai7-harness/issues/1598).

## Results

**`sample1`** (fixture replay, 14 of 24 units answered; the tool-using units are unmeasured gaps, never filled):

| Case | Units answered | Concerns met (unmeasured) | Useful / located | Listed / located / excluded | FP checks fired | Editor adopt / edit / reject / leave | Applies correct; reversal exact |
| --- | --- | ---: | ---: | --- | ---: | --- | --- |
| 错别字与规范用语 | 6 / 8 | 6 / 7 (1) | 6 / 27 | 27 / 27 / 0 | 0 / 4 | 5 / 1 / 0 / 21 | 6 of 6; yes |
| 体例与格式 | 6 / 8 | 2 / 2 | 2 / 9 | 9 / 9 / 0 | 1 / 3 | 2 / 0 / 1 / 6 | 批注; yes |
| 文学性与表达改进 | 2 / 8 | 1 / 2 | 1 / 21 | 21 / 21 / 0 | 0 / 4 | 0 / 1 / 0 / 20 | 1 of 1; yes |
| **Total** | 14 / 24 | **9 / 11** (1 unmeasured, 1 missed) | 9 / 57 (16 %) | 57 / 57 / 0 (located 100 %) | 1 / 11 | 7 / 2 / 1 / 47 | yes |

**The four ADR 0091 books** (score of a store copy; original text as the reference):

| Book | Listed / located (rate) | Traps fired | Changes to the original (upper bound of FP) | of which 著→着 residue | Time per chapter | Tokens per chapter |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 《朝花夕拾》 | 58 / 58 (100 %) | 2 / 3 (发见, 那里的话) | 58 (all 修改建议) | 38 | 7.0 min | 69,556 |
| 《呐喊》 | 54 / 54 (100 %) | 2 / 3 (那里猜得到, 大发见) | 54 (all 修改建议) | — (not declared) | 10.0 min | 85,206 |
| 《老残游记》 | not measured | — | — | — | — | — |
| 《儒林外史》 | not measured | — | — | — | — | — |

Both name traps held; both period-form traps fired on each book: the model "corrected" the authors' 发见 and 那里 (as 哪里) to modern forms. Of 《朝花夕拾》's 58 suggestions, 38 only turn the conversion's 著 into 着 — plausibly useful for a modern simplified edition, wrong for a reprint that keeps the original — and 20 change something else, two of them the traps. Time per 1,000 characters: 1.7 min (《朝花夕拾》), 2.7 min (《呐喊》), 2.0 min for `sample1`'s 错别字 category alone (16.3 min for the whole book).

What an editor gets, read from these numbers:

- **Every listed finding reaches the manuscript.** 0 of 57 (`sample1`) and 0 of 112 (the two classics) were excluded; the 2026-10 location loss (#879) is gone.
- **On `sample1`, proofreading meets every measured concern.** All six measured 错别字 concerns were met and corrected in place; one concern (a circle-zero year) sits in a tool-using unit and is unmeasured. Both 体例 concerns were met.
- **Most findings still need an editor's judgement.** 47 of 57 `sample1` findings and 108 of 112 on the classics are unclassified by the references.
- **On classic texts the 错别字 category modernizes.** Period forms are "corrected"; on the books with conversion residue most suggestions are the residue. A reprint editor would reject most of these, a modernizing editor might accept many.
- **Runs do not always finish.** Two of five Runs stopped on the 180 s deadline and one category of a third on the developer-live budget ceiling.

## Compared with 2026-10

The 2026-10 live pass on `sample1`, as reported: located 65 / 116 (51 lost as `quote-not-found`, #879), concerns 3 / 11, FP checks 1 / 11, 38 calls, 79,241 / 191,471 tokens, about 33 min for the three categories. The same 2026-10 answers replayed on today's code (the reviewed baseline): located 116 / 116, concerns 6 / 11 (1 unmeasured), useful 6 / 116 (5 %), FP checks 1 / 11.

Compared only on what both passes measured — the nine concerns outside both passes' unanswered units (2026-10 lacks 错别字 unit 7, 2026-11 lacks the tool-using units): 2026-10 replayed on today's code meets 6 / 9, 2026-11 meets 8 / 9 (错别字 5 / 5 vs 4 / 5, 体例 2 / 2 vs 1 / 2, 文学性 1 / 2 in both). The same 体例 trap fired in both. This narrows the comparison sharply: two of the eleven concerns are out, and in 2026-11 the 文学性 category answered only 2 of 8 units, so its listed count (21 vs 77) and its zero fired checks say little. FP checks in unanswered units could not fire.

What changed between the passes: review contract v2 and the location fix (#879 / #1022), the R1–R3 releases (0.7.0–0.7.2), platform tools in the review categories, and a call pattern of 2.5–3.6 calls per unit (tool turns and sampling). The four ADR 0091 books have no 2026-10 counterpart. One run per book, one model: no variance and no general claim.

## What was not measured

- 《老残游记》 and 《儒林外史》 (stopped on the 180 s deadline, #1599).
- `sample1`'s ten tool-using units (#1598); 文学性 on `sample1` therefore rests on 2 of 8 units.
- Useful rate and concern recall on the four ADR 0091 books (no planted defects; Owner decision needed); 体例与格式 and 文学性 on the four (budget).
- 初评, 审稿意见 and writing (structural; final-only recording blocked by #1585); whole-book runs of the four; factual review.
- Variance; money per call; real editors (protocol below).

## Real-editor protocol (to be run by the Owner after 0.8.0)

Arranged by the Owner with the unified human test after 0.8.0 ([#1540](https://github.com/zhouy1017/ai7-harness/issues/1540)); not run here.

- **Editors.** Three to five working editors, recruited by the Owner; none is told which findings the harness scored.
- **Material.** Two chapters each, from the Public SampleBooks and the same chapter ranges measured above, in the packaged human-test build. No private manuscript.
- **Task.** Each editor runs one 审阅 (错别字与规范用语, and 体例与格式 where time allows) on each chapter and decides every finding in the product — 采纳, 修改后采纳, 拒绝 or 暂不处理 — then rates the Run on three five-point questions: would you keep this finding list; how much of it would you have found yourself; how much time did it save.
- **Recorded.** Decisions and ratings only: per editor and chapter, the count of each decision, the three ratings and the minutes spent. No manuscript text, no finding text, no editor name or contact.
- **Reported.** Aggregates only (totals, medians and ranges across editors) in a dated addendum to this report; no per-editor row.

## Limitations

- One model on one route, one Run per book; three of five books measured; first two body chapters only (a chapter-start bias).
- `sample1`'s numbers come from 14 of 24 units; its live Run was partial.
- The four classics have no planted defects; their false-positive count is an upper bound by a reprint-fidelity rule that a modernizing editor would not apply, and three of them carry conversion residue that dominates the 错别字 results.
- Expected concerns and traps are editorial judgements fixed before the pass; unclassified findings may be valuable and are not scored.
- The editor is simulated by fixed rules; "time" is the Run's wall time on the Go route on 2026-11-18, including sampling and synthesis, not an editor's minutes.
