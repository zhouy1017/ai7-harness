import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import dnsPromises from 'node:dns/promises';
import { SERVICE_PROTOCOL_VERSION, type ServiceReadiness } from '../shared/protocol.js';

const NETWORK_DENIED_CODE = 'AI7_OUTBOUND_NETWORK_DENIED';
let networkDenialInstalled = false;

class OutboundNetworkDeniedError extends Error {
  readonly code = NETWORK_DENIED_CODE;

  constructor() {
    super('Outbound network is disabled for the provider-free J-01 product interval.');
    this.name = 'OutboundNetworkDeniedError';
  }
}

function denyNetwork(): never {
  throw new OutboundNetworkDeniedError();
}

function denyFetch(): Promise<never> {
  return Promise.reject(new OutboundNetworkDeniedError());
}

function replaceCallable(target: object, key: PropertyKey, value: (...args: never[]) => unknown): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor || !('value' in descriptor)) return;
  Object.defineProperty(target, key, { ...descriptor, configurable: false, writable: false, value });
}

function replaceConstructor(target: object, key: PropertyKey): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function') return;
  const denied = new Proxy(descriptor.value as new (...args: never[]) => unknown, {
    apply: denyNetwork,
    construct: denyNetwork,
  });
  Object.defineProperty(target, key, { ...descriptor, configurable: false, writable: false, value: denied });
}

/** Install before any Harness package is evaluated so no dependency can retain a live network primitive. */
export function installServiceNetworkDenial(): void {
  if (networkDenialInstalled) return;
  networkDenialInstalled = true;

  replaceCallable(http, 'request', denyNetwork);
  replaceCallable(http, 'get', denyNetwork);
  replaceCallable(http, 'createServer', denyNetwork);
  replaceConstructor(http, 'ClientRequest');
  replaceCallable(http.Agent.prototype, 'createConnection', denyNetwork);
  replaceCallable(https, 'request', denyNetwork);
  replaceCallable(https, 'get', denyNetwork);
  replaceCallable(https, 'createServer', denyNetwork);
  replaceCallable(https.Agent.prototype, 'createConnection', denyNetwork);
  replaceCallable(http2, 'connect', denyNetwork);
  replaceCallable(http2, 'createServer', denyNetwork);
  replaceCallable(http2, 'createSecureServer', denyNetwork);
  replaceCallable(net, 'connect', denyNetwork);
  replaceCallable(net, 'createConnection', denyNetwork);
  replaceCallable(net, 'createServer', denyNetwork);
  replaceCallable(net.Socket.prototype, 'connect', denyNetwork);
  replaceCallable(net.Server.prototype, 'listen', denyNetwork);
  replaceCallable(tls, 'connect', denyNetwork);
  replaceCallable(tls, 'createServer', denyNetwork);
  replaceCallable(tls.TLSSocket.prototype, 'connect', denyNetwork);
  replaceCallable(dgram, 'createSocket', denyNetwork);
  replaceCallable(dgram.Socket.prototype, 'bind', denyNetwork);
  replaceCallable(dgram.Socket.prototype, 'connect', denyNetwork);
  replaceCallable(dgram.Socket.prototype, 'send', denyNetwork);

  for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'] as const) {
    replaceCallable(dns, key, denyNetwork);
    replaceCallable(dnsPromises, key, denyNetwork);
  }
  for (const key of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'] as const) {
    replaceCallable(dns.Resolver.prototype, key, denyNetwork);
    replaceCallable(dnsPromises.Resolver.prototype, key, denyNetwork);
  }

  Object.defineProperty(globalThis, 'fetch', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: denyFetch,
  });
  replaceConstructor(globalThis, 'WebSocket');
  replaceConstructor(globalThis, 'EventSource');
  syncBuiltinESMExports();
}

function requireDormant(condition: unknown): asserts condition {
  if (!condition) throw new Error('DORMANT_HARNESS_COMPOSITION_INVALID');
}

export interface DormantHarnessRuntime {
  readonly readiness: ServiceReadiness;
  dispose(): Promise<void>;
}

/** Mount only the six public provider-free services used by this tracer; no Agent or Session is created. */
export async function mountDormantHarness(): Promise<DormantHarnessRuntime> {
  installServiceNetworkDenial();
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
