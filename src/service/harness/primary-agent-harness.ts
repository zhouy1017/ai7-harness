import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import type { GenerateOptions, LlmAdapter, LlmRuntime, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { SessionInspection, SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { AI7_FAILURE_CODES, classifyModelFailure, type ClassifiedModelFailure, type DshFailureCodes } from '../provider/classification.js';
import { assistantToolCallDigest, type EgressDecision, type EgressRefusalReason, type ExecutionRoute, type TransmitTicket } from '../provider/egress-gate.js';
import { assistantToolCalls, type AssembledModelPayload } from '../provider/payload.js';
import {
  PLATFORM_TOOL_NAMES,
  PLATFORM_TOOL_SCHEMAS,
  PLATFORM_TOOL_SCHEMA_DIGEST,
  toolSetEqualsPlatformSchemas,
  type PlatformToolName,
} from '../provider/platform-tools.js';
import { HarnessSessionLogBackend } from './session-log.js';

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
  /** `registeredTools` is 0 on every composition but one that registers the two platform tools (Issue #473), where it is 2. */
  readonly tools: { readonly mode: 'native'; readonly maxParallelSubCalls: 1; readonly registeredTools: 0 | 2 };
  readonly agentLoop: { readonly maxParallelToolCalls: 1; readonly configuredAgents: 0 };
  readonly subagents: false;
  readonly route: ExecutionRoute;
  readonly model: string;
  readonly promptContractDigest: string;
  /**
   * Present only on a composition that persists its Session log (Issue #52, S17a): the Harness Session Ledger written under
   * the Agent Data Root through DSH's persistence seam. Every composition without it keeps the descriptor — and the digest
   * every frozen plan pins — exactly as it was.
   */
  readonly sessionLog?: { readonly package: { readonly '@deepseek-ai/dsh-session-persistence': typeof SESSION_LOG_PACKAGE_PIN }; readonly storage: 'agent-data-root-jsonl' };
  /**
   * Present only on a composition that registers AI7's platform tools (ADR 0080 §7.1, Issue #473): their names and the
   * digest of their exact schemas. A composition without them — every composition a plan can freeze today, since no
   * selected Provider Processing rule names them — keeps its descriptor and its digest byte-identical.
   */
  readonly platformTools?: { readonly names: typeof PLATFORM_TOOL_NAMES; readonly schemaDigest: string };
  /** SHA-256 over every field above in canonical JSON; the Execution Binding pins it. */
  readonly digest: string;
}

/** The pinned version of DSH's persistence seam the Harness Session Ledger is written through (Issue #52, S17a). */
export const SESSION_LOG_PACKAGE_PIN = '0.1.0-rc.6' as const;

export interface CompositionOptions {
  /** The composition persists its Session log under the Agent Data Root. */
  readonly sessionLog?: boolean;
  /** The composition registers the two platform tools (Issue #473); only for a Run whose rule names them and whose plan declares web search. */
  readonly platformTools?: boolean;
}

export function describeComposition(route: ExecutionRoute, model: string, promptContractDigest: string, options: CompositionOptions = {}): HarnessCompositionDescriptor {
  const withTools = options.platformTools === true;
  const body = {
    packages: HARNESS_PACKAGE_PINS,
    services: HARNESS_SERVICE_SET,
    systemPrompt: { includeHarnessIdentity: false as const, includeRuntimeContext: false as const, persona: '' as const, completeSection: PROMPT_SECTION_NAME },
    tools: { mode: 'native' as const, maxParallelSubCalls: 1 as const, registeredTools: withTools ? (2 as const) : (0 as const) },
    agentLoop: { maxParallelToolCalls: 1 as const, configuredAgents: 0 as const },
    subagents: false as const,
    route,
    model,
    promptContractDigest,
    ...(options.sessionLog === true
      ? { sessionLog: { package: { '@deepseek-ai/dsh-session-persistence': SESSION_LOG_PACKAGE_PIN }, storage: 'agent-data-root-jsonl' as const } }
      : {}),
    ...(withTools ? { platformTools: { names: PLATFORM_TOOL_NAMES, schemaDigest: PLATFORM_TOOL_SCHEMA_DIGEST } } : {}),
  };
  return { ...body, digest: sha256Hex(canonicalJson(body)) };
}

/** One platform-tool call the harness hands its owner: the model's call id, the tool, and the arguments as the model sent them. */
export interface PlatformToolExecution {
  readonly callId: string;
  readonly tool: PlatformToolName;
  readonly arguments: unknown;
  readonly signal: AbortSignal;
}

/**
 * The owner of a composition's platform tools (Issue #473): it decides and performs each call — the Egress Gate's
 * `call-search-service` or `fetch-public-source` ticket, the forwarder, the ledger and the Research Snapshot Cache — and
 * admits every result the model will see. The harness only registers the two tools and routes their calls here.
 */
export interface PlatformToolOwner {
  /** Perform one call; the text is what the model reads, the URL where its bytes came from (`null` for a refusal AI7 composed). */
  execute(call: PlatformToolExecution): Promise<{ readonly text: string; readonly sourceUrl: string | null }>;
  /**
   * Admit the exact text the model will read for one call, immediately before DSH materializes it: the gate admits a tool
   * result back into the payload only by this call id, URL, digest, and byte count.
   */
  admit(result: { readonly callId: string; readonly tool: PlatformToolName; readonly sourceUrl: string | null; readonly text: string }): void;
  /** Accept one assistant tool-call message this attempt's adapter returned, by `assistantToolCallDigest`. */
  acceptToolCallMessage(digest: string): void;
}

/** The value a platform tool's body returns: the text and its source URL (`''` for none), as DSH's lossless JSON carries it. */
const PLATFORM_TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' }, sourceUrl: { type: 'string' } },
  required: ['text', 'sourceUrl'],
  additionalProperties: false,
} as const;

export type HarnessSignal =
  | { readonly kind: 'started'; readonly turn: number }
  | { readonly kind: 'progress'; readonly label: string }
  | { readonly kind: 'contentCandidate'; readonly text: string; readonly digest: string }
  | { readonly kind: 'usage'; readonly usage: TokenUsage }
  | { readonly kind: 'completed' }
  | { readonly kind: 'interrupted'; readonly failure: ClassifiedModelFailure }
  | { readonly kind: 'failed'; readonly failure: ClassifiedModelFailure }
  /**
   * A turn whose result cannot be established. `failure` is present when the adapter itself said so — a request sent whose
   * answer never came back whole (Issue #51, S16c) — and absent for a turn the loop ended without a terminal event.
   */
  | { readonly kind: 'ambiguous'; readonly reason: string; readonly failure?: ClassifiedModelFailure };

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

/**
 * How many technical Sessions one attempt composes. `single` is the production and deterministic
 * composition: one accumulating Session carries every unit. `per-unit` is the developer-live
 * composition Provider Processing v5 requires: every unit gets a fresh agent and Session inside the
 * same Cordis context, so no unit's material ever appears in another unit's request, and the gateway
 * caches per Session. The Execution Binding's `harnessSessionId` stays the lineage root either way.
 */
export type HarnessSessionMode = 'single' | 'per-unit';

export interface HarnessExecutionRequest {
  readonly sessionId: string;
  readonly route: ExecutionRoute;
  readonly model: string;
  readonly systemPrompt: string;
  readonly promptContractDigest: string;
  /** Defaults to `single`; `per-unit` composes one Session per submitted unit. */
  readonly sessionMode?: HarnessSessionMode;
  /** Derives each per-unit Session id from the lineage root; defaults to a fresh UUID per unit. */
  readonly nextSessionId?: () => string;
  /** Builds the one bound adapter once the composition has resolved the DSH failure-code constants. */
  readonly adapterFactory: (codes: DshFailureCodes) => LlmAdapter;
  /** The final gate, evaluated over the complete assembled payload immediately before every model call. */
  readonly gate: (payload: AssembledModelPayload) => EgressDecision;
  /** Receives a `transmit-remote` ticket for the adapter's transmit step; never called under v1. */
  readonly onTransmitTicket: (ticket: TransmitTicket) => void;
  /**
   * The directory under the Agent Data Root the composition's Session log is persisted in (Issue #52, S17a), or absent for a
   * composition whose log stays in memory, as every analysis composition's does.
   */
  readonly sessionLogRoot?: string;
  /**
   * The owner of the two platform tools, present only for a Run whose binding's rule names them and whose plan declares
   * web search (ADR 0080 §7.1, Issue #473). Absent — as on every Run today — the composition registers zero tools, and
   * its descriptor and digest are unchanged.
   */
  readonly platformTools?: PlatformToolOwner;
}

export interface PrimaryAgentHarnessHandle {
  /** The lineage root: the Session the Execution Binding pins, and under `single` the only Session. */
  readonly sessionId: string;
  readonly sessionMode: HarnessSessionMode;
  readonly composition: HarnessCompositionDescriptor;
  readonly failureCodes: DshFailureCodes;
  /** The technical Session id the turn in flight uses; the lineage root until a unit opens its own. */
  currentSessionId(): string;
  /** Verify the persisted binding pins this composition and session before the first model call. */
  bindExecution(binding: { harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string }): void;
  /** Start one turn with authorized unit material and return its ordered signals; the last is terminal. */
  submitUnit(text: string): Promise<HarnessTurnOutcome>;
  /**
   * Start one turn as `submitUnit` does, and hand every text delta the model streams to `onText` as DSH records it, in order
   * (Issue #52, S17a). The Interactive Answer Stream reads these; the terminal outcome is the same as `submitUnit`'s.
   */
  submitStreaming(text: string, onText: (delta: string) => void): Promise<HarnessTurnOutcome>;
  /** Where the next turn's span starts: the Session that will carry it and its first sequence number. */
  nextSpanStart(): { readonly sessionId: string; readonly startSeq: number };
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

/**
 * A gate refusal as the turn's failure. A tripped platform-tool breaker keeps its own code (ADR 0080 §7.4; #676), so the
 * unit it ends is told apart from every other refusal and is never retried; every other refusal reads exactly as before.
 */
async function* refusalStream(detail: string, reason?: EgressRefusalReason): AsyncIterable<StreamChunk> {
  const code = reason === 'circuit-breaker-tripped' ? AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED : AI7_FAILURE_CODES.EGRESS_REFUSED;
  yield { type: 'finish', reason: { kind: 'error', failure: { code, message: detail } } };
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
  const toolOwner = request.platformTools ?? null;
  const composition = describeComposition(request.route, request.model, request.promptContractDigest, {
    sessionLog: request.sessionLogRoot !== undefined,
    ...(toolOwner === null ? {} : { platformTools: true }),
  });
  const context: Context = new cordis.Context();
  let bound = false;
  // The Interactive Answer Stream's reader for the turn in flight, if one streams (Issue #52, S17a).
  let streamReader: ((delta: string) => void) | null = null;
  let disposed = false;
  let handle: AgentHandle | undefined;
  const spans: HarnessExecutionSpan[] = [];
  try {
    await context.plugin(agent.AgentRegistry);
    await context.plugin(sessions.SessionStore);
    if (request.sessionLogRoot !== undefined) await context.plugin(await sessionLogService(), { root: request.sessionLogRoot });
    await context.plugin(llm.LlmRuntime);
    await context.plugin(prompt.SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false, persona: '' });
    await context.plugin(tools.ToolRuntime, { mode: 'native', maxParallelSubCalls: 1 });
    if (toolOwner !== null) registerPlatformTools(context, toolOwner);
    await context.plugin(loop.AgentLoop, { maxParallelToolCalls: 1, agents: [] });
    context.systemPrompt.suppressRuntimeContext();
    context.systemPrompt.section({ name: PROMPT_SECTION_NAME, order: 0, text: request.systemPrompt, complete: true });
    context.llm.registerAdapter([request.route], request.adapterFactory(failureCodes));
    // Each text delta the turn in flight streams, as DSH records it: never a business fact, only what the foreground
    // dialogue shows by complete fragment.
    context.on('session/event', (_session, event) => {
      // An assistant message asking for platform tools is accepted for this attempt's history the moment DSH records it,
      // before its calls run and before the next model call carries it back through the gate (Issue #473).
      if (toolOwner !== null && event.type === 'assistant/message' && assistantToolCalls(event.data.message) !== null) {
        toolOwner.acceptToolCallMessage(assistantToolCallDigest(event.data.message.content));
      }
      if (streamReader === null || event.type !== 'assistant/chunk') return;
      const { chunk } = event.data;
      if (chunk.type === 'text-delta') streamReader(chunk.text);
    });
    context.on('llm/stream', function (this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) {
      if (!bound) return refusalStream('执行绑定尚未核对；未发送任何内容。');
      const decision = request.gate(options);
      if (decision.decision === 'refuse') return refusalStream(decision.detail, decision.reason);
      if (decision.decision === 'transmit-remote') request.onTransmitTicket(decision.ticket);
      return next();
    });
    const assembly = await context.systemPrompt.assemble();
    // Zero tools, or exactly the two platform tool schemas when an owner was given: never anything in between or beyond.
    const toolsExact = toolOwner === null
      ? context.tools.schemas().length === 0 && assembly.tools.length === 0
      : toolSetEqualsPlatformSchemas(context.tools.schemas()) && toolSetEqualsPlatformSchemas(assembly.tools);
    requireHarness(
      HARNESS_SERVICE_SET.every((name) => context.get(name) !== undefined) &&
        toolsExact &&
        prompt.renderPrompt(assembly) === request.systemPrompt && prompt.renderContextSnapshot(assembly) === '' &&
        context.llm.listProviders().length === 1 && context.llm.listProviders()[0]?.id === request.route &&
        context.agentLoop.config.agents.length === 0 && context.agents.list().length === 0 && context.sessions.list().length === 0 &&
        (context.get('sessionPersistence') !== undefined) === (request.sessionLogRoot !== undefined),
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
  const sessionMode: HarnessSessionMode = request.sessionMode ?? 'single';
  // The root agent and Session: under `single` it serves every unit; under `per-unit` it is the
  // lineage root the binding pins and is disposed before the first unit opens its own Session.
  let live = handle;
  let currentSessionId = request.sessionId;

  const projectTurn = (events: ReadonlyArray<SessionEvent>): Omit<HarnessTurnOutcome, 'span'> => {
    const signals: HarnessSignal[] = [];
    let terminal: HarnessTurnOutcome['terminal'] | undefined;
    for (const event of events) {
      switch (event.type) {
        case 'turn/start':
          signals.push({ kind: 'started', turn: event.data.turn });
          break;
        case 'assistant/message': {
          // A tool-call message is a step of the loop, not an answer: it counts its usage and is never a content candidate.
          if (assistantToolCalls(event.data.message) !== null) {
            signals.push({ kind: 'progress', label: '平台工具调用' });
            if (event.data.usage !== undefined) signals.push({ kind: 'usage', usage: { ...event.data.usage } });
            break;
          }
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
            // 结果待确认 (Issue #51, S16c): a request sent whose result cannot be known ends the turn ambiguous, never failed,
            // so no retry table is ever asked about it.
            signals.push(failure.signal === 'ambiguous'
              ? { kind: 'ambiguous', reason: failure.reason, failure }
              : failure.signal === 'interrupted' ? { kind: 'interrupted', failure } : { kind: 'failed', failure });
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

  /** Replace the live agent and Session with a fresh pair inside the same context; the old pair is disposed first. */
  const openUnitSession = async (): Promise<void> => {
    const nextId = request.nextSessionId?.() ?? randomUUID();
    requireHarness(nextId !== currentSessionId, 'HARNESS_SESSION_ID_REPEATED', '每个分析单元必须使用新的技术会话。');
    await live.dispose();
    const next = await context.agents.create({
      sessionId: sessions.SessionId(nextId),
      agentOptions: { provider: request.route, model: request.model },
    });
    requireHarness(next.agent.session.id === nextId, 'HARNESS_COMPOSITION_INVALID', 'PrimaryAgentHarness 未建立本单元的技术会话。');
    live = next;
    currentSessionId = nextId;
  };

  const submit = async (text: string, onText: ((delta: string) => void) | null): Promise<HarnessTurnOutcome> => {
    requireHarness(!disposed, 'HARNESS_DISPOSED', 'PrimaryAgentHarness 已释放。');
    requireHarness(bound, 'HARNESS_UNBOUND', '执行绑定尚未核对，不能提交单元。');
    requireHarness(streamReader === null, 'HARNESS_TURN_IN_FLIGHT', '上一个回合尚未结束。');
    if (sessionMode === 'per-unit') await openUnitSession();
    const session = live.agent.session;
    const startSeq = session.seq;
    streamReader = onText;
    try {
      live.agent.followup(llm.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      await live.agent.whenIdle();
    } finally {
      streamReader = null;
    }
    // A persisted log holds the turn once it is flushed: the span names exactly what the Harness Session Ledger keeps.
    if (request.sessionLogRoot !== undefined) await context.sessions.flush(session);
    const endSeq = session.seq - 1;
    const events = session.events.slice(startSeq);
    // Each span records the Session that actually carried the turn, so per-unit lineage is exact.
    const span = { sessionId: currentSessionId, startSeq, endSeq };
    spans.push(span);
    return { ...projectTurn(events), span };
  };

  return {
    sessionId: request.sessionId,
    sessionMode,
    composition,
    failureCodes,
    currentSessionId() {
      return currentSessionId;
    },
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
      return submit(text, null);
    },
    async submitStreaming(text, onText) {
      return submit(text, onText);
    },
    nextSpanStart() {
      return { sessionId: currentSessionId, startSeq: live.agent.session.seq };
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

/**
 * Register the two platform tools into the composition's `ToolRuntime` (ADR 0080 §7.1, Issue #473) with exactly the
 * schemas `PLATFORM_TOOL_SCHEMAS` fixes — no `defineTool` projection stands between them and the bytes the gate compares.
 * Each body hands its call to the owner; `finalizeContent`, which DSH runs exactly once for every outcome of a call —
 * success, refusal, or a pipeline failure — immediately before materializing it, fixes the one text the model will read
 * and has the owner admit it, so no result can reach the payload that the owner did not admit.
 */
function registerPlatformTools(context: Context, owner: PlatformToolOwner): void {
  for (const schema of PLATFORM_TOOL_SCHEMAS) {
    const tool = schema.name;
    const definition: ToolDefinition = {
      name: tool,
      description: schema.description,
      parameters: JSON.parse(JSON.stringify(schema.parameters)) as Record<string, unknown>,
      output: {
        schema: PLATFORM_TOOL_OUTPUT_SCHEMA as unknown as ToolDefinition['output']['schema'],
        render: (_args, value) => [{ type: 'text', text: (value as { text: string }).text }],
      },
      async execute(args, exec) {
        const outcome = await owner.execute({ callId: exec.callId, tool, arguments: args, signal: exec.signal });
        return { text: outcome.text, sourceUrl: outcome.sourceUrl ?? '' };
      },
      finalizeContent(exec, result) {
        let text: string;
        let sourceUrl: string | null = null;
        if (result.isError) {
          text = `工具调用未完成：${result.error.message}`;
        } else {
          const value = result.value as { text?: unknown; sourceUrl?: unknown };
          text = typeof value.text === 'string' ? value.text : '';
          sourceUrl = typeof value.sourceUrl === 'string' && value.sourceUrl.length > 0 ? value.sourceUrl : null;
        }
        owner.admit({ callId: exec.callId, tool, sourceUrl, text });
        return [{ type: 'text', text }];
      },
    };
    context.tools.register(definition);
  }
}

/**
 * The Harness Session Ledger's service (Issue #52, S17a): DSH's own `SessionPersistence` seam, its write path the
 * `PersistenceCoordinator` DSH ships, over AI7's JSONL storage primitive. Built only after the dynamic imports, so no DSH
 * runtime value loads before the service installs network denial.
 */
async function sessionLogService(): Promise<new (ctx: Context, config: { root: string }) => object> {
  const persistence = await import('@deepseek-ai/dsh-session-persistence');
  class HarnessSessionLedger extends persistence.SessionPersistence {
    static readonly inject = ['sessions'];
    readonly supportsRawArtifacts = false;
    readonly #backend: HarnessSessionLogBackend;
    readonly #coordinator: InstanceType<typeof persistence.PersistenceCoordinator<number>>;

    constructor(ctx: Context, config: { root: string }) {
      super(ctx);
      this.#backend = new HarnessSessionLogBackend(config.root);
      // Every event is written as soon as it is recorded: a dialogue interrupted by AI7 closing keeps all it streamed.
      this.#coordinator = new persistence.PersistenceCoordinator(ctx, this.#backend, { preparedSessionCacheSize: 1, writeBatchMaxDelayMs: 1 });
    }

    locate(meta: SessionHeader): { kind: string; path: string } {
      return this.#backend.locate(meta);
    }

    create(meta: SessionHeader): Promise<void> {
      return this.#coordinator.create(meta);
    }

    append(id: SessionId, events: readonly SessionEvent[]): Promise<void> {
      return this.#coordinator.append(id, events);
    }

    load(id: SessionId): Promise<SessionInspection> {
      return this.#coordinator.load(id);
    }

    inspect(id: SessionId, signal?: AbortSignal): Promise<SessionInspection> {
      return this.#coordinator.inspect(id, signal);
    }

    readFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
      return this.#coordinator.readFrom(id, fromSeq, signal);
    }

    list(): Promise<SessionHeader[]> {
      return this.#backend.list();
    }

    async listSnapshots(): Promise<Array<{ header: SessionHeader; revision: SessionPersistenceRevision }>> {
      const snapshots: Array<{ header: SessionHeader; revision: SessionPersistenceRevision }> = [];
      for (const header of await this.#backend.list()) {
        const revision = await this.#backend.readStoredRevision(header.id);
        if (revision !== undefined) snapshots.push({ header, revision });
      }
      return snapshots;
    }
  }
  return HarnessSessionLedger as unknown as new (ctx: Context, config: { root: string }) => object;
}
