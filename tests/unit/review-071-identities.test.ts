import { expect, it } from 'vitest';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';

// Captured from 1654f386 (0.7.1); the contract, reducer and built-in category bytes are unchanged.
// These are persisted category identities, never fixture fingerprints.
const BASE_071 = {
  "typos-and-usage": [
    "80edf1ae6ed2c67ab66729e2f082e5d59fb72a49ce63cf471f9de71f0a7b4b8b",
    "ad475a03e59496dd789dc536edda359dbaa66d4f461dfff54cbd69043c87ca03"
  ],
  "style-and-format": [
    "9b29a77c682038e76def5aab2fb0945a4bdb918d5391817177567c2d8f22731c",
    "a42910f53735fa06acbf032a1f9a43d24d26f31d1ab247a2140d94ec64b20ed6"
  ],
  "plot-consistency": [
    "8dfdde0eb32f7f05fda89d6583e7d9375ed36c402fe7ee245b80de9e377b6c56",
    "a42910f53735fa06acbf032a1f9a43d24d26f31d1ab247a2140d94ec64b20ed6"
  ],
  "academic-integrity": [
    "5fca31d9292d67039c8b887c4c38afa11d544f759b8e5c41eee9362edb12cc5d",
    "ad475a03e59496dd789dc536edda359dbaa66d4f461dfff54cbd69043c87ca03"
  ],
  "publication-risk": [
    "b4ea4bef63037091dc14a6c0bb1d45c0c822d1a85f0f9b073fb50e130c40c7de",
    "ad475a03e59496dd789dc536edda359dbaa66d4f461dfff54cbd69043c87ca03"
  ],
  "literary-expression": [
    "5590736d83c7fba54f086b72ba5b7f826a6837e4105d76b79e42f5daf7cf7e56",
    "ad475a03e59496dd789dc536edda359dbaa66d4f461dfff54cbd69043c87ca03"
  ]
} as const;

it('keeps the existing 0.7.1 review contract and reducer descriptor digests (#1433)', () => {
  for (const [categoryId, expected] of Object.entries(BASE_071)) {
    const category = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find(category => category.categoryId === categoryId)!;
    const kind = reviewCategoryKindDefinition(reviewCategoryContractInput(category));
    expect([kind.promptContractDigest, kind.reducerDigest], categoryId).toEqual(expected);
  }
});
