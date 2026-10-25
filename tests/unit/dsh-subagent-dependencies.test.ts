import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent';
import type { GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { SubagentResult, SubagentRunEndInfo, SubagentRunInfo, SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// Issue #1158 (F18c dependency validation): a provider-free compatibility witness for the four admitted carriers
// (`@deepseek-ai/dsh-subagent`, `-in-process-driver`, `-spawn-in-process` at 0.1.0-rc.6 and `zod` 4.4.3). It composes the
// real native seam and spawn provider beside the existing six DSH services with one in-memory synthetic adapter, then shows
// that a small test-local facade can hold the native API to one-shot, same-process, depth-1, one-child-at-a-time delegation.
// The facade is a representability witness only: it is not a production wrapper, the native package keeps its broader
// continuable and per-request options, and nothing here is AI7 sub-agent policy, inherited binding, counters or selected
// fixture proof. Production still mounts no sub-agent seam. Every input is a synthetic string; request bodies are compared
// by equality and never printed.

installNodeNetworkDenial();

const ROUTE = 'f18c-synthetic-route';
const MODEL = 'f18c-synthetic-model';
const PROVIDER = 'spawn';
const SECTION = 'f18c:synthetic-complete-prompt';
const SYSTEM = '合成系统提示：只回答合成单元，不使用工具。';
const UNIT = '合成单元 1/1：请只回复“已收到”。';
const ANSWER = '已收到。';

/** Refused by the facade before the native runtime is asked for anything. */
class FacadeRefusal extends Error {
  constructor(readonly reason: string) {
    super(`facade refused: ${reason}`);
    this.name = 'FacadeRefusal';
  }
}

/** Exactly one synthetic unit and its cancellation; every other field, including any native start option, is refused. */
function acceptUnit(input: unknown): { readonly unit: string; readonly signal: AbortSignal } {
  if (typeof input !== 'object' || input === null || Object.getPrototypeOf(input) !== Object.prototype) throw new FacadeRefusal('not a plain request');
  const extra = Reflect.ownKeys(input).filter((key) => key !== 'unit' && key !== 'signal');
  if (extra.length > 0) throw new FacadeRefusal(`unsupported field ${String(extra[0])}`);
  const unit: unknown = Reflect.get(input, 'unit');
  const signal: unknown = Reflect.get(input, 'signal');
  if (typeof unit !== 'string' || unit.length === 0) throw new FacadeRefusal('unit');
  if (!(signal instanceof AbortSignal)) throw new FacadeRefusal('signal');
  return { unit, signal };
}

/**
 * The closed test-local facade: the fixed spawn provider, the fixed top-level parent (whose route, model and complete
 * prompt are composition configuration), the native depth cap of 1, and one child at a time — the slot reopens only after
 * the native run's awaited disposal, not when its result settles.
 */
class OneShotUnitFacade {
  readonly #runtime: SubagentRuntime;
  readonly #parent: Agent;
  #occupied = false;

  constructor(runtime: SubagentRuntime, parent: Agent) {
    this.#runtime = runtime;
    this.#parent = parent;
  }

  async run(input: unknown): Promise<SubagentResult> {
    if (this.#occupied) throw new FacadeRefusal('a child is still active');
    const request = acceptUnit(input);
    this.#occupied = true;
    try {
      const run = await this.#runtime.start(PROVIDER, { prompt: [{ type: 'text', text: request.unit }], parent: this.#parent, signal: request.signal, maxDepth: 1 });
      try {
        return await run.result;
      } finally {
        await run.dispose();
      }
    } finally {
      this.#occupied = false;
    }
  }
}

/** The one in-memory model route: it records each assembled request it is handed and answers, fails, or holds until released or cancelled. */
class SyntheticAdapter implements LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  mode: 'answer' | 'fail' | 'hold' = 'answer';
  #started: (() => void) | null = null;
  #release: (() => void) | null = null;

  whenStarted(): Promise<void> {
    return new Promise((resolve) => { this.#started = resolve; });
  }

  release(): void {
    this.#release?.();
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'F18c 合成适配器' };
  }

  providerRetryPolicy(): undefined {
    return undefined;
  }

  listModels(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: 'F18c 合成模型', inputModalities: ['text'] });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    this.#started?.();
    this.#started = null;
    if (this.mode === 'fail') {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'F18C_SYNTHETIC_FAILURE', message: '合成失败。' } } };
      return;
    }
    if (this.mode === 'hold') {
      await new Promise<void>((resolve) => {
        this.#release = resolve;
        if (options.signal?.aborted === true) resolve();
        options.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      this.#release = null;
      if (options.signal?.aborted === true) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'F18C_SYNTHETIC_ABORTED', message: '合成请求已取消。' } } };
        return;
      }
    }
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: ANSWER };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: ANSWER } };
    yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

interface ObservedChild {
  readonly info: SubagentRunInfo;
  readonly parentSession: string | undefined;
  readonly origin: string | undefined;
  readonly delegationDepth: number | undefined;
  readonly options: Record<string, unknown>;
}

interface Composition {
  readonly context: Context;
  readonly parent: AgentHandle;
  readonly runtime: SubagentRuntime;
  readonly facade: OneShotUnitFacade;
  readonly adapter: SyntheticAdapter;
  readonly started: ObservedChild[];
  readonly ended: SubagentRunEndInfo[];
  /** Called when a run's result settles (`subagent/end`), before its disposal begins. */
  onEnd: (() => void) | null;
  /** Called while a child is being disposed (`agent/disposed`), after its result settled. */
  onChildDisposed: (() => void) | null;
  readonly modules: { readonly prompt: typeof import('@deepseek-ai/dsh-system-prompt'); readonly subagent: typeof import('@deepseek-ai/dsh-subagent');
    readonly driver: typeof import('@deepseek-ai/dsh-subagent-in-process-driver') };
}

/** The existing six services as the harness configures them, then the seam and the spawn provider; every module loads after the denial. */
async function compose(): Promise<Composition> {
  const [cordis, agent, sessions, llm, prompt, tools, loop, subagent, driver, spawn] = await Promise.all([
    import('@deepseek-ai/cordis'),
    import('@deepseek-ai/dsh-agent'),
    import('@deepseek-ai/dsh-session'),
    import('@deepseek-ai/dsh-llm'),
    import('@deepseek-ai/dsh-system-prompt'),
    import('@deepseek-ai/dsh-tools'),
    import('@deepseek-ai/dsh-agent-loop'),
    import('@deepseek-ai/dsh-subagent'),
    import('@deepseek-ai/dsh-subagent-in-process-driver'),
    import('@deepseek-ai/dsh-subagent-spawn-in-process'),
  ]);
  const context: Context = new cordis.Context();
  try {
    await context.plugin(agent.AgentRegistry);
    await context.plugin(sessions.SessionStore);
    await context.plugin(llm.LlmRuntime);
    await context.plugin(prompt.SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false, persona: '' });
    await context.plugin(tools.ToolRuntime, { mode: 'native', maxParallelSubCalls: 1 });
    await context.plugin(loop.AgentLoop, { maxParallelToolCalls: 1, agents: [] });
    await context.plugin(subagent.SubagentRuntime);
    await context.plugin(spawn, { providerName: PROVIDER });
    context.systemPrompt.suppressRuntimeContext();
    context.systemPrompt.section({ name: SECTION, order: 0, text: SYSTEM, complete: true });
    const adapter = new SyntheticAdapter();
    context.llm.registerAdapter([ROUTE], adapter);
    const parent = await context.agents.create({ sessionId: sessions.SessionId(randomUUID()), agentOptions: { provider: ROUTE, model: MODEL } });
    const composition: Composition = {
      context, parent, runtime: context.subagents, facade: new OneShotUnitFacade(context.subagents, parent.agent), adapter,
      started: [], ended: [], onEnd: null, onChildDisposed: null, modules: { prompt, subagent, driver },
    };
    context.on('agent/disposed', ({ agent: disposed }) => {
      if (disposed.id !== parent.agent.id) composition.onChildDisposed?.();
    });
    parent.agent.ctx.on('subagent/start', (info) => {
      const child = context.agents.get(info.id);
      composition.started.push({
        info,
        parentSession: child?.session.header.parentSession,
        origin: child?.session.header.origin,
        delegationDepth: child?.session.header.delegationDepth,
        options: { ...child?.options },
      });
    });
    parent.agent.ctx.on('subagent/end', (info) => {
      composition.ended.push(info);
      composition.onEnd?.();
    });
    return composition;
  } catch (error) {
    await context.fiber.dispose();
    throw error;
  }
}

async function close(composition: Composition): Promise<void> {
  try {
    await composition.parent.dispose();
  } finally {
    await composition.context.fiber.dispose();
  }
}

/** The request's model-facing shape without any of its text. */
function payloadShape(options: GenerateOptions): Record<string, unknown> {
  return {
    provider: options.provider,
    model: options.model,
    maxTokens: options.maxTokens ?? null,
    reasoningEffort: options.reasoningEffort ?? null,
    temperature: options.temperature ?? null,
    stop: options.stop ?? null,
    purpose: options.purpose ?? null,
    tools: (options.tools ?? []).map((tool) => tool.name),
    messages: options.messages.map((message) => ({ role: message.role, source: message.source.kind, blocks: message.content.map((block) => block.type) })),
  };
}

/** Every model-facing text the request carries, in order: the system slot, then each text block. */
function payloadTexts(options: GenerateOptions): (string | null)[] {
  return [options.system ?? null, ...options.messages.flatMap((message) => message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])))];
}

/** Only the parent remains: no child agent or Session survives a settled, disposed run. */
function expectOnlyParent(composition: Composition): void {
  expect(composition.context.agents.list().map((agent) => agent.id)).toEqual([composition.parent.agent.id]);
  expect(composition.context.sessions.list().map((session) => session.id)).toEqual([composition.parent.agent.id]);
}

const unit = (signal: AbortSignal = new AbortController().signal): { unit: string; signal: AbortSignal } => ({ unit: UNIT, signal });

describe('the admitted DSH sub-agent packages (provider-free dependency compatibility, not product or fixture proof)', () => {
  it('compose beside the six existing services with zero tools, one synthetic route and the complete prompt, and keep their native breadth', async () => {
    const composition = await compose();
    try {
      const { context, runtime, modules } = composition;
      expect(context.llm.listProviders().map((provider) => provider.id)).toEqual([ROUTE]);
      expect(context.tools.schemas()).toEqual([]);
      const assembly = await context.systemPrompt.assemble();
      expect(assembly.tools).toEqual([]);
      expect(modules.prompt.renderPrompt(assembly) === SYSTEM).toBe(true);
      expect(modules.prompt.renderContextSnapshot(assembly)).toBe('');
      expect(runtime.list()).toEqual([PROVIDER]);
      // The spawn provider natively supports every start option and the seam keeps its continuable operations: the facade,
      // not the package, is what closes them.
      expect(runtime.getProvider(PROVIDER)?.capabilities).toEqual({ outputSchema: true, depthLimit: true, toolFilter: true, persona: true });
      expect(runtime.getProvider(PROVIDER)?.inheritsParentContext).toBe(false);
      expect(typeof runtime.startContinuable).toBe('function');
      expect(typeof runtime.followup).toBe('function');
      expect(typeof modules.driver.startInProcessRun).toBe('function');
      expect(composition.adapter.requests.length).toBe(0);
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });

  it('runs one same-process depth-1 child whose single native request carries exactly the fixed prompt and unit, then disposes it', async () => {
    const composition = await compose();
    try {
      const { adapter, facade, parent, modules } = composition;
      const result = await facade.run(unit());
      expect(result.stopReason).toBe('completed');
      expect(result.output).toEqual([{ type: 'text', text: ANSWER }]);
      expect(result.structured).toBeUndefined();

      expect(composition.started.length).toBe(1);
      const child = composition.started[0]!;
      expect(child.info.local).toBe(true);
      expect(child.info.provider).toBe(PROVIDER);
      expect(child.info.id).not.toBe(parent.agent.id);
      expect([child.parentSession, child.origin, child.delegationDepth]).toEqual([parent.agent.id, 'subagent', 1]);
      expect(child.options).toEqual({ provider: ROUTE, model: MODEL, subagentDepth: 1 });
      expect(composition.ended.map((end) => [end.id, end.stopReason])).toEqual([[child.info.id, 'completed']]);

      // One submission, made by the child's own fresh Session: no parent prelude, retry or follow-up.
      expect(adapter.requests.length).toBe(1);
      const request = adapter.requests[0]!;
      expect(request.sessionId).toBe(child.info.id);
      expect(payloadShape(request)).toEqual({
        provider: ROUTE, model: MODEL, maxTokens: null, reasoningEffort: null, temperature: null, stop: null, purpose: null,
        tools: [], messages: [{ role: 'user', source: 'user', blocks: ['text'] }],
      });
      // No harness identity, clock, working directory, parent transcript, delegation statement, preset or structured-output
      // instruction reaches the model: the request's only texts are the configured prompt and the unit.
      const texts = payloadTexts(request);
      expect(texts.length).toBe(2);
      expect(texts[0] === SYSTEM).toBe(true);
      expect(texts[1] === UNIT).toBe(true);
      expect((request.tools ?? []).some((tool) => tool.name === modules.driver.STRUCTURED_OUTPUT_TOOL)).toBe(false);

      expect(composition.context.agents.get(child.info.id)).toBeUndefined();
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });

  it('refuses every widening input before the native runtime, with no adapter submission and no child', async () => {
    const composition = await compose();
    try {
      const { adapter, facade } = composition;
      const widening: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
        ['route override', { provider: 'f18c-other-route' }],
        ['model override', { model: 'f18c-other-model' }],
        ['max-token override', { maxTokens: 16 }],
        ['agent options', { agentOptions: { provider: ROUTE, model: MODEL, maxTokens: 16 } }],
        ['persona', { persona: '合成角色' }],
        ['fork seed', { seed: [] }],
        ['history', { history: [] }],
        ['tool filter', { toolFilter: { allow: [] } }],
        ['output schema', { outputSchema: { type: 'object', properties: {} } }],
        ['continuable child', { continuable: true }],
        ['follow-up', { followup: '合成追问' }],
        ['deeper spawn', { maxDepth: 2 }],
        ['another parent', { parent: null }],
        ['another provider', { providerName: 'fork' }],
        ['label', { label: '合成标签' }],
      ];
      for (const [label, extra] of widening) {
        await expect(facade.run({ ...unit(), ...extra }), label).rejects.toBeInstanceOf(FacadeRefusal);
      }
      for (const malformed of [null, [], 'unit', { unit: UNIT }, { unit: '', signal: new AbortController().signal }, { unit: 1, signal: new AbortController().signal }]) {
        await expect(facade.run(malformed)).rejects.toBeInstanceOf(FacadeRefusal);
      }
      expect(adapter.requests.length).toBe(0);
      expect(composition.started.length).toBe(0);
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });

  it('keeps a native depth cap: a cap the child would exceed rejects before publication and before any request', async () => {
    const composition = await compose();
    try {
      const { adapter, runtime, parent, modules } = composition;
      await expect(runtime.start(PROVIDER, { prompt: [{ type: 'text', text: UNIT }], parent: parent.agent, signal: new AbortController().signal, maxDepth: 0 }))
        .rejects.toBeInstanceOf(modules.subagent.SubagentDepthError);
      expect(adapter.requests.length).toBe(0);
      expect(composition.started.length).toBe(0);
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });

  it('holds one child at a time until its disposal completes, then lets a later independent one-shot proceed in a fresh Session', async () => {
    const composition = await compose();
    try {
      const { adapter, facade } = composition;
      adapter.mode = 'hold';
      const submitted = adapter.whenStarted();
      const first = facade.run(unit());
      await submitted;
      await expect(facade.run(unit())).rejects.toBeInstanceOf(FacadeRefusal);
      expect(adapter.requests.length).toBe(1);

      // The result settles before disposal finishes: a call made when it settles, and one made while the child is being
      // disposed, are both refused. A wrongly admitted call would be answered at once, so it shows up as a second request.
      let atSettlement: Promise<SubagentResult> | null = null;
      let duringDisposal: Promise<SubagentResult> | null = null;
      composition.onEnd = () => {
        atSettlement = facade.run(unit());
        atSettlement.catch(() => undefined);
      };
      composition.onChildDisposed = () => {
        duringDisposal = facade.run(unit());
        duringDisposal.catch(() => undefined);
      };
      adapter.mode = 'answer';
      adapter.release();
      expect((await first).stopReason).toBe('completed');
      composition.onEnd = null;
      composition.onChildDisposed = null;
      expect(atSettlement).not.toBeNull();
      expect(duringDisposal).not.toBeNull();
      await expect(atSettlement).rejects.toBeInstanceOf(FacadeRefusal);
      await expect(duringDisposal).rejects.toBeInstanceOf(FacadeRefusal);
      expect(adapter.requests.length).toBe(1);
      expectOnlyParent(composition);

      const later = await facade.run(unit());
      expect(later.stopReason).toBe('completed');
      expect(adapter.requests.length).toBe(2);
      const [one, two] = composition.started;
      expect(one!.info.id).not.toBe(two!.info.id);
      expect(adapter.requests[1]!.sessionId).toBe(two!.info.id);
      expect(payloadShape(adapter.requests[1]!).messages).toEqual([{ role: 'user', source: 'user', blocks: ['text'] }]);
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });

  it('settles a failed child as an error with its one request and no retry, and disposes it', async () => {
    const composition = await compose();
    try {
      const { adapter, facade } = composition;
      adapter.mode = 'fail';
      const result = await facade.run(unit());
      expect(result.stopReason).toBe('error');
      expect(adapter.requests.length).toBe(1);
      expect(composition.ended.map((end) => end.stopReason)).toEqual(['error']);
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });

  it('settles a cancelled child as aborted with its one request and no continuation, and disposes it', async () => {
    const composition = await compose();
    try {
      const { adapter, facade } = composition;
      adapter.mode = 'hold';
      const controller = new AbortController();
      const submitted = adapter.whenStarted();
      const run = facade.run(unit(controller.signal));
      await submitted;
      controller.abort();
      expect((await run).stopReason).toBe('aborted');
      expect(adapter.requests.length).toBe(1);
      expect(composition.ended.map((end) => end.stopReason)).toEqual(['aborted']);
      expectOnlyParent(composition);
    } finally {
      await close(composition);
    }
  });
});
