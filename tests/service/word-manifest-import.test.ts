import { WORD_MANIFEST_CASES, registerWordManifestCases } from '../support/word-manifest.js';

// The 201-edit Word manifest cases, both modes (#1621; the shared body is tests/support/word-manifest.ts).
registerWordManifestCases(WORD_MANIFEST_CASES.filter((entry) => entry.count === 201));
