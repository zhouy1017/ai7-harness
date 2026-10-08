import { describe, expect, it } from 'vitest';
import {
  ProcedureChoiceRequests,
  SHEET_PROCEDURE_LOADING,
  SHEET_PROCEDURE_VERSION_MISMATCH,
  procedurePreparationPin,
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
