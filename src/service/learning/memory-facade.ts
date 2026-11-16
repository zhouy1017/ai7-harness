import { referencedRules } from './rule-references.js';
import type { DatabaseSync } from 'node:sqlite';
import type { GlobalMemoryItem, HouseReviewPreferenceUse, HouseReviewPreferenceVersion, RecordLearningSupervisionInput, TrustedOperationalScope } from '../../shared/protocol.js';
import { HouseReviewPreferenceLedger, housePreferenceLabel, preferenceNames, withoutNames } from '../house-review-preference.js';
import { EditorialLearningLedger } from './ledger.js';
import { requireStore } from '../store-records.js';
import { editorialMemoryDigest, editorialMemoryPrompt, type EditorialMemorySnapshot } from './editorial-memory.js';
import { SupervisionDirectives } from './supervision-directives.js';

export { housePreferenceLabel, editorialMemoryDigest };
export type { EditorialMemorySnapshot };

/** Preserve the historical reading scope of polish, scoped edit and conflict regeneration. */
export function fastRoleMemoryContext(bookId: string): [string, string] { return [bookId, 'editorial-dialogue']; }

/** Task owners supply only these source facts; no dialogue object crosses the seam. */
export function dialogueMemoryContext(book: { bookId: string; workspace: boolean } | null): [string | null, string] {
  return [book?.bookId ?? null, book === null ? 'global-agent' : book.workspace ? 'agent-workspace' : 'editorial-dialogue'];
}

export function analysisUsesAutomaticMemory(scope: TrustedOperationalScope, version: string | null | undefined, sourceKind: string): boolean {
  return !sourceKind.startsWith('editorial-review/') && scope === 'ordinary-production' && version === 'v35';
}

/** Both values always use the same already-selected snapshot; the existing digest algebra is unchanged. */
export function bindEditorialMemory(base: { systemPrompt: string; promptContractDigest: string }, memory: EditorialMemorySnapshot | null | undefined) {
  return { systemPrompt: editorialMemoryPrompt(base.systemPrompt, memory), promptContractDigest: editorialMemoryDigest(base.promptContractDigest, memory) };
}

/**
 * One operation's memory reads/writes. The caller owns the connection, read context and transaction.
 * Dependencies only read memory provenance or people names; no task owner is called from this seam.
 * No ledger/result cache is retained here: the existing factory controls its own read-proof lifetime.
 */
export class EditorialMemoryFacade {
  constructor(private readonly db: DatabaseSync,
    private readonly learning: () => EditorialLearningLedger = () => new EditorialLearningLedger(db),
    private readonly peopleNames: () => readonly string[] = () => []) {}

  #preferences() { return new HouseReviewPreferenceLedger(this.db, this.learning); }

  request(input: { operationalScope: TrustedOperationalScope; providerProcessingVersion: string | undefined; bookId: string | null; taskKind: string }): EditorialMemorySnapshot | null {
    if (input.operationalScope !== 'ordinary-production' || input.providerProcessingVersion !== 'v35') return null;
    return this.#preferences().memory(input.operationalScope, { bookId: input.bookId, taskKind: input.taskKind,
      ...(input.taskKind.startsWith('custom-analysis/') ? { categoryId: input.taskKind.slice('custom-analysis/'.length) } : {}) }, this.peopleNames());
  }

  reviewPreference(scope: TrustedOperationalScope, bookId: string, categoryId: string) {
    return this.#preferences().use(scope, bookId, categoryId, this.peopleNames());
  }
  history(...args: Parameters<HouseReviewPreferenceLedger['history']>) { return this.#preferences().history(...args); }
  pinned(...args: Parameters<HouseReviewPreferenceLedger['pinned']>) { return this.#preferences().pinned(...args); }
  pinnedVersion(...args: Parameters<HouseReviewPreferenceLedger['pinnedVersion']>) { return this.#preferences().pinnedVersion(...args); }
  pinnedInfluence(...args: Parameters<HouseReviewPreferenceLedger['pinnedInfluence']>) { return this.#preferences().pinnedInfluence(...args); }
  pin(...args: Parameters<HouseReviewPreferenceLedger['pin']>) { return this.#preferences().pin(...args); }
  rebuild(...args: Parameters<HouseReviewPreferenceLedger['rebuild']>) { return this.#preferences().rebuild(...args); }
  refreshGovernance(...args: Parameters<HouseReviewPreferenceLedger['refreshGovernance']>) { return this.#preferences().refreshGovernance(...args); }
  governanceChanged(taskIntentId: string) { return this.#preferences().governanceChanged(taskIntentId, () => this.peopleNames()); }

  referencedRules(preference: HouseReviewPreferenceUse) { return referencedRules(preference); }

  names(preference: HouseReviewPreferenceVersion | null): string[] {
    return preferenceNames(preference?.governance?.baseLines ?? preference?.lines ?? [], this.peopleNames());
  }
  redact(text: string, names: readonly string[]) { return withoutNames(text, names); }
  directives(scope: TrustedOperationalScope) { return new SupervisionDirectives(this.db).history(scope); }
  recordSupervision(scope: TrustedOperationalScope, input: RecordLearningSupervisionInput, items: readonly GlobalMemoryItem[]) {
    const memoryTargets = new SupervisionDirectives(this.db).memoryTargets(input.targets);
    requireStore(memoryTargets.length === 0 || memoryTargets.length === input.targets.length, 'LEARNING_SUPERVISION_INVALID', '请分别治理记忆与偏好条目。');
    const directive = new SupervisionDirectives(this.db).record(scope, input, items);
    if (memoryTargets.length > 0) this.learning().govern(directive, memoryTargets);
    const addsText = input.operation === 'create' || input.operation === 'merge' || input.operation === 'correct' ||
      input.operation === 'supervise' && input.effect === 'correct';
    this.#preferences().refreshGovernance(scope, this.peopleNames(), addsText && (memoryTargets.length > 0 ? 'memory' : true));
  }

  globalSourceBasis(scope: TrustedOperationalScope) {
    return { preference: this.history(scope).at(-1) ?? null, directives: this.directives(scope) };
  }

  /** Read raw memory/source facts at the original points; the Global Agent owns their projection. */
  globalSources(scope: TrustedOperationalScope, originalFields: boolean, basis: ReturnType<EditorialMemoryFacade['globalSourceBasis']>) {
    const names = originalFields ? [] : this.names(basis.preference);
    const legacyDirectives = new SupervisionDirectives(this.db).legacyDirectives(basis.directives);
    const learning = this.learning();
    // The old governance hook obtained a second read context here; preserve that read order.
    const revisions = this.learning().revisions(scope).map(entry => ({ ...entry,
      sourceRevision: entry.usable && entry.current.schema === 'ai7.global-editorial-memory/2'
        ? learning.sourcePinRevision(entry.current.itemId, entry.current.versionId) : null }));
    const legacy = [];
    for (let itemOffset: number | null = 0; itemOffset !== null;) {
      const page = learning.inspect({ signalOffset: 0, itemOffset });
      for (const entry of page.items) if (entry.current.schema !== 'ai7.global-editorial-memory/2' && entry.usable) legacy.push(entry.current);
      itemOffset = page.nextItemOffset;
    }
    return { names, legacyDirectives, revisions, legacy };
  }

  captureDecision(...args: Parameters<EditorialLearningLedger['captureDecision']>) { return this.learning().captureDecision(...args); }
  captureIgnoredFinding(...args: Parameters<EditorialLearningLedger['captureIgnoredFinding']>) { return this.learning().captureIgnoredFinding(...args); }
  captureManual(...args: Parameters<EditorialLearningLedger['captureManual']>) { return this.learning().captureManual(...args); }
  wordImportControlPins(...args: Parameters<EditorialLearningLedger['wordImportControlPins']>) { return this.learning().wordImportControlPins(...args); }
  wordImportControls(...args: Parameters<EditorialLearningLedger['wordImportControls']>) { return this.learning().wordImportControls(...args); }
  retainWordImportSamples(...args: Parameters<EditorialLearningLedger['retainWordImportSamples']>) { return this.learning().retainWordImportSamples(...args); }
  validateWordImportSamples(...args: Parameters<EditorialLearningLedger['validateWordImportSamples']>) { return this.learning().validateWordImportSamples(...args); }
  wordSampleImports(...args: Parameters<EditorialLearningLedger['wordSampleImports']>) { return this.learning().wordSampleImports(...args); }
  wordCurrentEligibility(...args: Parameters<EditorialLearningLedger['wordCurrentEligibility']>) { return this.learning().wordCurrentEligibility(...args); }
  wordCandidates(...args: Parameters<EditorialLearningLedger['wordCandidates']>) { return this.learning().wordCandidates(...args); }
  manualSourcePage(...args: Parameters<EditorialLearningLedger['manualSourcePage']>) { return this.learning().manualSourcePage(...args); }
  controls(...args: Parameters<EditorialLearningLedger['controls']>) { return this.learning().controls(...args); }
  curationEnvelope(...args: Parameters<EditorialLearningLedger['curationEnvelope']>) { return this.learning().curationEnvelope(...args); }
  supervisionDigest(...args: Parameters<EditorialLearningLedger['supervisionDigest']>) { return this.learning().supervisionDigest(...args); }
  curationBooks(...args: Parameters<EditorialLearningLedger['curationBooks']>) { return this.learning().curationBooks(...args); }
  nextCuration(...args: Parameters<EditorialLearningLedger['nextCuration']>) { return this.learning().nextCuration(...args); }
  prepareCuration(...args: Parameters<EditorialLearningLedger['prepareCuration']>) { return this.learning().prepareCuration(...args); }
  proposeCuration(...args: Parameters<EditorialLearningLedger['proposeCuration']>) { return this.learning().proposeCuration(...args); }
  reasonAsk(...args: Parameters<EditorialLearningLedger['reasonAsk']>) { return this.learning().reasonAsk(...args); }
  adoption(...args: Parameters<EditorialLearningLedger['adoption']>) { return this.learning().adoption(...args); }
  change(...args: Parameters<EditorialLearningLedger['change']>) { return this.learning().change(...args); }
  automaticAdmissionFor(...args: Parameters<EditorialLearningLedger['automaticAdmissionFor']>) { return this.learning().automaticAdmissionFor(...args); }
  sourceSnapshot(...args: Parameters<EditorialLearningLedger['sourceSnapshot']>) { return this.learning().sourceSnapshot(...args); }
  validateSourceSnapshot(...args: Parameters<EditorialLearningLedger['validateSourceSnapshot']>) { return this.learning().validateSourceSnapshot(...args); }
  sourceWithdrawalAt(...args: Parameters<EditorialLearningLedger['sourceWithdrawalAt']>) { return this.learning().sourceWithdrawalAt(...args); }
  version(...args: Parameters<EditorialLearningLedger['version']>) { return this.learning().version(...args); }
  effectiveSources(...args: Parameters<EditorialLearningLedger['effectiveSources']>) { return this.learning().effectiveSources(...args); }
  currentSources(...args: Parameters<EditorialLearningLedger['currentSources']>) { return this.learning().currentSources(...args); }
  usable(...args: Parameters<EditorialLearningLedger['usable']>) { return this.learning().usable(...args); }
  sourcePinRevision(...args: Parameters<EditorialLearningLedger['sourcePinRevision']>) { return this.learning().sourcePinRevision(...args); }
  accept(...args: Parameters<EditorialLearningLedger['accept']>) {
    this.learning().accept(...args);
    this.#preferences().refreshGovernance(args[1], this.peopleNames(), 'memory');
  }
  govern(...args: Parameters<EditorialLearningLedger['govern']>) { return this.learning().govern(...args); }
  create(...args: Parameters<EditorialLearningLedger['create']>) { return this.learning().create(...args); }
  deactivate(input: Parameters<EditorialLearningLedger['deactivate']>[0], scope: TrustedOperationalScope) {
    this.learning().deactivate(input, scope);
    this.#preferences().refreshGovernance(scope, this.peopleNames());
  }
  activeMemoryCount(...args: Parameters<EditorialLearningLedger['activeMemoryCount']>) { return this.learning().activeMemoryCount(...args); }
  sourceKeys(...args: Parameters<EditorialLearningLedger['sourceKeys']>) { return this.learning().sourceKeys(...args); }
  revisions(...args: Parameters<EditorialLearningLedger['revisions']>) { return this.learning().revisions(...args); }
  activeTitles(...args: Parameters<EditorialLearningLedger['activeTitles']>) { return this.learning().activeTitles(...args); }
  candidateMemoryCount(...args: Parameters<EditorialLearningLedger['candidateMemoryCount']>) { return this.learning().candidateMemoryCount(...args); }
  affectedMemoryCount(...args: Parameters<EditorialLearningLedger['affectedMemoryCount']>) { return this.learning().affectedMemoryCount(...args); }
  inspect(...args: Parameters<EditorialLearningLedger['inspect']>) { return this.learning().inspect(...args); }
}
