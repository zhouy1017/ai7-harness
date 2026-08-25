import { SERVICE_PROTOCOL_VERSION, type ServiceReadiness } from '../shared/protocol.js';
import { installNodeNetworkDenial } from '../shared/network-denial.js';

function requireDormant(condition: unknown): asserts condition {
  if (!condition) throw new Error('DORMANT_HARNESS_COMPOSITION_INVALID');
}

export interface DormantHarnessRuntime {
  readonly readiness: ServiceReadiness;
  dispose(): Promise<void>;
}

/** Mount only the six public provider-free services used by this tracer; no Agent or Session is created. */
export async function mountDormantHarness(): Promise<DormantHarnessRuntime> {
  installNodeNetworkDenial();
  requireDormant(
    process.versions.electron === '43.4.1' && process.versions.node === '24.18.1' && process.versions.modules === '148',
  );
  const [cordis, agent, sessions, llm, prompt, tools, loop] = await Promise.all([
    import('@deepseek-ai/cordis'),
    import('@deepseek-ai/dsh-agent'),
    import('@deepseek-ai/dsh-session'),
    import('@deepseek-ai/dsh-llm'),
    import('@deepseek-ai/dsh-system-prompt'),
    import('@deepseek-ai/dsh-tools'),
    import('@deepseek-ai/dsh-agent-loop'),
  ]);
  const context = new cordis.Context();
  try {
    await context.plugin(agent.AgentRegistry);
    await context.plugin(sessions.SessionStore);
    await context.plugin(llm.LlmRuntime);
    await context.plugin(prompt.SystemPrompt, {
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      persona: '',
    });
    await context.plugin(tools.ToolRuntime, { mode: 'native', maxParallelSubCalls: 1 });
    await context.plugin(loop.AgentLoop, { maxParallelToolCalls: 1, agents: [] });

    const requiredServices = ['agents', 'sessions', 'llm', 'systemPrompt', 'tools', 'agentLoop'] as const;
    const absentServices = ['approval', 'attachments', 'codeRuntime', 'sessionPersistence', 'settings', 'typert'] as const;
    const lifecycleReady = requiredServices.every((name) => context.get(name) !== undefined);
    const excludedServicesAbsent = absentServices.every((name) => context.get(name) === undefined);
    const assembly = await context.systemPrompt.assemble();
    const renderedPrompt = prompt.renderPrompt(assembly);
    const renderedRuntimeContext = prompt.renderContextSnapshot(assembly);
    const facts = {
      configuredAgents: context.agentLoop.config.agents.length,
      agents: context.agents.list().length,
      sessions: context.sessions.list().length,
      providers: context.llm.listProviders().length,
      configurableProviders: context.llm.listConfigurableProviders().length,
      tools: context.tools.schemas().length,
      assembledTools: assembly.tools.length,
      renderedPrompt,
      renderedRuntimeContext,
    };
    requireDormant(
      lifecycleReady &&
        excludedServicesAbsent &&
        context.registry.has(agent.AgentRegistry) &&
        context.registry.has(sessions.SessionStore) &&
        context.registry.has(llm.LlmRuntime) &&
        context.registry.has(prompt.SystemPrompt) &&
        context.registry.has(tools.ToolRuntime) &&
        context.registry.has(loop.AgentLoop) &&
        facts.configuredAgents === 0 &&
        facts.agents === 0 &&
        facts.sessions === 0 &&
        facts.providers === 0 &&
        facts.configurableProviders === 0 &&
        facts.tools === 0 &&
        facts.assembledTools === 0 &&
        facts.renderedPrompt === '' &&
        facts.renderedRuntimeContext === '',
    );

    let disposal: Promise<void> | undefined;
    return {
      readiness: {
        protocolVersion: SERVICE_PROTOCOL_VERSION,
        state: 'ready',
        runtime: {
          electron: '43.4.1',
          node: '24.18.1',
          modules: '148',
        },
        harness: {
          state: 'mounted-dormant',
          executionReady: false,
          providerFree: true,
          services: 6,
          serviceSet: requiredServices,
          configuredAgents: 0,
          agents: 0,
          sessions: 0,
          providers: 0,
          configurableProviders: 0,
          tools: 0,
          assembledTools: 0,
          renderedPrompt: '',
          renderedRuntimeContext: '',
        },
      },
      dispose: () => (disposal ??= context.fiber.dispose()),
    };
  } catch (error) {
    await context.fiber.dispose();
    throw error;
  }
}
