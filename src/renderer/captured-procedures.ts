import {
  CAPTURED_PROCEDURE_SCOPE_LABELS,
  type BookSummaryCursor,
  type BookSummaryProjection,
  type CapturedProcedureProjection,
  type CapturedProceduresProjection,
  type CapturedProcedureValidationProjection,
  type CapturedProcedureVersionProjection,
  type DeveloperProposalProjection,
  type DeveloperProposalVersionProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  PROCEDURES_EMPTY,
  PROCEDURES_SECTION_HEADING,
  PROCEDURES_SECTION_NOTE,
  PROCEDURE_ACTIONS,
  PROCEDURE_RUN_BOOK_LABEL,
  PROCEDURE_RUN_NOTE,
  PROCEDURE_STOP_NOTE,
  PROCEDURE_UNAVAILABLE_LINES,
  PROPOSALS_EMPTY,
  PROPOSALS_SECTION_HEADING,
  PROPOSALS_SECTION_NOTE,
  PROPOSAL_FIELDS,
  PROPOSAL_PICK_CAPABILITY,
  PROPOSAL_PICK_TITLE,
  captureStepLine,
  procedureCeilingLines,
  procedureEnabledLine,
  procedureGuidelineLine,
  procedureRunLinkLine,
  procedureRunsLine,
  procedureSourceLine,
  procedureStoppedLine,
  procedureValidationFailedLine,
  procedureValidationResult,
  procedureVersionLine,
  proposalFileSavedLine,
  proposalSavedLine,
  proposalVersionLine,
} from './captured-procedure-labels.js';

/**
 * 知识库 › 工序与规则's 可复用工序 and 开发建议 (Issue #65, plan slice S30; ADR 0087 §3, §5, §6; V2-UX-KB-010, REUSE-029 to
 * REUSE-031, REUSE-040, REUSE-063 to REUSE-066): each Captured Procedure by title with its versions — state, steps, where it came
 * from, the Review Runs each ran — and `验证并启用…`, `停用`, `运行此工序…`; then each Developer Capability Proposal with
 * `导出为文件…` and `修改…`. Everything is read from the service again after each action; identities sit one step away under
 * 查看技术详情.
 */
type ProceduresApi = Pick<RendererApi,
  'inspectCapturedProcedures' | 'previewCapturedProcedureValidation' | 'enableCapturedProcedure' | 'stopCapturedProcedure' |
  'saveDeveloperProposal' | 'saveDeveloperProposalFile' | 'listBooks'>;

export interface MountCapturedProceduresOptions {
  readonly root: HTMLElement;
  readonly api: ProceduresApi;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  localInstantLabel(instant: string): string;
  /** 运行此工序…: the Book's 审阅, its 新建审阅 sheet filled from the procedure. */
  openRun(book: { bookId: string; title: string }, procedureId: string): Promise<void>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const MAX_BOOK_PAGES = 20;

export function mountCapturedProcedures(options: MountCapturedProceduresOptions): { load(): Promise<void> } {
  const { api, root } = options;
  const host = el('div', 'captured-procedures-host');
  root.append(host);
  /** The panel open now, kept across a re-read: the version being validated, the Book chooser, the proposal being revised. */
  const open: { validation: CapturedProcedureValidationProjection | null; runFor: string | null; reviseFor: string | null } = {
    validation: null, runFor: null, reviseFor: null,
  };
  let books: ReadonlyArray<BookSummaryProjection> | null = null;
  let busy = false;

  const button = (label: string, tone: 'primary' | 'secondary' | 'quiet', action: string, run: () => Promise<void> | void): HTMLButtonElement => {
    const node = el('button', tone, label);
    node.type = 'button';
    node.dataset['procedureAction'] = action;
    node.disabled = busy;
    node.addEventListener('click', () => {
      if (busy) return;
      void run();
    });
    return node;
  };

  async function act(busyLine: string, failure: string, body: () => Promise<void>, focus?: string): Promise<void> {
    busy = true;
    options.setStatus(busyLine, 'busy');
    try {
      await body();
    } catch (error) {
      options.setStatus(options.errorMessage(error, failure), 'error');
    } finally {
      busy = false;
    }
    await load(focus);
  }

  async function load(focus?: string): Promise<void> {
    const projection = await api.inspectCapturedProcedures();
    if (!host.isConnected) return;
    paint(projection);
    if (focus !== undefined) host.querySelector<HTMLElement>(focus)?.focus();
  }

  function paint(projection: CapturedProceduresProjection): void {
    const procedures = el('section', 'knowledge-captured-procedures');
    procedures.dataset['procedureCount'] = String(projection.procedures.length);
    procedures.append(el('h3', undefined, PROCEDURES_SECTION_HEADING), el('p', 'field-note', PROCEDURES_SECTION_NOTE));
    if (projection.procedures.length === 0) procedures.append(el('p', 'field-note captured-procedures-empty', PROCEDURES_EMPTY));
    for (const procedure of projection.procedures) procedures.append(procedureCard(procedure));
    if (projection.proceduresTruncated) procedures.append(el('p', 'field-note', '只列出最近的可复用工序。'));
    const proposals = el('section', 'knowledge-developer-proposals');
    proposals.dataset['proposalCount'] = String(projection.proposals.length);
    proposals.append(el('h3', undefined, PROPOSALS_SECTION_HEADING), el('p', 'field-note', PROPOSALS_SECTION_NOTE));
    if (projection.proposals.length === 0) proposals.append(el('p', 'field-note developer-proposals-empty', PROPOSALS_EMPTY));
    for (const proposal of projection.proposals) proposals.append(proposalCard(proposal));
    if (projection.proposalsTruncated) proposals.append(el('p', 'field-note', '只列出最近的开发建议。'));
    host.replaceChildren(procedures, proposals);
  }

  // ---- 可复用工序 ----------------------------------------------------------------------------------------

  function procedureCard(procedure: CapturedProcedureProjection): HTMLElement {
    const card = el('article', 'captured-procedure');
    card.dataset['procedureId'] = procedure.procedureId;
    card.dataset['procedureRunnable'] = String(procedure.runnable);
    const heading = el('h4', undefined, `《${procedure.title}》`);
    heading.tabIndex = -1;
    card.append(heading);
    const actions = el('div', 'button-row captured-procedure-actions');
    if (procedure.runnable) {
      actions.append(button(PROCEDURE_ACTIONS.run, 'primary', 'run', async () => {
        open.runFor = open.runFor === procedure.procedureId ? null : procedure.procedureId;
        if (open.runFor !== null && books === null) books = await readBooks();
        await load(`[data-procedure-id="${procedure.procedureId}"] [data-procedure-field="run-book"]`);
      }));
    }
    if (procedure.versions.some((version) => version.state !== 'stopped') && procedure.versionCount > 1) {
      actions.append(button(PROCEDURE_ACTIONS.stopAll, 'quiet', 'stop-all', () => act('正在停用全部版本…', '无法停用。', async () => {
        const result = await api.stopCapturedProcedure({ procedureId: procedure.procedureId, versionId: null });
        options.setStatus(procedureStoppedLine(result.title, result.versionCount), 'success');
      }, `[data-procedure-id="${procedure.procedureId}"] h4`)));
    }
    if (actions.childElementCount > 0) card.append(actions);
    if (open.runFor === procedure.procedureId) card.append(runChooser(procedure));
    const versions = el('ol', 'captured-procedure-versions');
    for (const version of procedure.versions) versions.append(versionItem(procedure, version));
    card.append(versions);
    if (procedure.versionCount > procedure.versions.length) card.append(el('p', 'field-note', `共 ${procedure.versionCount} 版，只列出最近的 ${procedure.versions.length} 版。`));
    return card;
  }

  function versionItem(procedure: CapturedProcedureProjection, version: CapturedProcedureVersionProjection): HTMLElement {
    const item = el('li', 'captured-procedure-version');
    item.dataset['versionId'] = version.versionId;
    item.dataset['version'] = String(version.version);
    item.dataset['versionState'] = version.state;
    const pill = el('span', `status-pill captured-procedure-state-${version.state}`, version.stateLabel);
    const line = el('p', 'captured-procedure-version-line');
    line.append(pill, el('span', undefined, ` 《${version.title}》${procedureVersionLine(version).replace(` · ${version.stateLabel}`, '')}`));
    item.append(line);
    const steps = el('ol', 'captured-procedure-steps');
    for (const step of version.steps) steps.append(el('li', undefined, captureStepLine(step)));
    item.append(steps, el('p', 'field-note captured-procedure-source', `${procedureSourceLine(version)} · 保存于 ${options.localInstantLabel(version.createdAt)}`));
    const runs = el('p', 'field-note captured-procedure-runs', procedureRunsLine(version));
    item.append(runs);
    if (version.runs.length > 0) {
      const list = el('ul', 'captured-procedure-run-links');
      for (const run of version.runs) list.append(el('li', undefined, procedureRunLinkLine(run, options.localInstantLabel(run.createdAt))));
      item.append(list);
    }
    for (const problem of version.validationProblems) item.append(el('p', 'attention-note captured-procedure-problem', problem));
    if (version.state === 'stopped') item.append(el('p', 'field-note', '已停用：不会再被选用；按它运行过的审阅仍然记着它。'));
    const actions = el('div', 'button-row captured-procedure-version-actions');
    if (version.state === 'pending-validation') {
      actions.append(button(PROCEDURE_ACTIONS.validate, 'primary', 'validate', () => act('正在验证…', '无法验证这一版。', async () => {
        open.validation = await api.previewCapturedProcedureValidation({ versionId: version.versionId });
        options.setStatus(procedureValidationResult(open.validation.passes));
      }, `[data-version-id="${version.versionId}"] .captured-procedure-validation h5`)));
    }
    if (version.state !== 'stopped') {
      const stop = button(PROCEDURE_ACTIONS.stop, 'quiet', 'stop', () => act('正在停用…', '无法停用这一版。', async () => {
        const result = await api.stopCapturedProcedure({ procedureId: procedure.procedureId, versionId: version.versionId });
        if (open.validation?.versionId === version.versionId) open.validation = null;
        options.setStatus(procedureStoppedLine(result.title, 1), 'success');
      }, `[data-version-id="${version.versionId}"]`));
      const why = el('small', 'field-note', PROCEDURE_STOP_NOTE);
      why.id = `procedure-stop-${version.versionId}`;
      stop.setAttribute('aria-describedby', why.id);
      actions.append(stop, why);
    }
    if (actions.childElementCount > 0) item.append(actions);
    if (open.validation?.versionId === version.versionId) item.append(validationPanel(open.validation));
    item.tabIndex = -1;
    item.append(options.technicalDetails('captured-procedure-facts',
      el('dt', undefined, '可复用工序'), el('dd', 'technical-identity', procedure.procedureId),
      el('dt', undefined, '版本'), el('dd', 'technical-identity', version.versionId),
      el('dt', undefined, '文档 SHA-256'), el('dd', 'technical-identity', version.technical.documentSha256),
      el('dt', undefined, '上一版 SHA-256'), el('dd', 'technical-identity', version.technical.previousDocumentSha256 ?? '无（第 1 版）'),
      el('dt', undefined, '来源审阅'), el('dd', 'technical-identity', `${version.source.bookId} · ${version.source.reviewRunId}`),
      ...version.steps.flatMap((step) => [el('dt', undefined, step.label), el('dd', 'technical-identity', `${step.categoryId} · ${step.procedureTitle} · 第 ${step.procedureVersion} 版`)]),
    ));
    return item;
  }

  /** `验证并启用…`'s preview (ADR 0087 §3): every step, today's guideline versions, the ceiling, what stays unavailable. */
  function validationPanel(preview: CapturedProcedureValidationProjection): HTMLElement {
    const panel = el('section', 'captured-procedure-validation');
    panel.dataset['validationPasses'] = String(preview.passes);
    const heading = el('h5', undefined, `验证《${preview.title}》第 ${preview.version} 版`);
    heading.tabIndex = -1;
    panel.append(heading);
    const steps = el('ol', 'captured-procedure-validation-steps');
    for (const step of preview.steps) {
      const item = el('li');
      item.dataset['stepCategory'] = step.categoryId;
      item.append(el('p', undefined, captureStepLine(step)));
      for (const guideline of step.guidelines) item.append(el('p', 'field-note captured-procedure-guideline', procedureGuidelineLine(guideline)));
      if (step.problem !== null) item.append(el('p', 'attention-note', step.problem));
      steps.append(item);
    }
    const ceiling = el('ul', 'captured-procedure-ceiling');
    for (const line of [`范围「${CAPTURED_PROCEDURE_SCOPE_LABELS[preview.scopeSlot]}」`, ...procedureCeilingLines(preview.ceiling)]) ceiling.append(el('li', undefined, line));
    const unavailable = el('ul', 'captured-procedure-unavailable');
    for (const line of PROCEDURE_UNAVAILABLE_LINES) unavailable.append(el('li', undefined, line));
    panel.append(steps, el('h6', undefined, '权限上限'), ceiling, el('h6', undefined, '仍不可用'), unavailable);
    for (const problem of preview.problems.filter((candidate) => !preview.steps.some((step) => step.problem === candidate))) {
      panel.append(el('p', 'attention-note', problem));
    }
    panel.append(el('p', preview.passes ? 'field-note captured-procedure-result' : 'attention-note captured-procedure-result', procedureValidationResult(preview.passes)));
    const actions = el('div', 'button-row');
    actions.append(
      button(PROCEDURE_ACTIONS.confirm, 'primary', 'confirm-enable', () => act('正在启用…', '无法启用这一版。', async () => {
        const result = await api.enableCapturedProcedure({ versionId: preview.versionId, previewDigest: preview.previewDigest });
        open.validation = null;
        const version = result.versions.find((candidate) => candidate.versionId === preview.versionId);
        options.setStatus(version?.state === 'enabled'
          ? procedureEnabledLine(preview.title, preview.version)
          : procedureValidationFailedLine(preview.title, preview.version), version?.state === 'enabled' ? 'success' : 'error');
      }, `[data-version-id="${preview.versionId}"]`)),
      button(PROCEDURE_ACTIONS.cancel, 'quiet', 'cancel-enable', async () => {
        open.validation = null;
        await load(`[data-version-id="${preview.versionId}"] [data-procedure-action="validate"]`);
      }),
    );
    panel.append(actions);
    return panel;
  }

  /** 运行此工序…: which Book's 审阅 it opens in; only a Book with a manuscript can be reviewed. */
  function runChooser(procedure: CapturedProcedureProjection): HTMLElement {
    const panel = el('div', 'captured-procedure-run');
    const label = el('label', 'review-field');
    const select = el('select');
    select.dataset['procedureField'] = 'run-book';
    const reviewable = (books ?? []).filter((book) => book.manuscriptState === 'populated');
    for (const book of reviewable) select.append(new Option(`《${book.title}》`, book.bookId));
    label.append(el('span', undefined, PROCEDURE_RUN_BOOK_LABEL), select);
    const go = button(PROCEDURE_ACTIONS.open, 'primary', 'open-run', async () => {
      const book = reviewable.find((candidate) => candidate.bookId === select.value);
      if (book === undefined) return;
      open.runFor = null;
      await options.openRun({ bookId: book.bookId, title: book.title }, procedure.procedureId);
    });
    go.disabled = reviewable.length === 0;
    panel.append(label, el('p', 'field-note', reviewable.length === 0 ? '还没有导入了稿件的图书。' : PROCEDURE_RUN_NOTE), go);
    return panel;
  }

  async function readBooks(): Promise<BookSummaryProjection[]> {
    const read: BookSummaryProjection[] = [];
    let after: BookSummaryCursor | null = null;
    for (let page = 0; page < MAX_BOOK_PAGES; page += 1) {
      const next = await api.listBooks({ after });
      read.push(...next.items);
      if (next.nextCursor === null) break;
      after = next.nextCursor;
    }
    return read;
  }

  // ---- 开发建议 ------------------------------------------------------------------------------------------

  function proposalCard(proposal: DeveloperProposalProjection): HTMLElement {
    const card = el('article', 'developer-proposal');
    card.dataset['proposalId'] = proposal.proposalId;
    card.dataset['proposalVersions'] = String(proposal.versions.length);
    const heading = el('h4', undefined, `《${proposal.title}》`);
    heading.tabIndex = -1;
    card.append(heading);
    const latest = proposal.versions[0]!;
    const versions = el('ol', 'developer-proposal-versions');
    for (const version of proposal.versions) versions.append(proposalVersionItem(version, version === latest));
    card.append(versions);
    const actions = el('div', 'button-row developer-proposal-actions');
    actions.append(button(PROCEDURE_ACTIONS.proposalRevise, 'quiet', 'revise-proposal', async () => {
      open.reviseFor = open.reviseFor === proposal.proposalId ? null : proposal.proposalId;
      await load(`[data-proposal-id="${proposal.proposalId}"] [data-proposal-field="title"]`);
    }));
    card.append(actions);
    if (open.reviseFor === proposal.proposalId) card.append(reviseForm(proposal, latest));
    return card;
  }

  function proposalVersionItem(version: DeveloperProposalVersionProjection, latest: boolean): HTMLElement {
    const item = el('li', 'developer-proposal-version');
    item.dataset['proposalVersionId'] = version.proposalVersionId;
    item.dataset['proposalVersion'] = String(version.version);
    item.dataset['proposalFiles'] = String(version.files.length);
    item.append(el('p', 'developer-proposal-version-line', proposalVersionLine(version, options.localInstantLabel(version.createdAt))));
    if (latest) {
      const fields = el('dl', 'developer-proposal-fields');
      for (const [key, label] of [['missingCapability', PROPOSAL_FIELDS.missingCapability], ['affectedProcedure', PROPOSAL_FIELDS.affectedProcedure],
        ['direction', PROPOSAL_FIELDS.direction], ['pluginCandidate', PROPOSAL_FIELDS.pluginCandidate]] as const) {
        fields.append(el('dt', undefined, label.replace('（必填）', '')), el('dd', undefined, version[key].trim().length === 0 ? '（未填写）' : version[key]));
      }
      item.append(fields);
    }
    for (const file of version.files.slice(0, 3)) item.append(el('p', 'field-note developer-proposal-file', `已导出为「${file.fileName}」 · ${options.localInstantLabel(file.writtenAt)}`));
    const save = button(PROCEDURE_ACTIONS.proposalFile, 'secondary', 'proposal-file', () => act('正在打开保存对话框…', '无法导出这条开发建议。', async () => {
      const result = await api.saveDeveloperProposalFile({ proposalVersionId: version.proposalVersionId });
      options.setStatus(result.outcome === 'saved' ? proposalFileSavedLine(result.fileName) : '已取消导出；什么都没有写入。', result.outcome === 'saved' ? 'success' : undefined);
    }, `[data-proposal-version-id="${version.proposalVersionId}"] [data-procedure-action="proposal-file"]`));
    save.setAttribute('aria-label', `${PROCEDURE_ACTIONS.proposalFile}（第 ${version.version} 版）`);
    item.append(save, options.technicalDetails('developer-proposal-facts',
      el('dt', undefined, '开发建议'), el('dd', 'technical-identity', `${version.proposalId} · ${version.proposalVersionId}`),
      el('dt', undefined, 'SHA-256'), el('dd', 'technical-identity', version.technical.sha256)));
    return item;
  }

  /** 修改…: the next version, never the one recorded (REUSE-066). */
  function reviseForm(proposal: DeveloperProposalProjection, latest: DeveloperProposalVersionProjection): HTMLElement {
    const form = el('form', 'developer-proposal-form');
    form.noValidate = true;
    const field = (key: 'title' | 'missingCapability' | 'affectedProcedure' | 'direction' | 'pluginCandidate', multiline: boolean): HTMLInputElement | HTMLTextAreaElement => {
      const wrap = el('label', 'procedure-capture-field');
      const input = multiline ? el('textarea') : el('input');
      if (input instanceof HTMLInputElement) input.type = 'text';
      input.value = latest[key];
      input.dataset['proposalField'] = key;
      wrap.append(el('span', undefined, PROPOSAL_FIELDS[key]), input);
      form.append(wrap);
      return input;
    };
    const title = field('title', false);
    const missing = field('missingCapability', true);
    const affected = field('affectedProcedure', true);
    const direction = field('direction', true);
    const plugin = field('pluginCandidate', false);
    const problem = el('p', 'review-problem');
    problem.setAttribute('role', 'alert');
    const actions = el('div', 'button-row');
    actions.append(
      button(`保存为第 ${latest.version + 1} 版`, 'primary', 'save-proposal', async () => {
        problem.textContent = title.value.trim().length === 0 ? PROPOSAL_PICK_TITLE : missing.value.trim().length === 0 ? PROPOSAL_PICK_CAPABILITY : '';
        if (problem.textContent !== '') return;
        await act('正在保存开发建议…', '无法保存开发建议。', async () => {
          const result = await api.saveDeveloperProposal({
            proposalId: proposal.proposalId, title: title.value.trim(), missingCapability: missing.value, affectedProcedure: affected.value,
            direction: direction.value, pluginCandidate: plugin.value,
          });
          open.reviseFor = null;
          options.setStatus(proposalSavedLine(result.title, result.versions[0]!.version), 'success');
        }, `[data-proposal-id="${proposal.proposalId}"] h4`);
      }),
      button(PROCEDURE_ACTIONS.cancel, 'quiet', 'cancel-proposal', async () => {
        open.reviseFor = null;
        await load(`[data-proposal-id="${proposal.proposalId}"] [data-procedure-action="revise-proposal"]`);
      }),
    );
    form.append(problem, actions);
    form.addEventListener('submit', (event) => event.preventDefault());
    return form;
  }

  return { load: () => load() };
}
