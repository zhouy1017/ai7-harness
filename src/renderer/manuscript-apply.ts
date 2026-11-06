import type { BookFindingProjection, ManuscriptApplyOutcomeProjection, RendererApi } from '../shared/protocol.js';

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
  recoveryState?: (clientEffectId: string, state: 'confirming' | 'unresolved') => void | Promise<void>,
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
  // A projection failure must not prevent the authoritative recovery read.
  try { await recoveryState?.(clientEffectId, 'confirming'); } catch { /* Keep recovering. */ }
  try {
    const outcome = await readOutcome({ manuscriptId, branchId, clientEffectId });
    return { acknowledged: false, failure, outcome, outcomeFailure: undefined };
  } catch (error) {
    try { await recoveryState?.(clientEffectId, 'unresolved'); } catch { /* The caller still receives unknown. */ }
    return { acknowledged: false, failure, outcome: null, outcomeFailure: error };
  }
}

/** The current findings confirmation keeps recovery and reversal available after a partial Apply. */
export interface FindingsBatchFeedback {
  readonly message: string;
  readonly attention: boolean;
  readonly undo?: () => Promise<FindingsBatchFeedback>;
  readonly recover?: () => Promise<FindingsBatchFeedback>;
}

export async function applyFindingBatches(
  suggestions: ReadonlyArray<NonNullable<BookFindingProjection['suggestion']>>,
  api: Pick<RendererApi, 'applyChangeSuggestion' | 'applyChangeSuggestionBatch' | 'reverseAppliedChangeSuggestion' | 'getManuscriptApplyOutcome'>,
): Promise<FindingsBatchFeedback> {
  const first = suggestions[0];
  if (!first || suggestions.some((item) => item.manuscriptId !== first.manuscriptId || item.branchId !== first.branchId)) throw new Error('请选择同一稿件版本的修改建议。');
  const binding = { manuscriptId: first.manuscriptId, branchId: first.branchId, windowStartBlockId: first.blockId };
  type Group = { items: typeof suggestions; effectId: string; state: 'committed' | 'refused' | 'unknown' | 'reversed'; reverseUnknown: string | null };
  const groups: Group[] = [];
  let attempted = 0, reverseRefused = false;
  const committed = (result: ApplyOnceResult<unknown>): boolean => result.acknowledged || result.outcome?.state === 'committed';
  const feedback = (): FindingsBatchFeedback => {
    const count = (state: Group['state']): number => groups.filter((group) => group.state === state).reduce((sum, group) => sum + group.items.length, 0);
    const applied = count('committed'), unknown = count('unknown');
    const unsettledReverse = groups.some((group) => group.reverseUnknown !== null);
    return {
      message: `已接受并应用 ${applied} 条；未应用 ${count('refused')} 条；结果待确认 ${unknown} 条；尚未尝试 ${suggestions.length - attempted} 条；已撤销 ${count('reversed')} 条。${unsettledReverse ? '部分撤销结果待确认，请核对结果。' : reverseRefused ? '部分撤销未执行，请查看历史后重试。' : ''}`,
      attention: unknown > 0 || count('refused') > 0 || attempted < suggestions.length || unsettledReverse || reverseRefused,
      ...(applied > 0 ? { undo: async () => {
        reverseRefused = false;
        for (const group of [...groups].reverse()) {
          if (group.state !== 'committed') continue;
          if (group.reverseUnknown !== null) break; // Never resend an uncertain reversal as a new Effect.
          let reversal = '';
          const result = await applyOnce(binding, (clientEffectId) => { reversal = clientEffectId; return api.reverseAppliedChangeSuggestion({ ...binding, markId: group.items[0]!.markId, clientEffectId }); }, (input) => api.getManuscriptApplyOutcome(input));
          if (committed(result)) group.state = 'reversed';
          else { if (!result.acknowledged && result.outcome === null) group.reverseUnknown = reversal; else reverseRefused = true; break; }
        }
        return feedback();
      } } : {}),
      ...(unknown > 0 || unsettledReverse ? { recover: async () => {
        for (const group of groups) {
          if (group.state !== 'unknown' && group.reverseUnknown === null) continue;
          try {
            const outcome = await api.getManuscriptApplyOutcome({ ...binding, clientEffectId: group.reverseUnknown ?? group.effectId });
            if (group.reverseUnknown !== null) { group.reverseUnknown = null; if (outcome.state === 'committed') group.state = 'reversed'; else reverseRefused = true; }
            else group.state = outcome.state === 'committed' ? 'committed' : 'refused';
          } catch { /* Keep the same unknown Effect for another explicit recovery read; never replay it. */ }
        }
        return feedback();
      } } : {}),
    };
  };
  for (let offset = 0; offset < suggestions.length; offset += 500) {
    const items = suggestions.slice(offset, offset + 500);
    const group: Group = { items, effectId: '', state: 'unknown', reverseUnknown: null }; groups.push(group); attempted += items.length;
    const result = await applyOnce(binding, (clientEffectId) => {
      group.effectId = clientEffectId;
      return items.length === 1
        ? api.applyChangeSuggestion({ ...binding, markId: items[0]!.markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null })
        : api.applyChangeSuggestionBatch({ ...binding, markIds: items.map((item) => item.markId), clientEffectId });
    }, (input) => api.getManuscriptApplyOutcome(input));
    group.state = committed(result) ? 'committed' : !result.acknowledged && result.outcome?.state === 'not-committed' ? 'refused' : 'unknown';
    if (group.state !== 'committed') break;
  }
  return feedback();
}
