# Editorial cases

A compact, reusable set of editorial cases (Issue #812) that measures what the working AI loop is worth to an editor, not only
whether the application behaves. Each case names a manuscript, a Task to run on it, the editorial concerns an editor would
expect the Task to raise, and the findings that would be false positives. `tools/editorial-evidence.mjs` runs every case
through the product's own path on a model fixture and reports per-case metrics; see
[the 2026-10 evidence report](../../docs/development/editorial-evidence-2026-10.md) for the method and the measured pass.

Expected concerns are written by the Coding Worker and checked by the Reviewer for **editorial plausibility**. They are not
ground truth, and a finding that matches none of them is reported as *unclassified* (an editor must judge it), never as wrong.

## Material

- **`sample1`** — exact `SampleBooks/sample1.docx` (ADR 0043/0044, ADR 0079 §5). Cases quote short `sample1` fragments as
  anchors; no other manuscript text appears here.
- **Two synthetic manuscripts** — `synthetic-manuscripts.mjs` generates them deterministically from authored public synthetic
  prose and a declared injection table (`synthetic-lighthouse`: injected 错别字与规范用语 defects; `synthetic-museum`: injected
  体例与格式 defects), each with traps that are correct as written. Every analysis kind reads only exact `sample1`'s lineage
  (ADR 0044), so a synthetic case's Book is an exact `sample1` import whose blocks 1..12 the runner overwrites with the generated
  paragraphs, and whose later blocks it clears, through the editor's own journal edits — a tester's edits of `sample1` carrying
  only the generator's prose (Commander decision, 2026-10-15). These cases run on the provider-free deterministic route over the
  authored fixture `synthetic-editorial-review-authored`: nothing of them is transmitted or recorded, and they measure the
  harness and the product path, never a model.

## Files

- `cases/<id>.json` — one case, schema `ai7.editorial-case/1` below.
- `synthetic-manuscripts.mjs` — the deterministic generator of the two synthetic manuscripts and their anchors.
- `runner/` — the TypeScript case runner `tools/editorial-evidence.mjs` bundles in memory; it drives the product's store and
  execution owners and returns sanitized observations (positions, ranges, digests, counts — never manuscript or model text).

## Case schema `ai7.editorial-case/1`

| Field | Meaning |
| --- | --- |
| `schema` | `ai7.editorial-case/1` |
| `id` | `^[a-z0-9][a-z0-9-]{0,63}$`, equal to the file name |
| `kind` | `review`, `polish`, `initial-evaluation`, `readers-report`, `writing-draft`, `clarification`, `cross-deliverable` or `material-review` |
| `title` | The case in the editor's words |
| `manuscript` | `{ "source": "sample1" }` or `{ "source": "synthetic", "id": "synthetic-lighthouse" \| "synthetic-museum" }` |
| `bookTitle` | The title the Book is imported under. The live driver and the harness use the same title, so contracts that freeze Book metadata ask the same question |
| `input` | Kind-specific Task input (below) |
| `fixture` | The model fixture identity `--replay fixtures` replays |
| `measuredPass` | The kind of the one developer-live pass that produced the fixture (`review`, `polish`, `initial-evaluation`, `readers-report`, `writing-draft`), or `null` when the case replays earlier evidence or an authored fixture |
| `replay` | `{ "route": "deterministic" }` (the product's fixture route), or `{ "route": "developer-live", "modelQuestions": true | false }` — the developer-live owner whose transport is the product's deterministic adapter, with the v14 model-question wrapper on for a capture made under it and off for an earlier one |
| `expectedConcerns` | What an editor expects the Task to raise; each is a false-negative check (a *miss* when nothing matches it) |
| `falsePositiveChecks` | Words or results that must not be raised as problems; a finding that touches one is a *false positive* |
| `observations` | `acceptance` and `rework`: what the editor would accept as useful, and what would send the result back |

### `input` by kind

- `review`, `material-review`: `categories` (built-in review category ids) and `scope` (`whole`, or `{ "paragraph": n }` for a
  one-paragraph selection). `material-review` adds `material: "sample1-derived-library-item"`, the #809 library item.
- `polish`: `selection: { paragraph, start, end }` — the selection runs from the first occurrence of `start` to the end of the
  first occurrence of `end` after it, in that paragraph.
- `initial-evaluation`: `{}`. `readers-report`: `template` (`author` or `editorial`), `evaluationRecord: "j11"` (the
  finalized Evaluation Record the report drafts from, as J-11 writes it) and `evaluationFixture`, the fixture its basis 初评
  replays from on its own owner.
- `writing-draft`: `typeId`, `audience`, `channel`, `requirements` (the editor's brief).
- `clarification`: `fixtures: { normal, ambiguous }` — the same baseline analysis asked normally and with the declared
  ambiguous-focus instruction.
- `cross-deliverable`: `deliverable: "sample1-news-release-nine"` — #813's finalized news release.

### Anchors

A **text concern or check** (review, polish) anchors to a paragraph — block `n` of the imported Book, 1-based — and either
`words` (a short fragment occurring exactly once in that paragraph) or, for a synthetic manuscript, a generator `defect` / `trap`
id. A text concern may carry `corrections`: the acceptable corrected forms of `words`, the first preferred.

A **structural concern** (evaluation, report, writing) anchors to paragraphs a result must cite (`paragraphs`) and may further
require an evaluation `item`, a report passage `passageKind`, or one of `keywords` in the model's own words for that anchor.
A structural false-positive check fires when model words tied to its `paragraphs` (or anywhere, when it names none) contain one
of its `keywords`. Keyword checks are a coarse proxy; the report says so.

## Metrics (per case)

`tools/editorial-evidence.mjs` matches a located finding to a concern when it lies in the concern's paragraph and its range
overlaps the concern's words; it is **precise** when it covers them. A false-positive check fires when a finding flags its
protected words (a 批注) or proposes text in which they no longer stand (a 修改建议). It reports:

- **useful findings** (matched a concern), **unclassified** (matched nothing), **false positives** (fired a check) and
  **misses** (concerns nothing matched). Two open concerns are kept apart from a miss: **unmeasured** — in a unit the Run holds
  no answer for — and **raised but excluded** — the model quoted the concern's words in a finding the product could not place;
- **location correctness**: listed, located and excluded findings as the product counted them, and precise / matched;
- **editing effort**: what a simulated editor did with the resulting marks — *adopted* (the proposal already yields an
  acceptable correction), *edited* (the right place but another wording, corrected to the preferred form), *rejected* (a false
  positive) or *left* (unclassified; an editor must judge) — then whether each Apply put the correction in place and whether
  reversing every Apply restored every block exactly;
- for evaluation, report and writing: whether the result closed, which concerns its citations or words met, and whether the
  delivery record was made;
- **evidence source**: `fixture` by default; with `--ledger <provider-cache-root>` on the developer host, each fixture entry's
  original Provider Test Ledger item labels it `fresh` (a transmitted first capture, configuration or input delta) or
  `cache` (an exact replay), and `not-in-ledger` when it was captured under another cache root;
- for a developer-live replay, the task contracts the replayed Runs froze and whether every answering capture's contract is
  among them (`contractsAgree`): the deterministic adapter answers by unit header and digest, so a capture whose contract has
  since drifted still answers, and the metric says so;
- model, route, contract digests, capture date, recorded usage and replay elapsed time.
