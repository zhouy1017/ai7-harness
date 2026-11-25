# Database fixtures

## `revision-116-schema.json`

The shape of a store at revision 116 (#1634; ADR 0105 §4): `user_version` and every `sqlite_schema` row, written by `node tools/schema-dump.mjs` over a store the code at `1bc1e3ea16c51539934630ae23574352be856e4e` built on an empty Agent Data Root. The admitted `sample1-review-071.ai7db` store, opened and migrated to 116 by the same code, dumps byte for byte the same. It holds shape only — no row, no digest — and is never edited by hand.

`tests/unit/baseline-schema.test.ts` diffs the revision-117 baseline against it. The only differences it admits are the revision, the trigger text the one append-only helper now writes (same name, table, condition and message), and the objects a storage-train slice names in that test's `INTENDED_DELTA`.

## `sample1-review-071.ai7db`

It was made with the exact service implementation at `1654f386342374e9b67b5fe51390dc8f0cb2c0e7` (0.7.1, schema 115). It contains only imported `SampleBooks/sample1.docx`, authored fixture answers and synthetic connection references; it contains no enrolled credential or live response. One Book has a settled review and its archived report; the other has a paused review. Neither Run has a synthesis member.

Since the storage baseline (#1634), a 0.7.1 store is below the oldest version the upgrade tool converts (0.7.2). The suites therefore read it only as it lies:
- `tests/service/baseline-open.test.ts` unpacks it into an Agent Data Root and expects the open to refuse it with its files unchanged.
- `tests/service/store-inventory.test.ts` counts it without opening it.

Its earlier compatibility cases — the settled report verified against its stored shape, and the paused Run resumed without synthesis — move to the upgrade tool (R5-6) and the 0.7.9 acceptance (R5-7), on real 0.7.2-or-later stores built from `SampleBooks/`. The package has no pinned file fingerprint.

> Owner 2026-11-24：本轮作为 0.7.9 交付，0.8.0 待 Owner 额外审阅后再定

To deliberately regenerate it with the historical sources, set `AI7_REGENERATE_REVIEW_071_FIXTURE=1` and run `node tools/generate-review-071-compatibility.mjs` from the checkout root. The generator bundles that commit's source through Git and uses the captured ordinary transport with authored SampleBook answers; it never calls a provider.
