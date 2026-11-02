import { WORKSPACE_SERVICE_WORDS } from './agent-workspace-labels.js';
import type { AgentWorkspaceCapabilityProjection } from '../../shared/protocol.js';
import { describeComposition, type CompositionOptions, type HarnessCompositionDescriptor } from '../harness/primary-agent-harness.js';
import type { ExecutionRoute } from '../provider/egress-gate.js';
import { AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST } from '../dialogue/contract.js';

/** Book-local retrieval and model streaming use the admitted dialogue owner. The workspace itself has no independent
 * filesystem, shell, network or Apply capability; submitting proposals creates independently decidable manuscript marks.
 */
export const AGENT_WORKSPACE_CAPABILITIES: AgentWorkspaceCapabilityProjection = Object.freeze({
  filesystem: false,
  shell: false,
  network: false,
  apply: false,
  scopes: Object.freeze(['current-book-primary-manuscript-revision', 'current-book-source-version'] as const),
  safetyLabel: WORKSPACE_SERVICE_WORDS.safety,
});

/**
 * The fallback composition for retained no-tool fixtures. Admitted live routes add the dialogue retrieval tools.
 */
export const AGENT_WORKSPACE_COMPOSITION_OPTIONS: CompositionOptions = Object.freeze({ sessionLog: true });

/** The composition a workspace turn runs in on one route and model: the dialogue's, under the workspace contract. */
export function agentWorkspaceComposition(route: ExecutionRoute, model: string): HarnessCompositionDescriptor {
  return describeComposition(route, model, AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST, AGENT_WORKSPACE_COMPOSITION_OPTIONS);
}
