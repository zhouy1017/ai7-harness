import tinyfishDocument from '../../../../config/providers/search-backends/search-tinyfish.json' with { type: 'json' };
import deepseekDocument from '../../../../config/providers/search-backends/search-deepseek.json' with { type: 'json' };
import braveDocument from '../../../../config/providers/search-backends/search-brave.json' with { type: 'json' };
import parallelDocument from '../../../../config/providers/search-backends/search-parallel.json' with { type: 'json' };
import bochaDocument from '../../../../config/providers/search-backends/search-bochaai.json' with { type: 'json' };
import { canonicalJson, sha256Hex } from '../../analysis/canonical.js';
import { SEARCH_BACKENDS, SEARCH_BACKEND_EVALUATION, searchBackendCandidate } from '../search-backends.js';
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

const documents: ReadonlyArray<Record<string, unknown>> = [tinyfishDocument, deepseekDocument, braveDocument, parallelDocument, bochaDocument];

/** The legacy digest of one document: every field but the one candidate namespace, with the measured profile and its revision. */
export function legacyConfigurationDigestOf(document: Record<string, unknown>, profile: unknown): string {
  const { candidate: _candidate, ...legacy } = document;
  return sha256Hex(canonicalJson({ document: legacy, profileRevision: SEARCH_BACKEND_EVALUATION.measuredOn, profile }));
}

/** The candidate's own digest (Issue #1055): its backend id and its namespace alone, so a revision changes it and nothing else. */
export function candidateConfigurationDigestOf(document: Record<string, unknown>): string {
  return sha256Hex(canonicalJson({ backendId: document['backendId'], candidate: document['candidate'] }));
}

export function searchBackendConfigurationDigest(id: string): string {
  searchBackend(id);
  return legacyConfigurationDigestOf(documents.find((entry) => entry['backendId'] === id)!, SEARCH_BACKENDS.find((entry) => entry.id === id)!.profile);
}

export function searchBackendCandidateConfigurationDigest(backendId: string, candidateId: string): string {
  searchBackendCandidate(backendId, candidateId);
  return candidateConfigurationDigestOf(documents.find((entry) => entry['backendId'] === backendId)!);
}
