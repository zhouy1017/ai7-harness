import { initializeTechnicalLayer } from '../../src/renderer/technical-layer.js';

// Existing renderer fixtures describe the initialized development channel. Cold-start tests import a fresh module.
initializeTechnicalLayer('source-checkout', { getItem: () => null }, 'development-ci');
