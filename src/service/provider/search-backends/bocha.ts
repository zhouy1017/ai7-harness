import { isRecord } from '../../analysis/canonical.js';
import { createBackend, resultsOf } from './common.js';

/** A known account rejection, not a generic403 or an inference from arbitrary error prose. */
export function bochaAccountQuotaRejected(status: number, body: string): boolean {
  if (status !== 403) return false;
  try {
    const value: unknown = JSON.parse(body);
    return isRecord(value) && (value['code'] === '403' || value['code'] === 403) &&
      value['message'] === 'You do not have enough money or package quota';
  } catch { return false; }
}

export const bochaBackend = createBackend('search-bochaai', (declaration, query, count) => ({
  url: declaration.endpoint!, method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ query, freshness: 'noLimit', summary: false, count }),
}), (json) => {
  const data = isRecord(json['data']) ? json['data'] : json;
  return isRecord(data['webPages']) ? resultsOf(data['webPages']['value'], 'name') : json['code'] === 200 ? [] : null;
});
