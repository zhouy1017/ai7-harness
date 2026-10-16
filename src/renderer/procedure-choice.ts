import type {
  CapturedProcedureProjection,
  CapturedProcedureRunProjection,
  CapturedProcedureRunStepProjection,
  CapturedProcedureStopPreviewProjection,
  RendererApi,
  ReviewScopeKind,
  ProcedureRecommendationInput,
  ProcedureRecommendationCandidate,
  ProcedureRecommendationProjection,
} from '../shared/protocol.js';
import { sheetProcedureChosenStatus } from './captured-procedure-labels.js';

type RecommendationIntent = Omit<ProcedureRecommendationInput, 'bookId'>;
/** #66 rev 4 relay: the slot carries editorial outcome classes, not service executor names. */
export function recommendationIntentFromSlot(taskKind: string | undefined, scopeKind: string | undefined, goalDigest: string | undefined): RecommendationIntent {
  return {
    goal: goalDigest ?? '',
    taskKind: scopeKind === 'deliverable' ? 'unclassified'
      : taskKind === 'review' || taskKind === 'factual' || taskKind === 'review-run' ? 'review-run'
        : taskKind === 'analysis' || taskKind === 'baseline-analysis' ? 'baseline-analysis'
          : taskKind === 'writing' ? 'writing' : 'unclassified',
    scope: scopeKind === 'selection' ? 'selection' : 'whole',
    categoryIds: taskKind === 'factual' ? ['factual-review'] : [],
  };
}
function recommendationKey(input: RecommendationIntent): string {
  return JSON.stringify([input.goal.trim(), input.taskKind, input.scope, [...input.categoryIds].sort()]);
}

/** TASK-014: goal edits stale the recommendation and preserve the editor's exact selected revision. */
export class ProcedureRecommendationSelection {
  projection: ProcedureRecommendationProjection | null = null;
  selected: ProcedureRecommendationCandidate | null = null;
  #intent = '';
  #shownIntent: string | null = null;
  #selectedIntent: string | null = null;
  update(input: RecommendationIntent): string { this.#intent = recommendationKey(input); return this.#intent; }
  get stale(): boolean {
    return this.#shownIntent !== null && this.#shownIntent !== this.#intent;
  }
  get selectedNeedsUpdate(): boolean { return this.#selectedIntent !== null && this.#selectedIntent !== this.#intent; }
  receive(key: string, projection: ProcedureRecommendationProjection): boolean {
    if (key !== this.#intent) return false;
    this.projection = projection; this.#shownIntent = key; return true;
  }
  choose(candidate: ProcedureRecommendationCandidate): void { this.selected = candidate; this.#selectedIntent = this.#intent; }
  clear(): void { this.selected = null; this.#selectedIntent = null; }
}

export interface ProcedureRecommendationSurfaceOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'recommendProcedures'>;
  readonly state: ProcedureRecommendationSelection;
  input(): RecommendationIntent;
  choose(candidate: ProcedureRecommendationCandidate): void | Promise<void>;
  browse(): void;
  edit(): void;
  clear?(): void;
}

/** Fill a caller-owned slot; the composer and its Task Intent remain in their existing owner. */
export function mountProcedureRecommendation(options: ProcedureRecommendationSurfaceOptions): { refreshIntent(): void; load(): Promise<void> } {
  const { root, state } = options;
  let busy = false;
  let problem = '';
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element;
  };
  function button(text: string, action: string, run: () => void): HTMLButtonElement {
    const element = node('button', text); element.type = 'button'; element.className = 'quiet';
    element.dataset['recommendationAction'] = action; element.disabled = busy; element.addEventListener('click', run); return element;
  }
  function render(): void {
    root.dataset['recommendationState'] = state.stale || state.selectedNeedsUpdate ? 'stale' : state.projection?.status ?? 'unread';
    const label = node('p', state.stale || state.selectedNeedsUpdate ? '需要更新：任务目标有了变化；所选的确切版本保持不变。' : state.projection?.note ?? '查看适合当前任务的已保存工序。');
    label.setAttribute('role', 'status');
    root.replaceChildren(node('h4', '工序推荐'), label);
    if (state.selected !== null) {
      root.append(node('p', `已选《${state.selected.purpose}》第 ${state.selected.version} 版；选择工序不授予任何权限。`));
      if (options.clear !== undefined) root.append(button('清除工序选择', 'clear', () => { state.clear(); options.clear!(); render(); }));
    }
    if (problem !== '') { const alert = node('p', problem); alert.setAttribute('role', 'alert'); root.append(alert); }
    root.append(button(state.stale ? '更新推荐' : '查看推荐', 'refresh', () => void load()));
    const list = node('ul');
    for (const candidate of state.projection?.candidates ?? []) {
      const item = node('li'); item.dataset['recommendationVersionId'] = candidate.versionId;
      item.append(node('strong', `《${candidate.purpose}》 · ${candidate.kind} · 第 ${candidate.version} 版`));
      for (const line of candidate.rationale) item.append(node('p', line));
      item.append(node('p', `需要：${candidate.requiredInputs.join('、')}`), node('p', `预期结果：${candidate.expectedOutcome}`),
        node('p', `建议类型：${candidate.proposalClasses.join('、') || '无'}；外部操作：${candidate.effectClasses.join('、') || '无'}`));
      const choose = button('选择此版本', 'choose', () => void (async () => {
        busy = true; render();
        try { await options.choose(candidate); state.choose(candidate); }
        catch { problem = '无法选择这一版工序，请重新查看。'; }
        finally { busy = false; if (root.isConnected) render(); }
      })());
      choose.disabled ||= state.stale;
      item.append(choose); list.append(item);
    }
    root.append(list, button('修改意图', 'edit', options.edit), button('浏览可用工序', 'browse', options.browse),
      node('p', state.projection?.excludedSkillReason ?? '外部 Skill 在此版本没有执行器，不参与工序推荐。'),
      node('p', '推荐与选择不会获取、安装、启用或运行工序；计划与授权仍需另行确认。'));
  }
  async function load(): Promise<void> {
    if (busy) return;
    const input = options.input(); const key = state.update(input);
    busy = true; problem = ''; render();
    try { const answer = await options.api.recommendProcedures(input); state.receive(key, answer); }
    catch { problem = '无法读取工序推荐，请稍后再试。'; }
    finally { busy = false; if (root.isConnected) render(); }
  }
  const refreshIntent = (): void => { state.update(options.input()); render(); };
  refreshIntent();
  return { refreshIntent, load };
}

/** #66 rev 4 / #423 rev 6: the only composer integration is the declared DOM slot and its two bubbling events.
 * Observe only slot attributes and insertion; no 7a module imports or Task Intent writes belong here.
 */
export function mountProcedureRecommendationSlots(root: HTMLElement, api: Pick<RendererApi, 'recommendProcedures'>, browse: () => void): { disconnect(): void } {
  const mounted = new WeakMap<HTMLElement, ReturnType<typeof mountProcedureRecommendation>>();
  const mount = (slot: HTMLElement): void => {
    if (mounted.has(slot)) return;
    const surface = mountProcedureRecommendation({
      root: slot, api, state: new ProcedureRecommendationSelection(),
      input: () => recommendationIntentFromSlot(slot.dataset['taskKind'], slot.dataset['scopeKind'], slot.dataset['goalDigest']),
      choose: (candidate) => { slot.dispatchEvent(new CustomEvent('procedure-recommendation-selected', {
        bubbles: true, detail: { procedureId: candidate.procedureId, versionId: candidate.versionId, title: candidate.purpose, matchRationale: candidate.rationale.join('；') },
      })); },
      clear: () => { slot.dispatchEvent(new CustomEvent('procedure-recommendation-cleared', { bubbles: true })); },
      browse,
      edit: () => slot.parentElement?.querySelector<HTMLElement>('textarea, [contenteditable="true"], input[type="text"]')?.focus(),
    });
    mounted.set(slot, surface);
    void surface.load();
  };
  const inserted = (node: Node): void => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches('[data-procedure-recommendation][data-goal-digest]')) mount(node);
    node.querySelectorAll<HTMLElement>('[data-procedure-recommendation][data-goal-digest]').forEach(mount);
  };
  inserted(root);
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes' && change.target instanceof HTMLElement) {
        const surface = mounted.get(change.target);
        if (surface !== undefined) surface.refreshIntent();
        else inserted(change.target);
      } else for (const node of change.addedNodes) inserted(node);
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-task-kind', 'data-scope-kind', 'data-goal-digest'] });
  return { disconnect: () => observer.disconnect() };
}

/**
 * The 新建审阅 sheet's choice of a Captured Procedure version, kept honest while it loads (Issue #66, plan slice S31 review P2-1;
 * REUSE-054: the version the sheet shows is the version that enters the plan), and `确认停用`'s confirmation of the preview on
 * show. Pure, so the unit suite reads it as the sheet and the panel do.
 *
 * Each choice asks the service for its resolution; only the answer to the newest question may fill the sheet, and while any
 * question is open the sheet is loading: 先看计划 waits. A preparation also refuses when the version on show is not the one the
 * sheet holds. A choice whose answer fails keeps the choice the sheet held.
 */
export class ProcedureChoiceRequests {
  #asked = 0;
  #answered = 0;

  /** A new choice: its ticket, which supersedes every earlier one. */
  ask(): number {
    this.#asked += 1;
    return this.#asked;
  }

  /** Whether the answer to `ticket` may still fill the sheet: it answers the newest choice. */
  current(ticket: number): boolean {
    return ticket === this.#asked;
  }

  /** The newest choice has its answer (or failed); an older ticket settles nothing. */
  settle(ticket: number): void {
    if (ticket === this.#asked) this.#answered = ticket;
  }

  /** A choice is waiting for its answer. */
  get loading(): boolean {
    return this.#answered !== this.#asked;
  }
}

export const SHEET_PROCEDURE_LOADING = '正在读取所选的可复用工序；读取完成后再看计划。' as const;
export const SHEET_PROCEDURE_VERSION_MISMATCH = '显示的版本与已读取的工序不一致；请重新选择版本。' as const;

/**
 * The pin a preparation carries, or why it may not start: never while a choice loads, and never for a version other than the
 * one the selector shows. `shownVersionId` is the selector's value, `null` when the sheet shows none.
 */
export function procedurePreparationPin(
  resolved: { readonly versionId: string; readonly documentSha256: string } | null,
  shownVersionId: string | null,
  loading: boolean,
): { pin: { versionId: string; documentSha256: string } | null; refusal: string | null } {
  if (loading) return { pin: null, refusal: SHEET_PROCEDURE_LOADING };
  if (resolved === null) return { pin: null, refusal: null };
  if (shownVersionId !== resolved.versionId) return { pin: null, refusal: SHEET_PROCEDURE_VERSION_MISMATCH };
  return { pin: { versionId: resolved.versionId, documentSha256: resolved.documentSha256 }, refusal: null };
}

/** The part of the 新建审阅 sheet a procedure choice fills: the procedure and its version, the categories ticked, the scope. */
export interface ProcedureSheetChoice {
  readonly procedure: CapturedProcedureRunProjection | null;
  readonly categories: ReadonlySet<string>;
  readonly scope: ReviewScopeKind | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly problem: string | null;
}

/** How a choice ended: returned to categories chosen by hand, answered by the service, or failed with why. */
export type ProcedureChoiceOutcome =
  | { readonly kind: 'cleared' }
  | { readonly kind: 'answered'; readonly run: CapturedProcedureRunProjection }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * What the sheet holds after a choice (ADR 0087 §4; Issue #66, S31). An answer fills it from the resolved version: its steps this
 * Book can take ticked — except a Series step, which the editor chooses apart at each run and which starts unticked (S31b;
 * REUSE-049, REUSE-050) — and every other category closed, the scope its slot. A failed choice changes nothing the sheet held — not
 * the procedure, its version, the categories or the scope — and only says why (Issue #684): it never turns a pinned sheet into an
 * unpinned one chosen by hand. Every answer is a new set, never the one held.
 */
export function procedureChoiceAfter(held: ProcedureSheetChoice, outcome: ProcedureChoiceOutcome): ProcedureSheetChoice {
  if (outcome.kind === 'failed') return { ...held, categories: new Set(held.categories), problem: outcome.reason };
  if (outcome.kind === 'cleared') return { ...held, procedure: null, categories: new Set(), problem: null };
  const { run } = outcome;
  if (run.resolved === null) return { ...held, procedure: run, categories: new Set(), problem: run.unavailableReason };
  return {
    procedure: run,
    categories: new Set(run.resolved.steps.filter((step) => step.available && !step.chosenApart).map((step) => step.categoryId)),
    scope: run.resolved.scopeSlot,
    from: null,
    to: null,
    problem: run.unavailableReason,
  };
}

/**
 * Whether a category's box on a filled sheet is the editor's to tick (Issue #66, S31b): only a Series step this Book can take,
 * chosen apart at each run (REUSE-050). Every other step's box is the procedure's — neither added to nor dropped here (ADR 0087
 * §4) — and a category outside the procedure stays closed. A sheet chosen by hand (`filled` false) leaves every box open.
 */
export function procedureCategoryOpen(filled: boolean, step: Pick<CapturedProcedureRunStepProjection, 'available' | 'chosenApart'> | null): boolean {
  return !filled || (step !== null && step.available && step.chosenApart);
}

/** The selector focus returns to once a choice ends: the one the editor used, while the sheet still shows it. */
export function procedureChoiceFocus(versionChoice: boolean, held: CapturedProcedureRunProjection | null): 'procedure' | 'procedure-version' {
  return versionChoice && held?.resolved != null ? 'procedure-version' : 'procedure';
}

/**
 * What the two selectors show for the procedure the sheet holds: its id (`''` for categories chosen by hand) and its resolved
 * version, `null` when there is none to choose. The sheet draws its selectors from this, so a failed choice — which keeps the
 * procedure it held — puts back the values the editor had before choosing (Issue #691).
 */
export function procedureChoiceSelection(held: CapturedProcedureRunProjection | null): { readonly procedureId: string; readonly versionId: string | null } {
  return { procedureId: held?.procedureId ?? '', versionId: held?.resolved?.versionId ?? null };
}

/** The sheet's own state a choice fills: the same category set, cleared and refilled, so nothing else holding it goes stale. */
export interface ProcedureSheetTarget {
  procedure: CapturedProcedureRunProjection | null;
  readonly categories: Set<string>;
  scope: ReviewScopeKind | null;
  from: string | null;
  to: string | null;
  problem: string | null;
}

/**
 * Copies what a choice leaves (`procedureChoiceAfter`) back into the sheet's state, in place (Issue #691) — safely even when
 * `next` carries the sheet's own set.
 */
export function copyProcedureChoice(target: ProcedureSheetTarget, next: ProcedureSheetChoice): void {
  target.procedure = next.procedure;
  const categories = [...next.categories];
  target.categories.clear();
  for (const categoryId of categories) target.categories.add(categoryId);
  target.scope = next.scope;
  target.from = next.from;
  target.to = next.to;
  target.problem = next.problem;
}

/**
 * The status bar's line once a choice ends, replacing 「正在读取…」 (Issue #691). A reason the sheet shows on its alert line is
 * announced there, once: the status bar then says nothing more, rather than the same reason again — a failed choice, and an answer
 * that cannot run. An answer that fills the sheet says which version it read (`chosen`); a cleared choice read nothing and leaves
 * the bar as it is (`null`).
 */
export function procedureChoiceStatus(outcome: ProcedureChoiceOutcome, chosen: (run: CapturedProcedureRunProjection) => string): string | null {
  if (outcome.kind === 'cleared') return null;
  if (outcome.kind === 'failed' || outcome.run.resolved === null) return '';
  return chosen(outcome.run);
}

/** The sheet's state a choice settles into: what it fills, and the choices it keeps count of. */
export interface ProcedureSheetSettling extends ProcedureSheetTarget {
  readonly requests: Pick<ProcedureChoiceRequests, 'settle'>;
}

/**
 * A choice ending, as the sheet composes it (Issue #691; #705 item 3): its ticket settled, the outcome copied back into the
 * sheet's own state, then what the sheet does with it — the status bar's line (`null` to leave the bar as it is) and the
 * selector focus returns to. The sheet then only draws itself, says the status and moves the focus, so this one function is the
 * composition the unit suite reads.
 */
export function settleProcedureChoice(
  state: ProcedureSheetSettling,
  ticket: number,
  outcome: ProcedureChoiceOutcome,
  versionChoice: boolean,
): { readonly status: string | null; readonly focus: 'procedure' | 'procedure-version' } {
  state.requests.settle(ticket);
  copyProcedureChoice(state, procedureChoiceAfter(state, outcome));
  return { status: procedureChoiceStatus(outcome, sheetProcedureChosenStatus), focus: procedureChoiceFocus(versionChoice, state.procedure) };
}

/**
 * What the status bar says as the sheet closes (Issue #705 item 2): a choice still loading set 「正在读取…」 and its answer, arriving
 * at a closed sheet, fills nothing and says nothing, so the line is cleared here; with no choice loading the bar is left as it is
 * (`null`).
 */
export function procedureSheetCloseStatus(requests: Pick<ProcedureChoiceRequests, 'loading'>): string | null {
  return requests.loading ? '' : null;
}

/** How `确认停用` ended: stopped, or refused as stale with the preview read again for the editor to look at first. */
export type ProcedureStopConfirmation =
  | { readonly kind: 'stopped'; readonly result: CapturedProcedureProjection }
  | { readonly kind: 'reread'; readonly preview: CapturedProcedureStopPreviewProjection };

export const PROCEDURE_STOP_PREVIEW_STALE_CODE = 'CAPTURED_PROCEDURE_STOP_PREVIEW_STALE' as const;

/**
 * `确认停用` (Issue #66, S31; REUSE-038, REUSE-041): confirms exactly the preview on show. When the Runs it touches moved since it
 * was read, the service refuses it as stale and nothing is stopped: the preview is read again and returned, so the editor looks
 * before stopping. Any other failure is the caller's to report.
 */
export async function confirmProcedureStop(
  api: Pick<RendererApi, 'stopCapturedProcedure' | 'previewCapturedProcedureStop'>,
  preview: Pick<CapturedProcedureStopPreviewProjection, 'procedureId' | 'versionId' | 'previewDigest'>,
): Promise<ProcedureStopConfirmation> {
  try {
    return { kind: 'stopped', result: await api.stopCapturedProcedure({ procedureId: preview.procedureId, versionId: preview.versionId, previewDigest: preview.previewDigest }) };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== PROCEDURE_STOP_PREVIEW_STALE_CODE) throw error;
    return { kind: 'reread', preview: await api.previewCapturedProcedureStop({ procedureId: preview.procedureId, versionId: preview.versionId }) };
  }
}
