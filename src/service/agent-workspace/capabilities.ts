import { WORKSPACE_SERVICE_WORDS } from './agent-workspace-labels.js';
import type { AgentWorkspaceCapabilityProjection } from '../../shared/protocol.js';
import { describeComposition, type CompositionOptions, type HarnessCompositionDescriptor } from '../harness/primary-agent-harness.js';
import type { ExecutionRoute } from '../provider/egress-gate.js';
import { AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST } from '../dialogue/contract.js';

/**
 * The Agent 工作区's capability declaration (Issue #90, wave 13 slice 13a; ADR 0045 incl. Revision 2, ADR 0017, UI ADR 0015,
 * HARNESS-INTEGRATION §capability seam): everything the Book-bound workspace may do, in one inspectable place. It reads no
 * file, runs no shell, reaches no network of its own and applies nothing: its one model step is a dialogue turn on the route
 * the selected policy already admits for the dialogue, and what that turn proposes reaches the manuscript only through the
 * existing Mark Cards and the one AI7 Apply. The scope kinds it may name are exactly the two current-Book kinds Revision 2 of
 * the editorial workspace profile's authority sidecar makes eligible — and a pin of that revision is what opens the workspace.
 *
 * The declaration is enforced structurally, not by this object: the composition below registers no tool (`registeredTools`
 * is 0, no platform or local tools are attached), the workspace module imports no filesystem, process or network module, and
 * its promotion writes marks only through the produced-mark path. The unit suite holds each of these to the declaration.
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
 * The composition options of a workspace turn: the Session log the dialogue keeps, and nothing else — no platform tools and
 * no local tools, so the tool registry stays empty.
 */
export const AGENT_WORKSPACE_COMPOSITION_OPTIONS: CompositionOptions = Object.freeze({ sessionLog: true });

/** The composition a workspace turn runs in on one route and model: the dialogue's, under the workspace contract. */
export function agentWorkspaceComposition(route: ExecutionRoute, model: string): HarnessCompositionDescriptor {
  return describeComposition(route, model, AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST, AGENT_WORKSPACE_COMPOSITION_OPTIONS);
}
