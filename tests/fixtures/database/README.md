# SampleBook review compatibility

`sample1-review-071.ai7db` was made with the exact service implementation at `1654f386342374e9b67b5fe51390dc8f0cb2c0e7` (0.7.1, schema 115). It contains only imported `SampleBooks/sample1.docx`, authored fixture answers and synthetic connection references; it contains no enrolled credential or live response. One Book has a settled review and its archived report; the other has a paused review. Neither Run has a synthesis member.

The service tests import this package through public replacement and merge operations, verify the original report against its stored canonical shape, and resume the paused Run without adding synthesis. The package has no pinned file fingerprint.

To deliberately regenerate it with the historical sources, set `AI7_REGENERATE_REVIEW_071_FIXTURE=1` and run `node tools/generate-review-071-compatibility.mjs` from the checkout root. The generator bundles that commit's source through Git and uses the captured ordinary transport with authored SampleBook answers; it never calls a provider.
