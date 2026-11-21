import { WORD_MANIFEST_CASES, registerWordManifestCases } from '../support/word-manifest.js';

// The 2001-edit Word manifest case in 'accepted-baseline' mode (#1621; the shared body is tests/support/word-manifest.ts).
registerWordManifestCases(WORD_MANIFEST_CASES.filter((entry) => entry.count === 2_001 && entry.mode === 'accepted-baseline'));
