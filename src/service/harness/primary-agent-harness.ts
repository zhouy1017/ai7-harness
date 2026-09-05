import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import type { GenerateOptions, LlmAdapter, LlmRuntime, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { AI7_FAILURE_CODES, classifyModelFailure, type ClassifiedModelFailure, type DshFailureCodes } from '../provider/classification.js';
import type { EgressDecision, ExecutionRoute, TransmitTicket } from '../provider/egress-gate.js';
import type { AssembledModelPayload } from '../provider/payload.js';

/**
 * `PrimaryAgentHarness`: the AI7-owned composition of the pinned DSH subset for one execution
 * attempt. It composes one fresh Cordis context per Run (a topology response, not a second loop) with
 * the same six services the dormant mount proves, an empty tool registry, the AI7 prompt contract as
 * the complete system prompt, exactly one registered adapter route, and the final Egress Gate on the
 * `llm/stream` waterfall. Callers see AI7 signals and exact technical identities; DSH events never
 * escape as business truth. Every DSH value is imported dynamically so no third-party code loads
 * before the service installs network denial.
 */
export const HARNESS_PACKAGE_PINS = {
  '@deepseek-ai/cordis': '4.0.1',
  '@deepseek-ai/dsh-agent': '0.1.0-rc.6',
  '@deepseek-ai/dsh-agent-loop': '0.1.0-rc.6',
  '@deepseek-ai/dsh-llm': '0.1.0-rc.6',
  '@deepseek-ai/dsh-session': '0.1.0-rc.6',
  '@deepseek-ai/dsh-system-prompt': '0.1.0-rc.6',
  '@deepseek-ai/dsh-tools': '0.1.0-rc.6',
} as const;

export const HARNESS_SERVICE_SET = ['agents', 'sessions', 'llm', 'systemPrompt', 'tools', 'agentLoop'] as const;
export const PROMPT_SECTION_NAME = 'ai7:baseline-analysis-contract' as const;

export interface HarnessCompositionDescriptor {
  readonly packages: typeof HARNESS_PACKAGE_PINS;
  readonly services: typeof HARNESS_SERVICE_SET;
  readonly systemPrompt: { readonly includeHarnessIdentity: false; readonly includeRuntimeContext: false; readonly persona: ''; readonly completeSection: typeof PROMPT_SECTION_NAME };
  readonly tools: { readonly mode: 'native'; readonly maxParallelSubCalls: 1; readonly registeredTools: 0 };
  readonly agentLoop: { readonly maxParallelToolCalls: 1; readonly configuredAgents: 0 };
  readonly subagents: false;
  readonly route: ExecutionRoute;
  readonly model: string;
  readonly promptContractDigest: string;
  /** SHA-256 over every field above in canonical JSON; the Execution Binding pins it. */
  readonly digest: string;
}

export function describeComposition(route: ExecutionRoute, model: string, promptContractDigest: string): HarnessCompositionDescriptor {
  const body = {
    packages: HARNESS_PACKAGE_PINS,
    services: HARNESS_SERVICE_SET,
    systemPrompt: { includeHarnessIdentity: false as const, includeRuntimeContext: false as const, persona: '' as const, completeSection: PROMPT_SECTION_NAME },
    tools: { mode: 'native' as const, maxParallelSubCalls: 1 as const, registeredTools: 0 as const },
    agentLoop: { maxParallelToolCalls: 1 as const, configuredAgents: 0 as const },
    subagents: false as const,
    route,
    model,
    promptContractDigest,
  };
  return { ...body, digest: sha256Hex(canonicalJson(body)) };
}

export type HarnessSignal =
  | { readonly kind: 'started'; readonly turn: number }
  | { readonly kind: 'progress'; readonly label: string }
  | { readonly kind: 'contentCandidate'; readonly text: string; readonly digest: string }
  | { readonly kind: 'usage'; readonly usage: TokenUsage }
  | { readonly kind: 'completed' }
  | { readonly kind: 'interrupted'; readonly failure: ClassifiedModelFailure }
  | { readonly kind: 'failed'; readonly failure: ClassifiedModelFailure }
  | { readonly kind: 'ambiguous'; readonly reason: string };

export interface HarnessExecutionSpan {
  readonly sessionId: string;
  readonly startSeq: number;
  readonly endSeq: number;
}

export interface HarnessTurnOutcome {
  readonly signals: ReadonlyArray<HarnessSignal>;
  readonly terminal: 'completed' | 'interrupted' | 'failed' | 'ambiguous';
  readonly span: HarnessExecutionSpan;
}

export interface HarnessExecutionRequest {
  readonly sessionId: string;
  readonly route: ExecutionRoute;
  readonly model: string;
  readonly systemPrompt: string;
  readonly promptContractDigest: string;
  readonly adapter: LlmAdapter;
  /** The final gate, evaluated over the complete assembled payload immediately before every model call. */
  readonly gate: (payload: AssembledModelPayload) => EgressDecision;
  /** Receives a `transmit-remote` ticket for the adapter's transmit step; never called under v1. */
  readonly onTransmitTicket: (ticket: TransmitTicket) => void;
}

export interface PrimaryAgentHarnessHandle {
  readonly sessionId: string;
  readonly composition: HarnessCompositionDescriptor;
  readonly failureCodes: DshFailureCodes;
  /** Verify the persisted binding pins this composition and session before the first model call. */
  bindExecution(binding: { harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string }): void;
  /** Start one turn with authorized unit material and return its ordered signals; the last is terminal. */
  submitUnit(text: string): Promise<HarnessTurnOutcome>;
  interrupt(): void;
  /** Finalize the technical span set and dispose the composition. */
  finish(): Promise<ReadonlyArray<HarnessExecutionSpan>>;
}

export class PrimaryAgentHarnessError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PrimaryAgentHarnessError';
  }
}

function requireHarness(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new PrimaryAgentHarnessError(code, message);
}

async function* refusalStream(detail: string): AsyncIterable<StreamChunk> {
  yield { type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.EGRESS_REFUSED, message: detail } } };
}

export async function prepareExecution(request: HarnessExecutionRequest): Promise<PrimaryAgentHarnessHandle> {
  const [cordis, agent, sessions, llm, prompt, tools, loop] = await Promise.all([
    import('@deepseek-ai/cordis'),
    import('@deepseek-ai/dsh-agent'),
    import('@deepseek-ai/dsh-session'),
    import('@deepseek-ai/dsh-llm'),
    import('@deepseek-ai/dsh-system-prompt'),
    import('@deepseek-ai/dsh-tools'),
    import('@deepseek-ai/dsh-agent-loop'),
  ]);
  const failureCodes: DshFailureCodes = {
    QUOTA_EXCEEDED_CODE: llm.QUOTA_EXCEEDED_CODE,
    INVALID_CREDENTIAL_CODE: llm.INVALID_CREDENTIAL_CODE,
    CONTEXT_WINDOW_EXCEEDED_CODE: llm.CONTEXT_WINDOW_EXCEEDED_CODE,
  };
  const composition = describeComposition(request.route, request.model, request.promptContractDigest);
  const context: Context = new cordis.Context();
  let bound = false;
  let disposed = false;
  let handle: AgentHandle | undefined;
  const spans: HarnessExecutionSpan[] = [];
  try {
    await context.plugin(agent.AgentRegistry);
    await context.plugin(sessions.SessionStore);
    await context.plugin(llm.LlmRuntime);
    await context.plugin(prompt.SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false, persona: '' });
    await context.plugin(tools.ToolRuntime, { mode: 'native', maxParallelSubCalls: 1 });
    await context.plugin(loop.AgentLoop, { maxParallelToolCalls: 1, agents: [] });
    context.systemPrompt.suppressRuntimeContext();
    context.systemPrompt.section({ name: PROMPT_SECTION_NAME, order: 0, text: request.systemPrompt, complete: true });
    context.llm.registerAdapter([request.route], request.adapter);
    context.on('llm/stream', function (this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) {
      if (!bound) return refusalStream('执行绑定尚未核对；未发送任何内容。');
      const decision = request.gate(options);
      if (decision.decision === 'refuse') return refusalStream(decision.detail);
      if (decision.decision === 'transmit-remote') request.onTransmitTicket(decision.ticket);
      return next();
    });
    const assembly = await context.systemPrompt.assemble();
    requireHarness(
      HARNESS_SERVICE_SET.every((name) => context.get(name) !== undefined) &&
        context.tools.schemas().length === 0 && assembly.tools.length === 0 &&
        prompt.renderPrompt(assembly) === request.systemPrompt && prompt.renderContextSnapshot(assembly) === '' &&
        context.llm.listProviders().length === 1 && context.llm.listProviders()[0]?.id === request.route &&
        context.agentLoop.config.agents.length === 0 && context.agents.list().length === 0 && context.sessions.list().length === 0,
      'HARNESS_COMPOSITION_INVALID',
      'PrimaryAgentHarness 组合未满足零工具、单路由、完整提示的约束。',
    );
    handle = await context.agents.create({
      sessionId: sessions.SessionId(request.sessionId),
      agentOptions: { provider: request.route, model: request.model },
    });
    requireHarness(context.agents.list().length === 1 && context.sessions.list().length === 1 &&
      handle.agent.session.id === request.sessionId, 'HARNESS_COMPOSITION_INVALID', 'PrimaryAgentHarness 未建立唯一的技术会话。');
  } catch (error) {
    await context.fiber.dispose();
    throw error;
  }
  const live = handle;
  const session = live.agent.session;

  const projectTurn = (events: ReadonlyArray<SessionEvent>): Omit<HarnessTurnOutcome, 'span'> => {
    const signals: HarnessSignal[] = [];
    let terminal: HarnessTurnOutcome['terminal'] | undefined;
    for (const event of events) {
      switch (event.type) {
        case 'turn/start':
          signals.push({ kind: 'started', turn: event.data.turn });
          break;
        case 'assistant/message': {
          const text = event.data.message.content
            .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
            .map((block) => block.text)
            .join('');
          signals.push({ kind: 'contentCandidate', text, digest: sha256Hex(text) });
          if (event.data.usage !== undefined) signals.push({ kind: 'usage', usage: { ...event.data.usage } });
          break;
        }
        case 'turn/end': {
          const reason = event.data.reason;
          if (reason.kind === 'completed') {
            signals.push({ kind: 'completed' });
            terminal = 'completed';
          } else if (reason.kind === 'error') {
            const failure = classifyModelFailure(reason.error, failureCodes);
            signals.push(failure.signal === 'interrupted' ? { kind: 'interrupted', failure } : { kind: 'failed', failure });
            terminal = failure.signal;
          } else if (reason.kind === 'aborted') {
            const failure = classifyModelFailure({ code: AI7_FAILURE_CODES.INTERRUPTED, message: '请求被中断。' }, failureCodes);
            signals.push({ kind: 'interrupted', failure });
            terminal = 'interrupted';
          } else if (reason.kind === 'max-tokens') {
            const failure = classifyModelFailure({ code: 'MAX_TOKENS', message: '模型输出达到令牌上限。' }, failureCodes);
            signals.push({ kind: 'failed', failure });
            terminal = 'failed';
          } else {
            signals.push({ kind: 'ambiguous', reason: `技术回合以 ${reason.kind} 结束，无法建立安全结果。` });
            terminal = 'ambiguous';
          }
          break;
        }
        default:
          break;
      }
    }
    if (terminal === undefined) {
      signals.push({ kind: 'ambiguous', reason: '技术回合没有终态事件。' });
      terminal = 'ambiguous';
    }
    return { signals, terminal };
  };

  return {
    sessionId: request.sessionId,
    composition,
    failureCodes,
    bindExecution(binding) {
      requireHarness(!disposed, 'HARNESS_DISPOSED', 'PrimaryAgentHarness 已释放。');
      requireHarness(
        binding.harnessSessionId === request.sessionId && binding.behaviorCompositionDigest === composition.digest &&
          binding.promptContractDigest === request.promptContractDigest,
        'HARNESS_BINDING_MISMATCH',
        '已持久化的执行绑定与本次组合不一致。',
      );
      bound = true;
    },
    async submitUnit(text) {
      requireHarness(!disposed, 'HARNESS_DISPOSED', 'PrimaryAgentHarness 已释放。');
      requireHarness(bound, 'HARNESS_UNBOUND', '执行绑定尚未核对，不能提交单元。');
      const startSeq = session.seq;
      live.agent.followup(llm.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      await live.agent.whenIdle();
      const endSeq = session.seq - 1;
      const events = session.events.slice(startSeq);
      const span = { sessionId: request.sessionId, startSeq, endSeq };
      spans.push(span);
      return { ...projectTurn(events), span };
    },
    interrupt() {
      if (!disposed) live.agent.cancel({ kind: 'user' });
    },
    async finish() {
      if (disposed) return spans;
      disposed = true;
      bound = false;
      try {
        await live.dispose();
      } finally {
        await context.fiber.dispose();
      }
      return spans;
    },
  };
}
