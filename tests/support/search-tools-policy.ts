import { fileURLToPath } from 'node:url';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { ruleFor } from './policy-rules.js';

const policy = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../..', import.meta.url)), 'developer-live');
if (policy.integrityState !== 'verified' || policy.providerProcessing.version !== 'v18') throw new Error('SEARCH_TOOLS_POLICY_NOT_VERIFIED');

/** A fresh copy of the actual selected v18 research projection for adversarial adapter/gate tests. */
export function searchToolsRule() { return structuredClone(ruleFor(policy, 'factual-review')); }
