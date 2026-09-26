import { describe, expect, it } from 'vitest';
import { REPLACEMENT_WAITING_MESSAGE, replacementBlockedBy, takenWhileReplacementWaits } from '../../src/service/replacement-gate.js';

// Unit suite for 替换本机全部数据's gate (Issue #434, plan slice S86c review): while a replacement waits for AI7's next start
// the service takes reads and the ways to stop what waits, and refuses every write, one added later included; and a
// replacement is prepared only while nothing else would write.

describe('what the service takes while a replacement waits (Issue #434 review)', () => {
  it('takes reads, a search, the way to a Book and 取消替换, and refuses every write, including one not yet named', () => {
    for (const operation of [
      'ready', 'shutdown', 'getStartup', 'getManuscriptWindow', 'inspectBaselineAnalysis', 'inspectDatabaseReplacements', 'listBooks',
      'pollServiceJob', 'previewLibraryMaterial', 'cancelDatabaseReplacement', 'startSearch', 'cancelServiceJob', 'resolveBookWorkbenchRoute',
    ]) expect([operation, takenWhileReplacementWaits(operation)]).toEqual([operation, true]);
    for (const operation of [
      'flushJournalEdit', 'createEditorialMark', 'authorizeBaselineAnalysis', 'runReconnectPreflight', 'recordManuscriptEntryPosition',
      'prepareDatabaseExport', 'approveDatabaseExport', 'setScheduledBackup', 'prepareDatabaseReplacement', 'rollBackDatabaseReplacement',
      'getter', 'inspector', 'listing', 'somethingNew',
    ]) expect([operation, takenWhileReplacementWaits(operation)]).toEqual([operation, false]);
    expect(REPLACEMENT_WAITING_MESSAGE).toBe('本机数据正在等 AI7 重新启动后被替换；在此之前不能再做修改。要继续修改，请先取消替换。');
  });

  it('prepares a replacement only while nothing else would write', () => {
    const quiet = { runsIdle: true, reviewRunsDriving: false, jobsBusy: false, exportRunning: false };
    expect(replacementBlockedBy(quiet)).toBeNull();
    for (const busy of [{ runsIdle: false }, { reviewRunsDriving: true }, { jobsBusy: true }, { exportRunning: true }]) {
      expect(replacementBlockedBy({ ...quiet, ...busy })).toBe('还有任务或处理在进行；请等它们结束，或先暂停或取消，再替换本机数据。');
    }
  });
});
