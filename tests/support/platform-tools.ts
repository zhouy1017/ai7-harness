import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { WEBFETCH_MAX_BYTES, WEBFETCH_TIMEOUT_SECONDS, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';

/** Legacy anonymous-wire tests consume the backend registry, independent of retired policy documents. */
export function anonymousPlatformTools(): PlatformToolsRule {
  const backend = SEARCH_BACKENDS.find((entry) => entry.id === 'search-parallel')!;
  const anonymous = backend.anonymous!;
  return { websearch: { service: backend.service, host: anonymous.host, tool: anonymous.tool, anonymous: true },
    webfetch: { maxBytes: WEBFETCH_MAX_BYTES, timeoutSeconds: WEBFETCH_TIMEOUT_SECONDS, boundedByCitations: true } };
}
