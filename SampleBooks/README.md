# Public SampleBooks

The Owner designated the six files in this directory for public test use through
[Issue #32](https://github.com/zhouy1017/ai7-harness/issues/32), under the narrow
admission rule in [ADR 0043](../docs/adr/0043-allow-public-samplebooks-in-repository-and-ci.md).

The original source is the ignored, untracked `SampleBooks/` directory in the local
worktree `C:\Users\Chooo\codebase\ai7-harness` beside
`main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`. Because those files were not Git
objects, their source identity is the Owner designation plus the exact path, size,
and SHA-256 allowlist below. The repository copies are byte-for-byte identical.

| Exact path under `SampleBooks/` | Bytes | SHA-256 |
| --- | ---: | --- |
| `1蟠虺（修订290326字).docx` | 546758 | `988f5b43445ce357fc2f98a07428d26504650d33f378e6868af62d758d953797` |
| `2听漏（定稿368544字）.docx` | 631075 | `39a3ce58dd53ff9ff157547c573b260979ac226ad571cd6518b1f98a6769cf50` |
| `3天兽（定稿395870字)##＊.doc` | 1173504 | `931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2` |
| `春歌(一次通读后电子版).pdf` | 4330883 | `a41ebd36e8f1547500571fa9c8ca837e118a4f4b634605a46b2aae6ecb99e78b` |
| `蟠虺.docx` | 43661 | `a45283e6132f8992e71aa924b3ad3504a65c8651895fa92ad8c087305f2fb183` |
| `sample1.docx` | 29550 | `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483` |

Total: 6 files, 6,755,431 bytes.

Under [ADR 0044](../docs/adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), exact `sample1.docx` is also the standing **Sample1 Compatibility Baseline / sample1 兼容性基线** for manuscript-dependent supported journeys. Downstream components consume its imported Book/Manuscript/Revision state rather than each reparsing DOCX. Every exact fidelity signal must be truthfully preserved or disclosed through an explicit initially-unselected degradation decision; a newly discovered representable signal is not a reason to reject or replace this exact baseline. This invariant is not full J-01 or one giant test.

These files may be used as provider-free input to local and hosted-CI tests,
including authoring synthetic test data. A consuming scenario must still bind the
exact admitted input in its own authorized Change Brief.

This admission does not authorize raw manuscript payload in logs, diagnostics,
screenshots, traces, videos, or uploaded artifacts. For the other five files it
also grants no live-provider use. Exact `sample1` alone has ADR 0044's future,
separately authorized local manual recording eligibility under Provider Processing
v2; no call, credential setup, or fixture exists now. Raw recording stays in
protected local staging outside repositories, and only a normalized, sanitized,
rights-reviewed and human-reviewed fixture may later enter through a separate
Issue and pull request. Neither exception grants application distribution,
production learning, export, external delivery, publication, Public Release
Permission, or release-asset use. Runtime derivatives remain confined to
disposable external test data roots under the existing cleanup lifecycle.

## Import verdicts

Measured at `dev@2b5d3eeed81afbdf4d1cce4c1c84a467fafca92a` with parser identity
`ai7-docx-fflate-saxes/1`, by calling `parseDocx` once per admitted file exactly as
`tests/unit/docx.test.ts` calls it. Any change to `src/service/docx.ts` is a reason to
re-measure. Recorded for
[Issue #297](https://github.com/zhouy1017/ai7-harness/issues/297);
[Issue #313](https://github.com/zhouy1017/ai7-harness/issues/313) designs against this
table and [Issue #311](https://github.com/zhouy1017/ai7-harness/issues/311) depends on
it.

The `Imports at #297's head` column is that first reading. `Imports after ADR 0072 §4`
beside it is the second, measured the same way at the head of the pull request that
closes [Issue #352](https://github.com/zhouy1017/ai7-harness/issues/352), which implemented
[ADR 0072 §4](../docs/adr/0072-admit-multi-format-manuscript-intake-with-docx-as-the-working-representation.md),
with the same parser identity `ai7-docx-fflate-saxes/1`.

`Imports after ADR 0072 §5` is the third, and it concerns one file. At the head of the
pull request that closes [Issue #351](https://github.com/zhouy1017/ai7-harness/issues/351),
the admitted `.doc` is read through converter identity `ai7-doc-to-docx/1` — the
pure-JavaScript legacy-Word reader ADR 0070 §3 pre-authorized — into a DOCX working
representation, which the same parser then reads. The four DOCX files were not
re-measured: neither `src/service/docx.ts`'s parsing nor its bounds moved, and exact
`sample1`'s digests, blocks, and fidelity are unchanged. The PDF was again never opened.
The last paragraph of this section is superseded for the `.doc` alone: intake no longer
decides that file from its extension, so its route is now a conversion rather than a
refusal; the `.pdf` sentence still holds.

Only counters and the parser's own structural refusal messages are recorded here. No
block text, no document title, and no other manuscript-derived string was captured,
printed, or committed; the probe that produced these numbers was a throwaway deleted
before the commit rather than integrated.

A refusal has two layers, and only the outer one is visible to an editor. The parser
throws `DOCX_REJECTED:<structural reason>` (`src/service/docx.ts:84`); `stageSelectedManuscript`
catches it and flattens every reason to one sentence,
`该 DOCX 不符合当前受限本地导入边界。` (`src/service/store.ts:3662`). The structural
reason is what this table records.

| Exact path under `SampleBooks/` | Format | Bytes | Imports at #297's head | Imports after ADR 0072 §4 | Imports after ADR 0072 §5 | Nature | Test input today | Settled decision | Recommendation |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| `1蟠虺（修订290326字).docx` | DOCX | 546758 | No — `non-default terminal section properties` (`docx.ts:316`) | Yes — 4434 blocks, 290325 characters; fidelity `inline-styles` 12424, `sections` 1, `headers-footers` 2, all other categories 0; plan `degraded-import-no-round-trip` | Not re-measured — neither the parser nor its bounds moved | Editable | No <sup>1</sup> | stays admitted; today unimportable; the bounded boundary widens only through its own Issue, which #313's design decides | Accidental narrowing of the parser; worth its own Issue |
| `2听漏（定稿368544字）.docx` | DOCX | 631075 | No — `non-default terminal section properties` (`docx.ts:316`) | Yes — 4577 blocks, 368544 characters; fidelity `inline-styles` 9868, `sections` 1, `headers-footers` 1, all other categories 0; plan `degraded-import-no-round-trip` | Not re-measured — neither the parser nor its bounds moved | Editable | No <sup>1</sup> | stays admitted; today unimportable; the bounded boundary widens only through its own Issue, which #313's design decides | Accidental narrowing of the parser; worth its own Issue |
| `3天兽（定稿395870字)##＊.doc` | DOC | 1173504 | No — `selected file is not DOCX` (`docx.ts:115`), decided from the extension before any byte is read | No — `selected file is not DOCX` (`docx.ts:112`), unchanged; the extension route is S51b's | Yes — converted by `ai7-doc-to-docx/1` into a DOCX working representation the same parser then reads: 5815 blocks, 396107 characters; fidelity `headers-footers` 1, all other categories 0; plan `degraded-import-no-round-trip`; working object `ea5068a74444217fbca9ece5ab572933c007b0d8797f0d1cd3f815314a8213a1` | Editable after conversion | Yes | stays admitted; intake is #313's (V2-UX-IMP-001 admits any format; conversion or source-only retention is that slice's to settle) | Not a parser bound at all; #313 owns it |
| `春歌(一次通读后电子版).pdf` | PDF | 4330883 | No — `selected file is not DOCX` (`docx.ts:115`), decided from the extension before any byte is read | No — `selected file is not DOCX` (`docx.ts:112`), unchanged; the extension route is S51b's | Not opened — source-only by nature, unchanged | Source-only by nature (fixed layout) <sup>2</sup> | No | stays admitted; intake is #313's (V2-UX-IMP-001 admits any format; conversion or source-only retention is that slice's to settle) | Source-only retention under V2-UX-IMP-006; #313 owns it |
| `蟠虺.docx` | DOCX | 43661 | No — `non-default terminal section properties` (`docx.ts:316`) | Yes — 100 blocks, 8359 characters; fidelity `inline-styles` 216, `comments-revisions` 124, `sections` 1, all other categories 0; plan `degraded-import-no-round-trip` | Not re-measured — neither the parser nor its bounds moved | Editable | No <sup>1</sup> | stays admitted; today unimportable; the bounded boundary widens only through its own Issue, which #313's design decides | Accidental narrowing of the parser; worth its own Issue |
| `sample1.docx` — **control** | DOCX | 29550 | Yes — 97 blocks, 8289 characters; fidelity `inline-styles` 266, `sections` 1, all other categories 0 | Yes — unchanged: 97 blocks, 8289 characters; fidelity `inline-styles` 266, `sections` 1, all other categories 0; plan `degraded-import-no-round-trip` with exactly those two degradations | Not re-measured — neither the parser nor its bounds moved | Editable | Yes | usable as test input under #311 | Control row: it reproduces the ADR 0044 baseline, which is what proves the probe read the parser correctly |

<sup>1</sup> Not importable, so not a test input through the bounded path. Its content
may still serve #311's composed-fixture builder, because that builder assembles its own
DOCX container — but only if the builder reads the admitted file by some path other than
`parseDocx`, which refuses it.

<sup>2</sup> A by-design expectation from the format, not a measurement: the file was
never opened. #313 decides it.

**The second reading closes the table: all four admitted DOCX files import.** The two
conditions the paragraphs below describe are exactly the ones #352 removed — the
body-level terminal `sectPr` is now counted in the `sections` class instead of matched
against `sample1`'s shape, and `deriveImportFidelityPlan` plans any well-formed report
instead of the all-zero or `sample1`-exact projection. Each newly importing file carries
`降级导入` or `不支持导入` counts, so each arrives with an explicit Import Degradation
Decision (V2-UX-IMP-005) rather than a refusal; `蟠虺.docx`'s 124 comment and revision
marks are dropped content the editor accepts in that same decision, not a blocking case.
Exact `sample1` is unchanged, which is what proves the widening did not move the ADR 0044
baseline. The `Settled decision` and `Recommendation` columns and footnote 1 remain #297's
own reading at its own head; footnote 1's "not importable" no longer holds, so all three
files are now readable through `parseDocx` for [Issue #311](https://github.com/zhouy1017/ai7-harness/issues/311).

**Three of the four admitted DOCX files refuse, not two.**
`1蟠虺（修订290326字).docx` had never been attempted before this measurement and refuses
for the same reason as the two already known. Only exact `sample1` imports.

**What fires first, and why it reads as accidental.** All three DOCX refusals stop at
`src/service/docx.ts:316`, on the body-level `<w:sectPr>` attribute set. An accepted
terminal section must carry either no attributes at all — with no child elements
(`docx.ts:339`) — or exactly `rsidR` and `rsidRPr` with children exactly `pgSz`, `pgMar`,
`cols`, `docGrid` (`docx.ts:341`). The second shape is `sample1`'s own, named `'sample1'`
in the code, and `parseDocx` then refuses even a matching document unless it is
byte-exact `sample1` (`docx.ts:647-650`). So the branch admits exactly two documents: a
synthetic zero-attribute container, and `sample1`. That is a fingerprint of the baseline
rather than a boundary any requirement or ADR chose. No design record makes section
properties a precondition for import: V2-UX-IMP-002 lists sections as a fidelity
*category* to classify, the parser's own `sections` category already carries a
`降级导入` label and detail, and V2-UX-IMP-005 makes an explicit Import Degradation
Decision the design's answer to degradation. Refusing the file forecloses the decision
the design says the editor should get to make.

**A second gate stands behind the first.** This is read from the code, not measured —
these files never reached it. Even with the terminal-section condition widened, a
document with any inline style would then be refused at `docx.ts:661`
(`document uses a fidelity branch outside the bounded import`), because
`deriveImportFidelityPlan` admits only two projections: all-zero, or `sample1`'s exact
266/1 shape at `sample1`'s exact digest and byte count (`docx.ts:615-632`). Widening the
bounded import is therefore not a one-line change; the Issue that takes it on faces two
gates in series.

**These are narrowings, not the parser's safety bounds.** The archive, entry-count,
entry-size, ZIP-ratio, XML nesting, DTD and entity, path-traversal and active-content
checks are deliberate hardening against hostile input, and none of them fired for any
admitted file. Nothing here recommends relaxing them. The two conditions above are of a
different kind: they encode what `sample1` happens to look like.

**`.doc` and `.pdf` are refused on the extension**, at `docx.ts:115` inside
`safeDisplayName`, called from the first statement of `parseDocx` (`docx.ts:641`). The
file is never opened, so this measurement says nothing about whether either file's
contents could be read. `stageSelectedManuscript` adds no separate format gate of its own
(`src/service/store.ts:3589`), so `parseDocx` is the entire intake boundary today.
