import {
  CAPTURED_PROCEDURE_SCOPE_LABELS,
  type BookSummaryCursor,
  type BookSummaryProjection,
  type CapturedProcedureProjection,
  type CapturedProcedureStopPreviewProjection,
  type CapturedProcedureSummaryProjection,
  type CapturedProceduresProjection,
  type CapturedProcedureValidationProjection,
  type CapturedProcedureVersionProjection,
  type DeveloperProposalProjection,
  type DeveloperProposalSummaryProjection,
  type DeveloperProposalVersionProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  PROCEDURES_EMPTY,
  PROCEDURES_SECTION_HEADING,
  PROCEDURES_SECTION_NOTE,
  PROCEDURE_ACTIONS,
  PROCEDURE_LATEST_ELIGIBLE,
  PROCEDURE_LATEST_ELIGIBLE_NOTE,
  PROCEDURE_RUN_BOOK_LABEL,
  PROCEDURE_RUN_NOTE,
  PROCEDURE_STOP_ACTIVE_HEADING,
  PROCEDURE_STOP_KEPT,
  PROCEDURE_STOP_NOTE,
  PROCEDURE_STOP_PREPARED_HEADING,
  PROCEDURE_STOP_STALE,
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
  procedurePackageLinkLine,
  procedurePackagesLine,
  procedureRequirementLine,
  procedureRunLinkLine,
  procedureRunsLine,
  procedureSourceLine,
  procedureStopAfterLine,
  procedureStopHeading,
  procedureStopMoreLine,
  procedureStopMoreVersionsLine,
  procedureStopRunLine,
  procedureStopVersionLine,
  procedureStoppedLine,
  procedureValidationFailedLine,
  procedureValidationResult,
  procedureVersionLine,
  proposalFileSavedLine,
  proposalSavedLine,
  proposalVersionLine,
} from './captured-procedure-labels.js';
import { confirmProcedureStop } from './procedure-choice.js';

/**
 * 知识库 › 工序与规则's 可复用工序 and 开发建议 (Issue #65, plan slice S30; ADR 0087 §3, §5, §6; V2-UX-KB-010, REUSE-029 to
 * REUSE-031, REUSE-040, REUSE-063 to REUSE-066): each Captured Procedure by title with its versions — state, steps, where it came
 * from, the Review Runs each ran — and `验证并启用…`, `停用`, `运行此工序…`; then each Developer Capability Proposal with
 * `导出为文件…` and `修改…`. Everything is read from the service again after each action; identities sit one step away under
 * 查看技术详情.
 */
type ProceduresApi = Pick<RendererApi,
  'inspectCapturedProcedures' | 'inspectCapturedProcedure' | 'inspectDeveloperProposal' | 'previewCapturedProcedureValidation' | 'enableCapturedProcedure' | 'previewCapturedProcedureStop' | 'stopCapturedProcedure' |
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
  /** A Review Run a version ran (Issue #66, S31; REUSE-031): its Book's 审阅, opened on that exact Run. */
  openReviewRun(book: { bookId: string; title: string }, reviewRunId: string): Promise<void>;
  /** A 图书交付包 version holding such a Run's report (Issue #66, S31b; REUSE-031): its Book's 交付物, with that version focused. */
  openDeliverables(book: { bookId: string; title: string }, packageVersionId: string): Promise<void>;
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
  const open: {
    validation: CapturedProcedureValidationProjection | null;
    /** `停用…`'s preview on show (Issue #66, S31): of one version, or of the whole procedure. */
    stop: CapturedProcedureStopPreviewProjection | null;
    runFor: string | null;
    reviseFor: string | null;
  } = { validation: null, stop: null, runFor: null, reviseFor: null };
  /**
   * The procedures and proposals whose versions are open, each at the page shown: `null` for the newest page, otherwise the
   * version number it starts below (Issue #65 review: the list carries summaries; versions are read a page at a time).
   */
  const procedurePages = new Map<string, number | null>();
  const proposalPages = new Map<string, number | null>();
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

  /** `focus` is read once the action ends, so an action may choose where focus goes by how it ended. */
  async function act(busyLine: string, failure: string, body: () => Promise<void>, focus?: string | (() => string)): Promise<void> {
    busy = true;
    options.setStatus(busyLine, 'busy');
    try {
      await body();
    } catch (error) {
      options.setStatus(options.errorMessage(error, failure), 'error');
    } finally {
      busy = false;
    }
    await load(typeof focus === 'function' ? focus() : focus);
  }

  async function load(focus?: string): Promise<void> {
    const projection = await api.inspectCapturedProcedures();
    const listedProcedures = new Set(projection.procedures.map((procedure) => procedure.procedureId));
    const listedProposals = new Set(projection.proposals.map((proposal) => proposal.proposalId));
    for (const id of procedurePages.keys()) if (!listedProcedures.has(id)) procedurePages.delete(id);
    for (const id of proposalPages.keys()) if (!listedProposals.has(id)) proposalPages.delete(id);
    const procedureVersions = new Map(await Promise.all(Array.from(procedurePages, async ([procedureId, before]) =>
      [procedureId, await api.inspectCapturedProcedure({ procedureId, before })] as const)));
    const proposalVersions = new Map(await Promise.all(Array.from(proposalPages, async ([proposalId, before]) =>
      [proposalId, await api.inspectDeveloperProposal({ proposalId, before })] as const)));
    if (!host.isConnected) return;
    paint(projection, procedureVersions, proposalVersions);
    if (focus !== undefined) host.querySelector<HTMLElement>(focus)?.focus();
  }

  function paint(
    projection: CapturedProceduresProjection,
    procedureVersions: ReadonlyMap<string, CapturedProcedureProjection>,
    proposalVersions: ReadonlyMap<string, DeveloperProposalProjection>,
  ): void {
    const procedures = el('section', 'knowledge-captured-procedures');
    procedures.dataset['procedureCount'] = String(projection.procedures.length);
    procedures.append(el('h3', undefined, PROCEDURES_SECTION_HEADING), el('p', 'field-note', PROCEDURES_SECTION_NOTE));
    if (projection.procedures.length === 0) procedures.append(el('p', 'field-note captured-procedures-empty', PROCEDURES_EMPTY));
    for (const procedure of projection.procedures) procedures.append(procedureCard(procedure, procedureVersions.get(procedure.procedureId) ?? null));
    if (projection.proceduresTruncated) procedures.append(el('p', 'field-note', '只列出最近的可复用工序。'));
    const proposals = el('section', 'knowledge-developer-proposals');
    proposals.dataset['proposalCount'] = String(projection.proposals.length);
    proposals.append(el('h3', undefined, PROPOSALS_SECTION_HEADING), el('p', 'field-note', PROPOSALS_SECTION_NOTE));
    if (projection.proposals.length === 0) proposals.append(el('p', 'field-note developer-proposals-empty', PROPOSALS_EMPTY));
    for (const proposal of projection.proposals) proposals.append(proposalCard(proposal, proposalVersions.get(proposal.proposalId) ?? null));
    if (projection.proposalsTruncated) proposals.append(el('p', 'field-note', '只列出最近的开发建议。'));
    host.replaceChildren(procedures, proposals);
  }

  // ---- 可复用工序 ----------------------------------------------------------------------------------------

  /** A paging row: `更早的版本` below the page shown, and `回到最新版本` once off the newest. */
  function pagingRow(kind: 'procedure' | 'proposal', id: string, shownBefore: number | null, nextBefore: number | null): HTMLElement | null {
    if (shownBefore === null && nextBefore === null) return null;
    const pages = kind === 'procedure' ? procedurePages : proposalPages;
    const card = kind === 'procedure' ? `[data-procedure-id="${id}"]` : `[data-proposal-id="${id}"]`;
    const row = el('div', 'button-row captured-procedure-paging');
    if (nextBefore !== null) {
      row.append(button('更早的版本', 'quiet', `${kind}-versions-older`, async () => {
        pages.set(id, nextBefore);
        await load(`${card} h4`);
      }));
    }
    if (shownBefore !== null) {
      row.append(button('回到最新版本', 'quiet', `${kind}-versions-latest`, async () => {
        pages.set(id, null);
        await load(`${card} h4`);
      }));
    }
    return row;
  }

  function procedureCard(procedure: CapturedProcedureSummaryProjection, page: CapturedProcedureProjection | null): HTMLElement {
    const card = el('article', 'captured-procedure');
    card.dataset['procedureId'] = procedure.procedureId;
    card.dataset['procedureRunnable'] = String(procedure.runnable);
    card.dataset['procedureLatestState'] = procedure.latestState;
    const heading = el('h4', undefined, `《${procedure.title}》`);
    heading.tabIndex = -1;
    const latest = el('p', 'captured-procedure-latest');
    latest.append(el('span', `status-pill captured-procedure-state-${procedure.latestState}`, procedure.latestStateLabel),
      el('span', undefined, ` 最新为第 ${procedure.latestVersion} 版 · 共 ${procedure.versionCount} 版`));
    card.append(heading, latest);
    const actions = el('div', 'button-row captured-procedure-actions');
    if (procedure.runnable) {
      actions.append(button(PROCEDURE_ACTIONS.run, 'primary', 'run', async () => {
        open.runFor = open.runFor === procedure.procedureId ? null : procedure.procedureId;
        if (open.runFor !== null && books === null) books = await readBooks();
        await load(`[data-procedure-id="${procedure.procedureId}"] [data-procedure-field="run-book"]`);
      }));
    }
    if (procedure.versionCount > 1 && (procedure.runnable || procedure.latestState !== 'stopped')) {
      actions.append(button(PROCEDURE_ACTIONS.stopAll, 'quiet', 'stop-all', () => openStop(procedure.procedureId, null,
        `[data-procedure-id="${procedure.procedureId}"] > .captured-procedure-stop h5`)));
    }
    const toggle = button(page === null ? `查看各版本（${procedure.versionCount}）` : '收起各版本', 'quiet', 'versions', async () => {
      if (procedurePages.has(procedure.procedureId)) procedurePages.delete(procedure.procedureId);
      else procedurePages.set(procedure.procedureId, null);
      await load(`[data-procedure-id="${procedure.procedureId}"] [data-procedure-action="versions"]`);
    });
    toggle.setAttribute('aria-expanded', String(page !== null));
    actions.append(toggle);
    card.append(actions);
    if (open.runFor === procedure.procedureId) card.append(runChooser(procedure));
    if (open.stop?.procedureId === procedure.procedureId && open.stop.versionId === null) card.append(stopPanel(open.stop));
    if (page !== null) {
      const versions = el('ol', 'captured-procedure-versions');
      for (const version of page.versions) versions.append(versionItem(procedure, version, page.latestEligibleVersionId === version.versionId));
      card.append(versions);
      const paging = pagingRow('procedure', procedure.procedureId, procedurePages.get(procedure.procedureId) ?? null, page.versionsBefore);
      if (paging !== null) card.append(paging);
    }
    return card;
  }

  function versionItem(procedure: CapturedProcedureSummaryProjection, version: CapturedProcedureVersionProjection, latestEligible: boolean): HTMLElement {
    const item = el('li', 'captured-procedure-version');
    item.dataset['versionId'] = version.versionId;
    item.dataset['version'] = String(version.version);
    item.dataset['versionState'] = version.state;
    item.dataset['latestEligible'] = String(latestEligible);
    const pill = el('span', `status-pill captured-procedure-state-${version.state}`, version.stateLabel);
    const line = el('p', 'captured-procedure-version-line');
    line.append(pill);
    // 最新可用 (Issue #66, S31; REUSE-043): the version a new use resolves to now.
    if (latestEligible) line.append(' ', el('span', 'status-pill captured-procedure-latest-eligible', PROCEDURE_LATEST_ELIGIBLE));
    line.append(el('span', undefined, ` 《${version.title}》${procedureVersionLine(version).replace(` · ${version.stateLabel}`, '')}`));
    item.append(line);
    // Its meaning as a visible field note under the line, read in order by a screen reader and seen by everyone else
    // (S31 review P3-6, Issue #684): never only a tooltip, and never hidden from sighted users.
    if (latestEligible) item.append(el('p', 'field-note captured-procedure-latest-eligible-note', PROCEDURE_LATEST_ELIGIBLE_NOTE));
    const steps = el('ol', 'captured-procedure-steps');
    for (const step of version.steps) steps.append(el('li', undefined, captureStepLine(step)));
    // What a Book must have for this version to run there (Issue #66, S31b; REUSE-048): the 新建审阅 sheet says how it fits each Book.
    const requirement = el('p', 'field-note captured-procedure-requirement', procedureRequirementLine(version.steps));
    item.append(steps, requirement, el('p', 'field-note captured-procedure-source', `${procedureSourceLine(version)} · 保存于 ${options.localInstantLabel(version.createdAt)}`));
    const runs = el('p', 'field-note captured-procedure-runs', procedureRunsLine(version));
    item.append(runs);
    // 关联工作 (Issue #66, S31; REUSE-031): each Run an exact link to that Run in its Book's 审阅, never a copy of what it found.
    if (version.runs.length > 0) {
      const list = el('ul', 'captured-procedure-run-links');
      for (const run of version.runs) {
        const entry = el('li');
        const link = button(procedureRunLinkLine(run, options.localInstantLabel(run.createdAt)), 'quiet', 'open-version-run', async () => {
          await options.openReviewRun({ bookId: run.bookId, title: run.bookTitle }, run.reviewRunId);
        });
        link.classList.add('captured-procedure-run-link');
        link.dataset['reviewRunId'] = run.reviewRunId;
        entry.append(link);
        list.append(entry);
      }
      item.append(list);
    }
    // 关联交付 (Issue #66, S31b; REUSE-031): each 图书交付包 version holding a report of a Run under this version, an exact link
    // to its Book's 交付物 — never a copy of what it holds.
    if (version.packageCount > 0) {
      item.append(el('p', 'field-note captured-procedure-packages', procedurePackagesLine(version.packages.length, version.packageCount)));
      const list = el('ul', 'captured-procedure-package-links');
      for (const link of version.packages) {
        const entry = el('li');
        const open = button(procedurePackageLinkLine(link, options.localInstantLabel(link.preparedAt)), 'quiet', 'open-version-package', async () => {
          await options.openDeliverables({ bookId: link.bookId, title: link.bookTitle }, link.packageVersionId);
        });
        open.classList.add('captured-procedure-package-link');
        open.dataset['packageVersionId'] = link.packageVersionId;
        entry.append(open);
        list.append(entry);
      }
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
      const stop = button(PROCEDURE_ACTIONS.stop, 'quiet', 'stop', () => openStop(procedure.procedureId, version.versionId,
        `[data-version-id="${version.versionId}"] .captured-procedure-stop h5`));
      const why = el('small', 'field-note', PROCEDURE_STOP_NOTE);
      why.id = `procedure-stop-${version.versionId}`;
      stop.setAttribute('aria-describedby', why.id);
      actions.append(stop, why);
    }
    if (actions.childElementCount > 0) item.append(actions);
    if (open.validation?.versionId === version.versionId) item.append(validationPanel(open.validation));
    if (open.stop !== null && open.stop.versionId === version.versionId) item.append(stopPanel(open.stop));
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

  /** `停用…` (Issue #66, S31): read the preview first; nothing is stopped until `确认停用`. */
  async function openStop(procedureId: string, versionId: string | null, focus: string): Promise<void> {
    await act('正在查看停用的影响…', '无法查看停用的影响。', async () => {
      open.stop = await api.previewCapturedProcedureStop({ procedureId, versionId });
      open.validation = null;
      options.setStatus(procedureStopAfterLine(open.stop.afterVersion));
    }, focus);
  }

  /**
   * `停用…`'s preview (Issue #66, S31; REUSE-038, REUSE-040, REUSE-041): each version it takes with the history that keeps naming
   * it, the prepared Runs that are prepared again, the approved ones that go on, what a new use takes afterwards, and that nothing
   * is deleted. `确认停用` confirms exactly this preview; one that moved meanwhile is read again.
   */
  function stopPanel(preview: CapturedProcedureStopPreviewProjection): HTMLElement {
    const panel = el('section', 'captured-procedure-stop');
    panel.dataset['stopAfter'] = preview.afterVersion === null ? '' : String(preview.afterVersion);
    panel.dataset['stopVersionCount'] = String(preview.versionCount);
    const heading = el('h5', undefined, procedureStopHeading(preview));
    heading.tabIndex = -1;
    // The section is named by its heading (S31 review P3-6).
    heading.id = `procedure-stop-${preview.procedureId}-${preview.versionId ?? 'all'}`;
    panel.setAttribute('aria-labelledby', heading.id);
    panel.append(heading);
    const runList = (runs: CapturedProcedureStopPreviewProjection['versions'][number]['prepared'], count: number, kind: string): HTMLElement => {
      const list = el('ul', `captured-procedure-stop-runs captured-procedure-stop-${kind}`);
      for (const run of runs) {
        const entry = el('li', undefined, procedureStopRunLine(run));
        entry.dataset['reviewRunId'] = run.reviewRunId;
        list.append(entry);
      }
      if (count > runs.length) list.append(el('li', 'field-note', procedureStopMoreLine(runs.length, count)));
      return list;
    };
    const versions = el('ul', 'captured-procedure-stop-versions');
    for (const version of preview.versions) {
      const entry = el('li');
      entry.dataset['stopVersion'] = String(version.version);
      entry.dataset['stopPrepared'] = String(version.preparedCount);
      entry.dataset['stopActive'] = String(version.activeCount);
      entry.append(el('p', undefined, procedureStopVersionLine(version)));
      if (version.preparedCount > 0) entry.append(el('h6', undefined, PROCEDURE_STOP_PREPARED_HEADING), runList(version.prepared, version.preparedCount, 'prepared'));
      if (version.activeCount > 0) entry.append(el('h6', undefined, PROCEDURE_STOP_ACTIVE_HEADING), runList(version.active, version.activeCount, 'active'));
      versions.append(entry);
    }
    // Versions beyond what one frame holds are stopped too, and counted (S31 review P2-2).
    if (preview.versionCount > preview.versions.length) {
      versions.append(el('li', 'field-note captured-procedure-stop-more', procedureStopMoreVersionsLine(preview.versions.length, preview.versionCount)));
    }
    panel.append(versions, el('p', 'field-note captured-procedure-stop-after', procedureStopAfterLine(preview.afterVersion)),
      el('p', 'field-note captured-procedure-stop-kept', PROCEDURE_STOP_KEPT));
    const card = `[data-procedure-id="${preview.procedureId}"]`;
    const back = preview.versionId === null ? `${card} [data-procedure-action="stop-all"]` : `[data-version-id="${preview.versionId}"] [data-procedure-action="stop"]`;
    const actions = el('div', 'button-row');
    actions.append(
      button(PROCEDURE_ACTIONS.confirmStop, 'primary', 'confirm-stop', () => {
        let stale = false;
        return act('正在停用…', '无法停用。', async () => {
          const confirmation = await confirmProcedureStop(api, preview);
          if (confirmation.kind === 'stopped') {
            open.stop = null;
            options.setStatus(procedureStoppedLine(confirmation.result.title, preview.versionCount), 'success');
          } else {
            // The Runs it touches moved since it was read: it is read again, and the editor looks before stopping.
            open.stop = confirmation.preview;
            stale = true;
            options.setStatus(PROCEDURE_STOP_STALE, 'error');
          }
        }, () => stale
          // Back on the preview read again, at its heading (S31 review P3-6).
          ? `#${CSS.escape(`procedure-stop-${preview.procedureId}-${preview.versionId ?? 'all'}`)}`
          : preview.versionId === null ? `${card} h4` : `[data-version-id="${preview.versionId}"]`);
      }),
      button(PROCEDURE_ACTIONS.cancel, 'quiet', 'cancel-stop', async () => {
        open.stop = null;
        await load(back);
      }),
    );
    panel.append(actions);
    return panel;
  }

  /** 运行此工序…: which Book's 审阅 it opens in; only a Book with a manuscript can be reviewed. */
  function runChooser(procedure: CapturedProcedureSummaryProjection): HTMLElement {
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

  function proposalCard(proposal: DeveloperProposalSummaryProjection, page: DeveloperProposalProjection | null): HTMLElement {
    const card = el('article', 'developer-proposal');
    card.dataset['proposalId'] = proposal.proposalId;
    card.dataset['proposalVersions'] = String(proposal.versionCount);
    const heading = el('h4', undefined, `《${proposal.title}》`);
    heading.tabIndex = -1;
    card.append(heading, el('p', 'field-note developer-proposal-latest',
      `最新为第 ${proposal.latestVersion} 版 · 记录于 ${options.localInstantLabel(proposal.latestCreatedAt)}`));
    const actions = el('div', 'button-row developer-proposal-actions');
    const toggle = button(page === null ? `查看各版本（${proposal.versionCount}）` : '收起各版本', 'quiet', 'proposal-versions', async () => {
      if (proposalPages.has(proposal.proposalId)) proposalPages.delete(proposal.proposalId);
      else proposalPages.set(proposal.proposalId, null);
      await load(`[data-proposal-id="${proposal.proposalId}"] [data-procedure-action="proposal-versions"]`);
    });
    toggle.setAttribute('aria-expanded', String(page !== null));
    // 修改… starts from the newest version, so it opens the newest page.
    actions.append(button(PROCEDURE_ACTIONS.proposalRevise, 'quiet', 'revise-proposal', async () => {
      open.reviseFor = open.reviseFor === proposal.proposalId ? null : proposal.proposalId;
      if (open.reviseFor !== null) proposalPages.set(proposal.proposalId, null);
      await load(`[data-proposal-id="${proposal.proposalId}"] [data-proposal-field="title"]`);
    }), toggle);
    card.append(actions);
    if (page !== null) {
      const shownBefore = proposalPages.get(proposal.proposalId) ?? null;
      const versions = el('ol', 'developer-proposal-versions');
      for (const version of page.versions) versions.append(proposalVersionItem(version, version.version === proposal.latestVersion));
      card.append(versions);
      const paging = pagingRow('proposal', proposal.proposalId, shownBefore, page.versionsBefore);
      if (paging !== null) card.append(paging);
      const latest = page.versions[0];
      if (open.reviseFor === proposal.proposalId && shownBefore === null && latest !== undefined) card.append(reviseForm(page, latest));
    }
    return card;
  }

  function proposalVersionItem(version: DeveloperProposalVersionProjection, latest: boolean): HTMLElement {
    const item = el('li', 'developer-proposal-version');
    item.dataset['proposalVersionId'] = version.proposalVersionId;
    item.dataset['proposalVersion'] = String(version.version);
    item.dataset['proposalFiles'] = String(version.fileCount);
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
  function reviseForm(proposal: DeveloperProposalSummaryProjection, latest: DeveloperProposalVersionProjection): HTMLElement {
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
