import tinyfishDocument from '../../../../config/providers/search-backends/search-tinyfish.json' with { type: 'json' };
import deepseekDocument from '../../../../config/providers/search-backends/search-deepseek.json' with { type: 'json' };
import braveDocument from '../../../../config/providers/search-backends/search-brave.json' with { type: 'json' };
import parallelDocument from '../../../../config/providers/search-backends/search-parallel.json' with { type: 'json' };
import bochaDocument from '../../../../config/providers/search-backends/search-bochaai.json' with { type: 'json' };
import { canonicalJson, sha256Hex } from '../../analysis/canonical.js';
import { SEARCH_BACKENDS, SEARCH_BACKEND_EVALUATION } from '../search-backends.js';
import type { SearchBackend } from '../search-backends.js';
import { tinyfishBackend } from './tinyfish.js';
import { deepseekBackend } from './deepseek.js';
import { braveBackend } from './brave.js';
import { parallelBackend } from './parallel.js';
import { bochaBackend } from './bocha.js';

const adapters = [tinyfishBackend, deepseekBackend, braveBackend, parallelBackend, bochaBackend];

/** Fail closed for undeclared, excluded and unknown ids at every entry point. */
export function searchBackend(id: string): SearchBackend {
  const adapter = adapters.find((entry) => entry.declaration.id === id);
  if (adapter === undefined) throw new Error('SEARCH_BACKEND_NOT_SHIPPED');
  return adapter;
}

export function searchBackendConfigurationDigest(id: string): string {
  searchBackend(id);
  const document = [tinyfishDocument, deepseekDocument, braveDocument, parallelDocument, bochaDocument].find((entry) => entry.backendId === id)!;
  return sha256Hex(canonicalJson({ document, profileRevision: SEARCH_BACKEND_EVALUATION.measuredOn, profile: SEARCH_BACKENDS.find((entry) => entry.id === id)!.profile }));
}
