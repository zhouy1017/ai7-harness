import type { ManuscriptApplyOutcomeProjection } from '../shared/protocol.js';

/**
 * What one AI7 Apply came to, as the surface that asked for it learns it: the answer itself, or — when
 * the answer never arrived or the Apply was refused — what the records hold for its Effect identity.
 */
export type ApplyOnceResult<T> =
  | { readonly acknowledged: true; readonly result: T }
  | {
      readonly acknowledged: false;
      /** Why no answer arrived: the refusal or the lost acknowledgement; `undefined` when the sender already said why. */
      readonly failure: unknown;
      /** What the records hold for the Effect identity; `null` when even that could not be read. */
      readonly outcome: ManuscriptApplyOutcomeProjection | null;
      readonly outcomeFailure: unknown;
    };

/**
 * One manuscript write through AI7 Apply, wherever an editor asks for it — the Mark Card (Issue #408) or
 * 审阅's results and batch confirmation strip (Issue #417). The Effect identity is made here, once,
 * before anything is sent: if the acknowledgement never arrives the same identity is asked about, never
 * sent again as a new one, so a lost answer cannot become a second Apply (V2-UX-EAPP-006, EREC-004).
 * `send` either answers the Apply's projection, or `undefined` when it already told the editor why it
 * did not complete; a refusal it throws is carried back to the caller beside the recovered outcome.
 */
export async function applyOnce<T>(
  target: { readonly manuscriptId: string; readonly branchId: string },
  send: (clientEffectId: string) => Promise<T | undefined>,
  readOutcome: (input: { manuscriptId: string; branchId: string; clientEffectId: string }) => Promise<ManuscriptApplyOutcomeProjection>,
  newEffectId: () => string = () => crypto.randomUUID(),
): Promise<ApplyOnceResult<T>> {
  const clientEffectId = newEffectId();
  const { manuscriptId, branchId } = target;
  let failure: unknown;
  try {
    const result = await send(clientEffectId);
    if (result !== undefined) return { acknowledged: true, result };
  } catch (error) {
    failure = error;
  }
  try {
    const outcome = await readOutcome({ manuscriptId, branchId, clientEffectId });
    return { acknowledged: false, failure, outcome, outcomeFailure: undefined };
  } catch (error) {
    return { acknowledged: false, failure, outcome: null, outcomeFailure: error };
  }
}
