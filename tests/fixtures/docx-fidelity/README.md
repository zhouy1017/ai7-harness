# Edited DOCX corpus (#814)

`builder.ts` defines two sources and `classification.json` checks in every pair's expected classification and its expected disclosure. Each source is paired with unchanged, edited and mark-exported output in `tests/service/docx-fidelity.test.ts`. The builder and the product exporter materialize the six pairs only in disposable test roots. No sample1 excerpt, export, private text or deliverable is checked in.

The synthetic source uses container tokens; the other composes spans of exact admitted `SampleBooks/sample1.docx` at test time through the existing composed-fixture owner. Both have three distinct run-property sets in one paragraph with an image between two of its runs, a retained text box and footnote/endnote references closing that paragraph, note parts, simple/complex fields, imported comments/tracked changes, a table, numbering, page setup, headers/footers and a style sheet.

`preserved` requires byte-identical retained ZIP-part payloads. `rebuilt` requires the output's text digests, source properties and element relationships to satisfy the retained-content contract; it does not promise byte-identical `document.xml` or identical layout. A class that fails its output invariants is `lost` and fails the suite. Intentional exclusions require both the named expectation and an actual export disclosure; #874 owns the remaining edited formatting and computed-field limitations. A rebuilt paragraph writes its drawings, boxes and note references at its end: one that had text after it is reported moved (降级导出, with its paragraph), one already at the end is not.

The disclosure each pair pins — the retention lists and the summary line 导出 shows before the approval and the receipt repeats — is identical for both sources, since it names classes, counts and parts only.

All assertions report identities, counts, digests and classifications. Corpus success is bounded engineering evidence, not an editorial-quality or full-fidelity claim.

Issue #1132 adds `buildWordProfileRecipe` and the separate `wordTrackedProfile` classifications. Authored synthetic tokens exercise replacement, paragraph joins, named moves with distinct range IDs, both empty-reading cases and whole-group normalization. The existing six corpus pairs and their expectations stay intact. The new recipes run through the real successor compiler, graph, ordered mapping and selected-reading writer in the existing unit suites; joins regenerate projected paragraph properties rather than choosing one original paragraph's style.

`wordParagraphMoveBody` supplies complete paired ranges with distinct source/destination IDs and a final destination paragraph. Mixed paragraph marks and moved runs retain one actual text move; the marks-only counterfactual preserves both readings with exact no-visible-transition evidence and no sample. Both use the compiler-to-mapping-to-export chain for unchanged, edited and mark-exported output.

This is Phase A engineering evidence. Real-store capture/current eligibility, atomic commit, bounded public detail inspection, migration/merge and Electron Journeys require the held Phase B integration and its exact-head validation. These classifications do not close the first child or whole F07/F11.
