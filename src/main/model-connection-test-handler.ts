import { IPC_CHANNELS, type FastModelSelectionInput, type RendererCallResult } from '../shared/protocol.js';
import { ServiceCallError } from './service-client.js';

export interface ModelConnectionTestHandlerOptions<Event, Projection> {
  readonly ipc: {
    handle(channel: string, handler: (event: Event, input: FastModelSelectionInput) => Promise<RendererCallResult<Projection>>): void;
    removeHandler(channel: string): void;
  };
  readonly requireSender: (event: Event) => unknown;
  readonly requireAuthority: () => void;
  readonly serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  readonly start: (input: FastModelSelectionInput) => Promise<unknown>;
  /** The application supplies its existing current settings projection, including its guarded writes. */
  readonly project: () => Promise<Projection>;
  readonly envelope: <Result>(operation: () => Promise<Result> | Result) => Promise<RendererCallResult<Result>>;
}

/** The production connection-test handler; its transport wait owns no Main effect-queue place. */
export function registerModelConnectionTestHandler<Event, Projection>(options: ModelConnectionTestHandlerOptions<Event, Projection>): () => void {
  let closed = false;
  const requireCurrent = (event: Event): void => {
    if (closed) throw new ServiceCallError('SERVICE_INTERRUPTED', '本地业务服务已中断；当前业务操作不可继续。');
    options.requireSender(event);
    options.requireAuthority();
  };
  options.ipc.handle(IPC_CHANNELS.testModelServiceConnection, (event, input) => options.envelope(async () => {
    requireCurrent(event);
    const holder = await options.serializeEffect(async () => {
      requireCurrent(event);
      const result = options.start(input);
      // Observe immediately without changing the promise the handler must still await/report.
      void result.catch(() => undefined);
      return { result };
    });
    await holder.result;
    requireCurrent(event);
    return options.serializeEffect(async () => {
      requireCurrent(event);
      return options.project();
    });
  }));
  return () => {
    if (closed) return;
    closed = true;
    options.ipc.removeHandler(IPC_CHANNELS.testModelServiceConnection);
  };
}
