import { describe, expect, it } from 'vitest';
import type {
  CapturedProcedureProjection,
  CapturedProcedureRunProjection,
  CapturedProcedureRunStepProjection,
  CapturedProcedureStopPreviewProjection,
} from '../../src/shared/protocol.js';
import {
  PROCEDURE_STOP_PREVIEW_STALE_CODE,
  ProcedureChoiceRequests,
  SHEET_PROCEDURE_LOADING,
  SHEET_PROCEDURE_VERSION_MISMATCH,
  confirmProcedureStop,
  procedureCategoryOpen,
  procedureChoiceAfter,
  procedureChoiceFocus,
  procedurePreparationPin,
  type ProcedureSheetChoice,
} from '../../src/renderer/procedure-choice.js';

// Unit suite (L1) for the 新建审阅 sheet's version choice (Issue #66, plan slice S31 review P2-1; REUSE-054): the version on show
// is the version pinned. Only the newest choice's answer fills the sheet, 先看计划 waits while a choice loads, and a preparation
// is refused when the selector shows another version than the sheet holds.

const V1 = { versionId: '11111111-1111-4111-8111-111111111111', documentSha256: 'a'.repeat(64) };
const V2 = { versionId: '22222222-2222-4222-8222-222222222222', documentSha256: 'b'.repeat(64) };

describe('the choices in flight', () => {
  it('loads from the moment a choice is asked until its own answer settles it', () => {
    const requests = new ProcedureChoiceRequests();
    expect(requests.loading).toBe(false);
    const first = requests.ask();
    expect(requests.loading).toBe(true);
    expect(requests.current(first)).toBe(true);
    requests.settle(first);
    expect(requests.loading).toBe(false);
  });

  it('drops an answer a later choice superseded, whichever order the answers arrive in', () => {
    const requests = new ProcedureChoiceRequests();
    const older = requests.ask();
    const newer = requests.ask();
    // The newer answer lands first: it fills the sheet; the older one, arriving after, does not.
    expect(requests.current(newer)).toBe(true);
    requests.settle(newer);
    expect(requests.loading).toBe(false);
    expect(requests.current(older)).toBe(false);
    requests.settle(older);
    expect(requests.loading).toBe(false);
    // The older answer lands first: it fills nothing, and the sheet still waits for the newer one.
    const late = requests.ask();
    const later = requests.ask();
    expect(requests.current(late)).toBe(false);
    requests.settle(late);
    expect(requests.loading).toBe(true);
    requests.settle(later);
    expect(requests.loading).toBe(false);
  });
});

describe('the pin a preparation carries', () => {
  it('waits while a choice loads, even when the sheet still holds a version', () => {
    expect(procedurePreparationPin(V2, V2.versionId, true)).toEqual({ pin: null, refusal: SHEET_PROCEDURE_LOADING });
    expect(procedurePreparationPin(null, null, true)).toEqual({ pin: null, refusal: SHEET_PROCEDURE_LOADING });
  });

  it('refuses a version on show other than the one held, and pins exactly the one held otherwise', () => {
    expect(procedurePreparationPin(V2, V1.versionId, false)).toEqual({ pin: null, refusal: SHEET_PROCEDURE_VERSION_MISMATCH });
    expect(procedurePreparationPin(V2, null, false)).toEqual({ pin: null, refusal: SHEET_PROCEDURE_VERSION_MISMATCH });
    expect(procedurePreparationPin(V1, V1.versionId, false)).toEqual({ pin: V1, refusal: null });
    // Categories chosen by hand pin nothing.
    expect(procedurePreparationPin(null, null, false)).toEqual({ pin: null, refusal: null });
  });
});

const PROCEDURE_ID = '33333333-3333-4333-8333-333333333333';

/** A resolution as `inspectCapturedProcedureRun` answers it: one version of the procedure, its steps, its scope slot. */
function runAt(version: typeof V1, number: number, steps: ReadonlyArray<[string, boolean]>, scopeSlot: 'whole' | 'chapters'): CapturedProcedureRunProjection {
  return {
    bookId: '44444444-4444-4444-8444-444444444444',
    procedureId: PROCEDURE_ID,
    title: '体例复核',
    resolved: {
      versionId: version.versionId,
      version: number,
      latestEligible: number === 2,
      documentSha256: version.documentSha256,
      scopeSlot,
      steps: steps.map(([categoryId, available]): CapturedProcedureRunStepProjection => ({
        categoryId, label: categoryId, available, unavailableReason: available ? null : '本书不适用。', chosenApart: categoryId === 'series-consistency',
      })),
      guidelineChanges: [],
    },
    passedOver: [],
    eligibleVersions: [{ versionId: V2.versionId, version: 2 }, { versionId: V1.versionId, version: 1 }],
    unavailableReason: null,
  };
}

describe('what a choice leaves in the sheet (Issue #684)', () => {
  const pinned: ProcedureSheetChoice = {
    procedure: runAt(V2, 2, [['style-and-format', true], ['literary-expression', true]], 'whole'),
    categories: new Set(['style-and-format', 'literary-expression']),
    scope: 'whole',
    from: null,
    to: null,
    problem: null,
  };

  it('keeps the procedure, version, categories and scope it held when a choice fails, and says why', () => {
    const after = procedureChoiceAfter(pinned, { kind: 'failed', reason: '这一版已停用，不能再选。' });
    expect(after.procedure).toBe(pinned.procedure);
    expect(after.procedure?.resolved?.versionId).toBe(V2.versionId);
    expect([...after.categories]).toEqual(['style-and-format', 'literary-expression']);
    expect([after.scope, after.from, after.to, after.problem]).toEqual(['whole', null, null, '这一版已停用，不能再选。']);
    // A new set: the sheet may clear its own and refill it from this without losing anything.
    expect(after.categories).not.toBe(pinned.categories);
  });

  it('keeps a sheet chosen by hand as it was when a choice fails, chapters and all', () => {
    const byHand: ProcedureSheetChoice = { procedure: null, categories: new Set(['plot-consistency']), scope: 'chapters', from: 'a', to: 'b', problem: null };
    expect(procedureChoiceAfter(byHand, { kind: 'failed', reason: '无法读取所选的可复用工序。' }))
      .toEqual({ ...byHand, problem: '无法读取所选的可复用工序。' });
  });

  it('fills the sheet from an answer: its available steps ticked, every other category closed, the scope its slot', () => {
    const byHand: ProcedureSheetChoice = { procedure: null, categories: new Set(['plot-consistency']), scope: 'chapters', from: 'a', to: 'b', problem: '旧的' };
    const older = runAt(V1, 1, [['style-and-format', true], ['literary-expression', false]], 'whole');
    const after = procedureChoiceAfter(byHand, { kind: 'answered', run: older });
    expect(after.procedure).toBe(older);
    expect([...after.categories]).toEqual(['style-and-format']);
    expect([after.scope, after.from, after.to, after.problem]).toEqual(['whole', null, null, null]);
  });

  it('leaves a Series step this Book can take unticked for the editor to choose (Issue #66, S31b; REUSE-049, REUSE-050)', () => {
    const byHand: ProcedureSheetChoice = { procedure: null, categories: new Set(), scope: null, from: null, to: null, problem: null };
    const series = runAt(V1, 1, [['style-and-format', true], ['series-consistency', true]], 'whole');
    expect([...procedureChoiceAfter(byHand, { kind: 'answered', run: series }).categories]).toEqual(['style-and-format']);
    // Alone, the Series step leaves nothing ticked: the editor ticks it, or prepares nothing.
    const alone = runAt(V1, 1, [['series-consistency', true]], 'whole');
    expect([...procedureChoiceAfter(byHand, { kind: 'answered', run: alone }).categories]).toEqual([]);
  });

  it('opens on a filled sheet only the box of a Series step this Book can take (Issue #66, S31b)', () => {
    // Chosen by hand: every box is the editor's.
    expect(procedureCategoryOpen(false, null)).toBe(true);
    expect(procedureCategoryOpen(false, { available: true, chosenApart: false })).toBe(true);
    // Filled: the procedure's steps are its own, a category outside it closed, a Series step the editor's.
    expect(procedureCategoryOpen(true, null)).toBe(false);
    expect(procedureCategoryOpen(true, { available: true, chosenApart: false })).toBe(false);
    expect(procedureCategoryOpen(true, { available: true, chosenApart: true })).toBe(true);
    expect(procedureCategoryOpen(true, { available: false, chosenApart: true })).toBe(false);
  });

  it('holds an answer that cannot run with nothing ticked and its reason, leaving the scope as it was', () => {
    const unavailable: CapturedProcedureRunProjection = { ...pinned.procedure!, resolved: null, eligibleVersions: [], unavailableReason: '没有可运行的版本。' };
    const after = procedureChoiceAfter({ ...pinned, scope: 'chapters', from: 'a', to: 'b' }, { kind: 'answered', run: unavailable });
    expect(after.procedure).toBe(unavailable);
    expect([...after.categories]).toEqual([]);
    expect([after.scope, after.from, after.to, after.problem]).toEqual(['chapters', 'a', 'b', '没有可运行的版本。']);
  });

  it('returns to categories chosen by hand when the procedure is cleared, with nothing ticked and no problem', () => {
    const after = procedureChoiceAfter({ ...pinned, problem: '旧的' }, { kind: 'cleared' });
    expect(after.procedure).toBeNull();
    expect([...after.categories]).toEqual([]);
    expect([after.scope, after.problem]).toEqual(['whole', null]);
  });

  it('returns focus to the selector the editor used, while the sheet still shows it', () => {
    expect(procedureChoiceFocus(true, pinned.procedure)).toBe('procedure-version');
    expect(procedureChoiceFocus(false, pinned.procedure)).toBe('procedure');
    // Without a resolved version there is no version selector to return to.
    expect(procedureChoiceFocus(true, { ...pinned.procedure!, resolved: null })).toBe('procedure');
    expect(procedureChoiceFocus(true, null)).toBe('procedure');
  });
});

describe('确认停用 and a preview that moved (Issue #684)', () => {
  const preview = { procedureId: PROCEDURE_ID, versionId: V1.versionId, previewDigest: 'c'.repeat(64) };
  const reread = { ...preview, previewDigest: 'd'.repeat(64) } as unknown as CapturedProcedureStopPreviewProjection;
  const stopped = { procedureId: PROCEDURE_ID, title: '体例复核' } as unknown as CapturedProcedureProjection;

  function apiAnswering(stop: () => Promise<CapturedProcedureProjection>) {
    const calls: Array<[string, unknown]> = [];
    return {
      calls,
      api: {
        stopCapturedProcedure: async (input: { procedureId: string; versionId: string | null; previewDigest: string }) => {
          calls.push(['stop', input]);
          return stop();
        },
        previewCapturedProcedureStop: async (input: { procedureId: string; versionId: string | null }) => {
          calls.push(['preview', input]);
          return reread;
        },
      },
    };
  }

  it('confirms exactly the preview on show, and reads nothing again once it stops', async () => {
    const { api, calls } = apiAnswering(async () => stopped);
    expect(await confirmProcedureStop(api, preview)).toEqual({ kind: 'stopped', result: stopped });
    expect(calls).toEqual([['stop', preview]]);
  });

  it('reads the preview again when the service refuses it as stale, and stops nothing', async () => {
    const { api, calls } = apiAnswering(async () => {
      throw Object.assign(new Error('stale'), { code: PROCEDURE_STOP_PREVIEW_STALE_CODE });
    });
    expect(PROCEDURE_STOP_PREVIEW_STALE_CODE).toBe('CAPTURED_PROCEDURE_STOP_PREVIEW_STALE');
    expect(await confirmProcedureStop(api, preview)).toEqual({ kind: 'reread', preview: reread });
    expect(calls).toEqual([['stop', preview], ['preview', { procedureId: PROCEDURE_ID, versionId: V1.versionId }]]);
  });

  it('passes any other refusal to the caller without reading the preview again', async () => {
    const refusal = Object.assign(new Error('not found'), { code: 'CAPTURED_PROCEDURE_NOT_FOUND' });
    const { api, calls } = apiAnswering(async () => {
      throw refusal;
    });
    await expect(confirmProcedureStop(api, preview)).rejects.toBe(refusal);
    expect(calls).toEqual([['stop', preview]]);
  });
});
