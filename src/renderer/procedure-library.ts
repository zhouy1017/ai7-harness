import { PROCEDURE_STAGE_LABELS, procedureStageUsesModel } from '../shared/protocol/procedures.js';
import type { PreinstalledProcedureProjection, EditableProcedureProjection, ProcedureDefinitionPin, SaveProcedureDefinitionInput } from '../shared/protocol/procedures.js';
import type { RendererApi, BookSummaryProjection, BookSummaryCursor } from '../shared/protocol.js';
import { PROCEDURE_PREDECESSOR_NOTE, PROCEDURE_STATE_LABELS, procedureLine, procedureStagesLine } from './knowledge-base-labels.js';
import { mountProcedureRecommendation, ProcedureRecommendationSelection } from './procedure-choice.js';

/** The pre-installed library is read-only in F-26a; Book-dependent availability stays on the ordinary task sheet. */
export function renderProcedureLibrary(procedures: readonly PreinstalledProcedureProjection[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'preinstalled-procedure-library';
  section.dataset['procedureCount'] = String(procedures.length);
  const list = document.createElement('ul');
  list.className = 'knowledge-procedure-list';
  for (const procedure of procedures) {
    const item = document.createElement('li');
    item.dataset['procedureId'] = procedure.procedureId;
    item.dataset['procedureVersion'] = String(procedure.version);
    item.dataset['procedureState'] = procedure.state;
    item.dataset['procedureRuns'] = String(procedure.uses);
    const pill = document.createElement('span');
    pill.className = `status-pill procedure-state-${procedure.state}`;
    pill.textContent = PROCEDURE_STATE_LABELS[procedure.state];
    const words = document.createElement('span');
    words.textContent = ` ${procedureLine(procedure)}`;
    const stages = document.createElement('span');
    stages.className = 'field-note procedure-stages';
    stages.textContent = ` · ${procedureStagesLine(procedure)}`;
    item.append(pill, words, stages);
    if ((procedure.previousVersions?.length ?? 0) > 0) {
      const history = document.createElement('details');
      history.className = 'procedure-previous-versions';
      const summary = document.createElement('summary');
      summary.textContent = '历史版本';
      history.append(summary);
      for (const previous of procedure.previousVersions ?? []) {
        const row = document.createElement('p');
        row.className = 'field-note';
        row.dataset['procedurePreviousVersion'] = String(previous.version);
        // The words carry no identifier (LAYER-008); the retained version's digest stays on the row for inspection.
        row.dataset['procedureDigest'] = previous.digest;
        row.textContent = `第 ${previous.version} 版 · ${previous.stages.map((stage) => stage.label).join(' → ')}`;
        history.append(row);
      }
      item.append(history);
    }
    list.append(item);
  }
  const predecessor = document.createElement('p');
  predecessor.className = 'field-note procedure-predecessor';
  predecessor.textContent = PROCEDURE_PREDECESSOR_NOTE;
  section.append(list, predecessor);
  return section;
}

/** The form owns only its unsaved values; the service owns versions and selections. */
export async function mountEditableProcedureLibrary(root: HTMLElement, api: RendererApi,
  openRun: (book: BookSummaryProjection, kind: string, procedure: ProcedureDefinitionPin) => Promise<void>, errorMessage: (error: unknown, fallback: string) => string): Promise<void> {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
    const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result;
  };
  const action = (label: string, run: () => Promise<void> | void): HTMLButtonElement => {
    const button = node('button', label); button.type = 'button'; button.className = 'secondary';
    button.addEventListener('click', () => { button.disabled = true; void Promise.resolve().then(run).catch(showError).finally(() => { button.disabled = false; }); });
    return button;
  };
  const status = node('p'); status.setAttribute('role', 'status');
  const showError = (error: unknown): void => { status.textContent = errorMessage(error, '无法保存工序，请重试。'); };
  const body = node('div'), formSlot = node('div');
  root.replaceChildren(status, body, formSlot);
  const label = (title: string, input: HTMLElement): HTMLLabelElement => { const result = node('label'); result.className = 'review-field'; result.append(node('span', title), input); return result; };
  const pinOf = ({ procedureId, version, digest }: ProcedureDefinitionPin): ProcedureDefinitionPin => ({ procedureId, version, digest });
  const edit = (entry: EditableProcedureProjection, create: boolean, captureRunId?: string): void => {
    const form = node('form'), title = node('input'), instruction = node('textarea');
    form.dataset['procedureEditor'] = ''; title.dataset['procedureField'] = 'title'; instruction.dataset['procedureField'] = 'instruction';
    title.value = create ? `${entry.document.title} · 自定义` : entry.document.title;
    title.required = true; title.maxLength = 480; instruction.value = entry.document.editorInstruction;
    const local = !entry.document.stages.some((stage) => procedureStageUsesModel(stage, entry.document.stages));
    instruction.disabled = local;
    if (local) form.append(node('p', '确定性检查只在本机运行，不解释文字说明或豁免规则，模型预算为零。请在运行时选择明确的检查选项。'));
    instruction.rows = 4; instruction.maxLength = 12000;
    form.append(node('h4', captureRunId === undefined ? create ? '新建工序' : '改写为新版本' : '从本次运行捕获'),
      label('名称', title), label('编辑任务说明', instruction),
      node('p', '工序沿用所选任务的执行器。阶段按输入依赖顺序运行；不兼容的顺序不能保存。说明和豁免规则合计最多 1200 字，不能覆盖任务契约。'),
      node('p', '模型阶段的预算份额在运行设置了总预算时生效；0 表示沿用总预算约束。固定本地归并和报告阶段不解释文字豁免，模型预算为零。'),
      ...(entry.document.members === undefined ? [] : [node('p', '成员的模型阶段全部勾选「空闲时处理」时，这个成员在其他成员之后、AI7 空闲时才开始，仍属于同一次审阅的授权。')]));
    let stages = structuredClone(entry.document.stages);
    const stageList = node('ol');
    const renderStages = (): void => {
      stageList.replaceChildren();
      stages.forEach((stage, index) => {
        const row = node('li'), rules = node('textarea'), share = node('input');
        rules.value = stage.exemptionRules.join('\n'); rules.rows = 2; rules.disabled = !procedureStageUsesModel(stage, stages); share.disabled = rules.disabled;
        share.type = 'number'; share.min = '0'; share.max = '100'; share.step = '1'; share.value = String(stage.budgetShare * 100);
        rules.addEventListener('input', () => { stages = stages.map((item, i) => i === index ? { ...item, exemptionRules: rules.value.split('\n').filter((text) => text.trim() !== '') } : item); });
        share.addEventListener('input', () => { stages = stages.map((item, i) => i === index ? { ...item, budgetShare: Number(share.value) / 100 } : item); });
        const move = (delta: number): void => {
          const next = index + delta; if (next < 0 || next >= stages.length) return;
          const copy = [...stages]; [copy[index], copy[next]] = [copy[next]!, copy[index]!]; stages = copy; renderStages();
        };
        row.append(node('strong', PROCEDURE_STAGE_LABELS[stage.stageType]), label('豁免规则（每行一条）', rules), label('预算份额 %', share),
          action('上移', () => move(-1)), action('下移', () => move(1)));
        // 空闲时处理 (Issue #1200): a composite's model-member stage only; a member runs idle once all its model stages are marked.
        if (entry.document.members !== undefined && !rules.disabled) {
          const idle = node('input'); idle.type = 'checkbox'; idle.checked = stage.deferred === true; idle.dataset['procedureField'] = 'deferred';
          idle.addEventListener('change', () => { stages = stages.map((item, i) => {
            if (i !== index) return item;
            const { deferred: _deferred, ...rest } = item;
            return idle.checked ? { ...rest, deferred: true as const } : rest;
          }); });
          row.append(label('空闲时处理', idle));
        }
        stageList.append(row);
      });
    };
    renderStages();
    const save = node('button', '保存为新版本'); save.type = 'submit'; save.className = 'primary';
    form.append(stageList, save, action('取消', () => formSlot.replaceChildren()));
    form.addEventListener('submit', (event) => {
      event.preventDefault(); save.disabled = true;
      const input: SaveProcedureDefinitionInput = { procedureId: create ? null : entry.procedureId, basedOn: pinOf(entry),
        title: title.value, editorInstruction: instruction.value, stages, ...(captureRunId === undefined ? {} : { captureRunId }) };
      void api.procedureLibrary({ action: 'save', input }).then(async () => { formSlot.replaceChildren(); status.textContent = '新版本已保存，原版本保持不变。'; await load(); })
        .catch(showError).finally(() => { save.disabled = false; });
    });
    formSlot.replaceChildren(form); title.focus();
  };
  const readBooks = async (): Promise<BookSummaryProjection[]> => {
    const books: BookSummaryProjection[] = [];
    let after: BookSummaryCursor | null = null;
    do { const page = await api.listBooks({ after }); books.push(...page.items); after = page.nextCursor; } while (after !== null);
    return books.filter((book) => book.manuscriptState === 'populated');
  };
  const chooseBook = async (entry: EditableProcedureProjection, pin: ProcedureDefinitionPin, bookId?: string): Promise<void> => {
    const chooser = node('div'), select = node('select'); select.dataset['procedureField'] = 'book';
    const books = await readBooks();
    for (const book of books) select.append(new Option(book.title, book.bookId));
    if (bookId !== undefined) select.value = bookId;
    // A composite (Issue #1173) is chosen for each of its members' kinds and runs as one 审阅 of the chosen Book.
    chooser.append(label('选择图书', select), node('p', entry.document.members === undefined ? '为此书的这类任务选择精确工序版本；打开任务后仍需准备和开始。'
      : '为此书选择这个组合工序版本：打开审阅后按它的成员依次准备；确定性检查选项仍由你明确选择，查看计划后再开始。'), action('打开任务', async () => {
      const book = books.find((item) => item.bookId === select.value); if (book === undefined) return;
      await api.procedureLibrary({ action: 'select', bookId: book.bookId, procedure: pin }); await openRun(book, entry.executorKind, pin);
    }));
    formSlot.replaceChildren(chooser);
  };
  // 工序推荐 (ADR 0090 §1; Issue #1173): for one chosen Book, over this library's definitions and the house's Captured Procedures.
  const recommendationBook = node('select'); recommendationBook.dataset['procedureField'] = 'recommendation-book';
  const recommendationState = new ProcedureRecommendationSelection();
  let current: EditableProcedureProjection[] = [];
  const recommendationSlot = node('section'); recommendationSlot.dataset['procedureLibraryRecommendation'] = '';
  const recommendation = mountProcedureRecommendation({
    root: recommendationSlot, state: recommendationState,
    api: { recommendProcedures: async (intent) => (await api.procedureLibrary({ action: 'recommend', input: { ...intent, bookId: recommendationBook.value } })).recommendation! },
    input: () => ({ goal: '在所选图书运行一项审阅工序', taskKind: 'review-run', scope: 'whole', categoryIds: [] }),
    choose: async (candidate) => {
      const entry = current.find((item) => item.procedureId === candidate.procedureId);
      const pin = entry?.versions.find((version) => version.version === candidate.version);
      // A Captured Procedure is run from its own card in 可复用工序; here only the library's versions open 运行此工序….
      if (entry === undefined || pin === undefined) throw new Error('PROCEDURE_RECOMMENDATION_NOT_IN_LIBRARY');
      await chooseBook(entry, pin, recommendationBook.value);
    },
    edit: () => recommendationBook.focus(),
    browse: () => body.querySelector<HTMLElement>('.knowledge-procedure-list button')?.focus(),
  });
  recommendationBook.addEventListener('change', () => recommendation.refreshIntent());
  const load = async (): Promise<void> => {
    const projection = await api.procedureLibrary({ action: 'inspect' });
    current = [...projection.procedures];
    body.replaceChildren();
    const template = node('select'); template.dataset['procedureField'] = 'template';
    for (const entry of projection.procedures) template.append(new Option(entry.document.title, entry.procedureId));
    body.append(label('新建工序的任务类型', template), action('新建工序', () => {
      const entry = projection.procedures.find((item) => item.procedureId === template.value); if (entry) edit(entry, true);
    }));
    const list = node('ul'); list.className = 'knowledge-procedure-list';
    body.append(list);
    for (const entry of projection.procedures) {
      const card = node('li'); card.dataset['procedureId'] = entry.procedureId; card.dataset['procedureVersion'] = String(entry.version);
      const versions = node('select');
      for (const version of entry.versions) versions.append(new Option(`第 ${version.version} 版`, String(version.version)));
      card.dataset['procedureState'] = entry.stopped ? 'stopped' : 'enabled'; card.dataset['procedureRuns'] = String(entry.uses);
      const pill = node('span', entry.stopped ? '已停用' : '已启用'); pill.className = `status-pill procedure-state-${entry.stopped ? 'stopped' : 'enabled'}`;
      const stages = node('p', entry.document.stages.map((stage) => PROCEDURE_STAGE_LABELS[stage.stageType]).join(' → ')); stages.className = 'field-note procedure-stages';
      card.append(pill, node('h4', `${entry.document.title} · 第 ${entry.version} 版${entry.stopped ? ' · 已停用' : ''}`),
        node('p', `${entry.preInstalled ? '预装' : '本社工序'} · 已使用 ${entry.uses} 次`), stages,
        action('改写为新版本', () => edit(entry, false)), label('运行版本', versions),
        action('运行此工序…', () => chooseBook(entry, entry.versions.find((version) => version.version === Number(versions.value))!)),
        action('停用所选版本', async () => { await api.procedureLibrary({ action: 'stop', procedure: entry.versions.find((version) => version.version === Number(versions.value))! }); await load(); }));
      if (entry.documents.length > 1) {
        const history = node('details'); history.className = 'procedure-previous-versions'; history.append(node('summary', '历史版本'));
        for (const previous of [...entry.documents].reverse().filter((document) => document.version !== entry.version)) {
          const row = node('p', `第 ${previous.version} 版 · ${previous.stages.map((stage) => PROCEDURE_STAGE_LABELS[stage.stageType]).join(' → ')}`);
          row.dataset['procedurePreviousVersion'] = String(previous.version); row.dataset['procedureDigest'] = entry.versions.find((pin) => pin.version === previous.version)!.digest;
          history.append(row);
        }
        card.append(history);
      }
      list.append(card);
    }
    const predecessor = node('p', PROCEDURE_PREDECESSOR_NOTE); predecessor.className = 'field-note procedure-predecessor'; body.append(predecessor);
    const books = await readBooks();
    if (books.length > 0) {
      const chosen = recommendationBook.value;
      recommendationBook.replaceChildren(...books.map((book) => new Option(book.title, book.bookId)));
      if (books.some((book) => book.bookId === chosen)) recommendationBook.value = chosen;
      body.append(label('工序推荐的图书', recommendationBook), recommendationSlot);
    }
    if (projection.completedRuns.length > 0) {
      const runs = node('select'); runs.dataset['procedureField'] = 'capture-run';
      for (const run of projection.completedRuns) runs.append(new Option(`${run.bookTitle} · ${run.title}`, run.runId));
      body.append(label('已完成的运行', runs), action('从本次运行捕获', () => {
        const run = projection.completedRuns.find((item) => item.runId === runs.value)!;
        edit({ ...run.procedure, document: run.document, executorKind: run.executorKind, preInstalled: false, stopped: false, sourceRunId: run.runId, versions: [run.procedure], documents: [run.document], uses: 0 }, true, run.runId);
      }));
    }
  };
  await load();
}
