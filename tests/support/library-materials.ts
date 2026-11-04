import type { EditorialStore } from '../../src/service/store.js';

/** Fixture setup starts from arrival's reference defaults and changes only the state the scenario needs. */
export function setLibraryDecision(store: EditorialStore, input: Parameters<EditorialStore['decideLibraryMaterial']>[0]) {
  const current = store.inspectLibraryMaterial(input.materialId);
  const decision = input.decision;
  const same = decision.kind === 'attribution'
    ? current.attribution?.scope === decision.attribution.scope && (decision.attribution.scope === 'house' ||
      (current.attribution?.scope === 'book' && current.attribution.bookId === decision.attribution.bookId))
    : current.eligibility?.choice === decision.choice && current.eligibility.reason === decision.reason;
  return same ? current : store.decideLibraryMaterial({ ...input, expectedDecisions: current.decisionCount });
}
