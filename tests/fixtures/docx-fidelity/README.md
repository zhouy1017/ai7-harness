# Edited DOCX corpus (#814)

`builder.ts` defines two sources and `classification.json` checks in every pair's expected classification and its expected disclosure. Each source is paired with unchanged, edited and mark-exported output in `tests/service/docx-fidelity.test.ts`. The builder and the product exporter materialize the six pairs only in disposable test roots. No sample1 excerpt, export, private text or deliverable is checked in.

The synthetic source uses container tokens; the other composes spans of exact admitted `SampleBooks/sample1.docx` at test time through the existing composed-fixture owner. Both have three distinct run-property sets in one paragraph with an image between two of its runs, a retained text box and footnote/endnote references closing that paragraph, note parts, simple/complex fields, imported comments/tracked changes, a table, numbering, page setup, headers/footers and a style sheet.

`preserved` requires byte-identical retained ZIP-part payloads. `rebuilt` requires the output's text digests, source properties and element relationships to satisfy the retained-content contract; it does not promise byte-identical `document.xml` or identical layout. A class that fails its output invariants is `lost` and fails the suite. Intentional exclusions require both the named expectation and an actual export disclosure; #874 owns the remaining edited formatting and computed-field limitations. A rebuilt paragraph writes its drawings, boxes and note references at its end: one that had text after it is reported moved (降级导出, with its paragraph), one already at the end is not.

The disclosure each pair pins — the retention lists and the summary line 导出 shows before the approval and the receipt repeats — is identical for both sources, since it names classes, counts and parts only.

All assertions report identities, counts, digests and classifications. Corpus success is bounded engineering evidence, not an editorial-quality or full-fidelity claim.
