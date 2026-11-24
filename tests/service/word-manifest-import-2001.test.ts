import { WORD_MANIFEST_CASES, registerWordManifestCases } from '../support/word-manifest.js';

// The two modes share one 2,001-edit recipe and execute sequentially in the same worker.
registerWordManifestCases(WORD_MANIFEST_CASES.filter((entry) => entry.count === 2_001));
