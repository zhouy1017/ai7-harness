// 替换本机全部数据's gate (Issue #434, plan slice S86c review): what the service takes while a replacement waits. Pure, and
// free of the store, so the service's request loop reads it before anything else is loaded.

/**
 * What the service takes while a replacement waits for AI7's next start (Issue #434 review): reads, a search, the way to
 * the Book the editor opens, stopping a search, and 取消替换 — never a write, so nothing is changed that the replacement
 * would then lose. Anything not named here is refused, so an operation added later is refused until it is named.
 */
export function takenWhileReplacementWaits(operation: string): boolean {
  return /^(?:inspect|get|list|poll|preview)[A-Z]/u.test(operation) || TAKEN_WHILE_WAITING.has(operation);
}

const TAKEN_WHILE_WAITING: ReadonlySet<string> = new Set([
  'ready', 'shutdown', 'cancelDatabaseReplacement', 'startSearch', 'cancelServiceJob', 'resolveBookWorkbenchRoute',
]);

/** What a change asked for while a replacement waits is told. */
export const REPLACEMENT_WAITING_MESSAGE = '本机数据正在等 AI7 重新启动后被替换；在此之前不能再做修改。要继续修改，请先取消替换。';

/** What else would write while a replacement is prepared: the Runs, the Review Runs, the jobs and a database export. */
export interface RunningWork {
  /** No Run executes, waits for a place, or waits to finish its cancellation. */
  readonly runsIdle: boolean;
  readonly reviewRunsDriving: boolean;
  readonly jobsBusy: boolean;
  readonly exportRunning: boolean;
}

/**
 * Why a replacement cannot be prepared now, or `null` when nothing else would write (Issue #434 review): what anything
 * running wrote after the backup would be lost with the data the replacement replaces.
 */
export function replacementBlockedBy(work: RunningWork): string | null {
  return !work.runsIdle || work.reviewRunsDriving || work.jobsBusy || work.exportRunning
    ? '还有任务或处理在进行；请等它们结束，或先暂停或取消，再替换本机数据。'
    : null;
}
