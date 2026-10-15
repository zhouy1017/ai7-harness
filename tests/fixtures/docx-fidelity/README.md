# Edited DOCX corpus (#814)

`builder.ts` defines two sources and `classification.json` checks in every pair's expected classification. Each source is paired with unchanged, edited and mark-exported output in `tests/service/docx-fidelity.test.ts`. The builder and the product exporter materialize the six pairs only in disposable test roots. No sample1 excerpt, export, private text or deliverable is checked in.

The synthetic source uses container tokens; the other composes spans of exact admitted `SampleBooks/sample1.docx` at test time through the existing composed-fixture owner. Both have three distinct run-property sets in one paragraph, an image and a retained text box on that same anchor, footnote/endnote references and parts, simple/complex fields, imported comments/tracked changes, a table, numbering, page setup, headers/footers and a style sheet.

`preserved` requires byte-identical retained ZIP-part payloads. `rebuilt` requires the output's text digests, source properties and element relationships to satisfy the retained-content contract; it does not promise byte-identical `document.xml` or identical layout. A class that fails its output invariants is `lost` and fails the suite. Intentional exclusions require both the named expectation and an actual export disclosure; #874 owns the remaining edited formatting and computed-field limitations. Rebuilt drawings, boxes and note references remain on the source paragraph, at its end; this placement is disclosed.

All assertions report identities, counts, digests and classifications. Corpus success is bounded engineering evidence, not an editorial-quality or full-fidelity claim.
