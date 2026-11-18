
import { navigation, type NavigationCheckpoint } from './navigation-generation.js';
import { technicalWords, technicalLayerVisible } from './technical-layer.js';
import { AGENT_WORKSPACE_WORDS } from './agent-workspace-labels.js';
import type { BookRecordPresentation, BookSummaryPageProjection, BookWorkOverviewProjection, ImportCommitProjection, ManuscriptReimportCommitProjection, ResolvedBookWorkbenchRoute, SourceImportCommitProjection, StagedImportProjection, TaskAuthorizationProjection, TaskPlanKind } from '../shared/protocol.js';
import { mountBookPeople } from './book-people.js';
import type { AnalysisFeedbackDimension } from '../shared/analysis-feedback.js';
import { mountBookSeries } from './series.js';
import { EVALUATION_STATUS, EVALUATION_TITLE, evaluationOverviewLine } from './evaluation-labels.js';
import { DELIVERABLES_ENTRY_LABEL, DELIVERABLES_UNAVAILABLE, PUBLICATION_ACTION_LABELS, deliverablesOverviewLine, publicationStateOf } from './deliverables-labels.js';
import { overviewAnalysisRefusalView } from './overview-refusal-labels.js';
import { type ReviewFocus } from './review-workspace.js';
import { TASK_DRAWER_TITLE } from './task-drawer-labels.js';
import { REVIEW_ACTION_LABELS, REVIEW_CARD_HEADING, REVIEW_WORKSPACE_UNAVAILABLE, reviewOverviewLine } from './review-labels.js';
import { readSampleGuidance, type ShellBookEntry, type ShellBookSection } from '../shared/preferences.js';
import { type ShellPlace } from './shell.js';
import { SAMPLE_GUIDANCE_LABELS } from './onboarding-labels.js';
import { type AnalysisTabId } from './baseline-analysis-card.js';
import { type RecoveryReturnContext } from './import-review.js';
import type { RendererApi } from '../shared/protocol.js';

interface Options {
  panel: () => HTMLElement;
  element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  api: RendererApi & import("../shared/preferences.js").PreferencesRendererApi & import("../shared/appearance.js").AppearanceRendererApi & import("../shared/preferences.js").NotificationsRendererApi;
  button: (label: string, className: "primary" | "secondary" | "quiet", action: () => void | Promise<void>) => HTMLButtonElement;
  openBookSection: (book: ShellBookEntry, section: ShellBookSection) => Promise<void>;
  technicalDetails: (gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>) => HTMLElement;
  setStatus: (message: string, tone?: "busy" | "success" | "error") => void;
  rendererErrorMessage: (error: unknown, fallback: string) => string;
  agentWorkspaceReturn: (bookId: string, bookTitle: string) => () => void;
  leaveThen: (open: () => Promise<void>) => Promise<void>;
  openAgentWorkspace: (bookId: string, back: () => void) => Promise<void>;
  renderTaskAuthorization: (host: HTMLElement, projection: TaskAuthorizationProjection) => void;
  renderBookAnalysis: (bookId: string, bookTitle: string, target?: {readonly revisionId: string; readonly itemKey: string; readonly dimension: AnalysisFeedbackDimension;} | string, focus?: { tab: AnalysisTabId; gap?: number; }) => void;
  rendererErrorCode: (error: unknown) => string | null;
  renderBookReview: (bookId: string, bookTitle: string, focus?: ReviewFocus | null, procedureId?: string | null) => void;
  renderBookDeliverables: (bookId: string, bookTitle: string, openCase?: { caseId: string; publicationVersionId: string; }, focusPackageVersionId?: string) => void;
  renderBookEvaluation: (bookId: string, bookTitle: string, focus?: { recordId: string; riskId: string; }, start?: boolean) => void;
  renderBookSources: (bookId: string, bookTitle: string, focusEvidenceId?: string) => void;
  recordPresentation: (record: BookRecordPresentation) => HTMLElement;
  renderTargetChoice: (staged: StagedImportProjection, selectedChoiceId: StagedImportProjection["targetChoices"][number]["id"] | null, recoveryNotice?: string, recoveryReturn?: RecoveryReturnContext, relationshipSelection?: ("first-manuscript" | "source-only" | "reimport") | null, reuseSourceVersionId?: string | null | undefined, reimportLineageChoice?: string | undefined) => void;
  renderResolvedBookWorkbenchRoute: (route: ResolvedBookWorkbenchRoute, recoveryReturn?: RecoveryReturnContext, navigationRoute?: NavigationCheckpoint) => Promise<void>;
  editorialRecordLabel: (record: BookRecordPresentation) => string;
  appendRecoveryReturnAction: (content: HTMLElement, context: RecoveryReturnContext | undefined) => void;
  replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
  modelSettings: () => Promise<void>;
  shell: import("./shell.js").ShellSurface;
  renderBookWorkbenchChooser: (currentOverview: BookWorkOverviewProjection, accumulated?: ReadonlyArray<BookSummaryPageProjection["items"][number]>, after?: BookSummaryPageProjection["nextCursor"]) => Promise<void>;
  taskSurfaceRefresh: Partial<Record<TaskPlanKind, () => void>>;
  acknowledgeCompletionAfterPaint: (result: ImportCommitProjection) => Promise<boolean>;
  authorityInterrupted: boolean;
}

export function createBookOverviewScreen(state: Options) {
  const { panel, element, api, button, openBookSection, technicalDetails, setStatus, rendererErrorMessage, agentWorkspaceReturn, leaveThen, openAgentWorkspace, renderTaskAuthorization, renderBookAnalysis, rendererErrorCode, renderBookReview, renderBookDeliverables, renderBookEvaluation, renderBookSources, recordPresentation, renderTargetChoice, renderResolvedBookWorkbenchRoute, editorialRecordLabel, appendRecoveryReturnAction, replaceScreen, shell, renderBookWorkbenchChooser, acknowledgeCompletionAfterPaint } = state;


function renderBookOverview(
  overview: BookWorkOverviewProjection,
  // A reimport lands in the manuscript instead (renderImported; Issue #412).
  completion?: Exclude<ImportCommitProjection, ManuscriptReimportCommitProjection>,
  recoveryReturn?: RecoveryReturnContext,
): void {
  const sourceCompletion: SourceImportCommitProjection | undefined =
    completion && 'sourceImportRecordId' in completion ? completion : undefined;
  const content = panel();
  content.classList.add('book-overview');
  content.dataset['bookId'] = overview.book.bookId;
  content.dataset['manuscriptState'] = overview.manuscriptState.state;
  if (completion) content.dataset['importCommitId'] = completion.commitId;
  content.append(
    element('h2', undefined, '工作概览'),
    element('p', 'lede', overview.manuscriptState.label),
  );
  // V2-UX-BOOK-001: with a primary Manuscript the overview leads with it — the Revision, where the
  // editor last was, and whether the edits are in the journal — above the Book's own identity and
  // every record below. Its continuation action sits with these manuscript readings.
  const anchor = overview.manuscriptAnchor;
  const guidance = element('section', 'onboarding-guidance');

  const isSample = overview.records.some((record) => record.kind === 'source' && record.sourceDigest ===
    'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483');
  if (isSample && anchor !== null) {
    void api.getPreferences().then(async (preferences) => {
      const visible = await readSampleGuidance(isSample, preferences.values['onboarding.state'],
        () => api.inspectBaselineAnalysis().then((analysis) => analysis.resultSetRevision !== null));
      if (!guidance.isConnected || !visible) return;
      guidance.dataset['onboardingGuidance'] = 'sample-book';
      guidance.append(element('h3', undefined, SAMPLE_GUIDANCE_LABELS.title));
      const links = element('div', 'button-row');
      const book = { bookId: overview.book.bookId, title: overview.book.title };
      for (const { label, section } of SAMPLE_GUIDANCE_LABELS.steps) {
        const link = button(label, 'secondary', () => void openBookSection(book, section));
        link.dataset['onboardingStep'] = section;
        links.append(link);
      }
      guidance.append(links);
    }).catch(() => undefined);
  }
  if (anchor !== null) {
    // The hero card (Issue #1413 cluster 4): the manuscript's revision, where the editor was and its save state, with
    // 继续编辑稿件 as the page's one primary action.
    const anchorSection = element('section', 'source-card manuscript-anchor overview-hero');
    anchorSection.dataset['manuscriptAnchor'] = anchor.entry === null ? 'no-entry-position' : anchor.entry.state;
    const anchorValues = element('dl');
    anchorValues.append(
      ...(technicalLayerVisible ? [element('dt', undefined, '修订版'), element('dd', undefined, anchor.revisionLabel)] : []),
      element('dt', undefined, '上次位置'),
      element('dd', undefined, anchor.entry === null
        ? '尚未记录；打开稿件时从稿件开头开始'
        : anchor.entry.state === 'nearest-anchor'
          ? `${anchor.entry.label} · 原位置已不存在，将从最近的位置打开`
          : anchor.entry.label),
      element('dt', undefined, '保存状态'), element('dd', undefined, technicalWords(anchor.journalLabel, '已保存')),
    );
    anchorSection.append(element('h3', undefined, '稿件'), anchorValues, technicalDetails(
      undefined,
      element('dt', undefined, '稿件 ID'), element('dd', 'technical-identity', anchor.manuscriptId),
      element('dt', undefined, '分支 ID'), element('dd', 'technical-identity', anchor.branchId),
      element('dt', undefined, '修订版 ID'), element('dd', 'technical-identity', anchor.revisionId),
      element('dt', undefined, '修订日志序号'), element('dd', 'technical-identity', String(anchor.journalSequence)),
      element('dt', undefined, '上次位置段落 ID'),
      element('dd', 'technical-identity', anchor.entry === null ? '—' : anchor.entry.blockId),
      element('dt', undefined, '上次位置字素'),
      element('dd', 'technical-identity', anchor.entry === null ? '—' : String(anchor.entry.grapheme)),
    ));
    content.append(anchorSection);
    content.append(guidance);
  }
  const identity = element('section', 'source-card');
  const identityValues = element('dl');
  identityValues.append(
    element('dt', undefined, '内部编号'), element('dd', undefined, overview.book.internalNumber ?? '未设置'),
  );
  identity.append(element('h3', undefined, '图书'), identityValues, technicalDetails(
    undefined,
    element('dt', undefined, '图书 ID'), element('dd', 'technical-identity', overview.book.bookId),
    element('dt', undefined, '稳定标识'), element('dd', 'technical-identity', overview.book.stableIdentity),
  ));
  // 人员 (Issue #431, S83; BOOK-006): the Book's 作者, 责编 and 相关人, and 编辑人员….
  const peopleSlot = element('div', 'book-people-slot');

  mountBookPeople({
    root: peopleSlot,
    bookId: overview.book.bookId,
    people: overview.people,
    api: api,
    setStatus,
    errorMessage: rendererErrorMessage,
  });
  // 书系 (Issue #63, S28a; SER-009): the Series the Book is in, and its membership change records.
  const seriesSlot = element('section');

  mountBookSeries({ root: seriesSlot, bookId: overview.book.bookId, api: api });

  const agentEntry = element('div', 'agent-workspace-entry');
  agentEntry.dataset['agentWorkspaceEntry'] = 'available';
  const openAgent = button(AGENT_WORKSPACE_WORDS.overviewEntry, 'secondary', () => {
    const back = agentWorkspaceReturn(overview.book.bookId, overview.book.title);
    void leaveThen(() => openAgentWorkspace(overview.book.bookId, back));
  });
  openAgent.dataset['agentWorkspaceAction'] = 'open';
  agentEntry.append(openAgent);


  const taskHost = element('div');
  taskHost.dataset['taskAuthorizationBookId'] = overview.book.bookId;
  const inspectTaskAuthorization = async (): Promise<void> => {
    const page = navigation.read(taskHost);
    if (!page.isCurrent() || !taskHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    // The fixed Task belongs only to the development-ci baseline (ADR 0044, J-03).
    // Reuse the existing settings projection; an unknown scope retains the original surface (#992).
    const scope = await api.getModelServiceSettings().then(
      (projection) => projection.launchPolicy.operationalScope,
      () => null,
    );
    if (!page.isCurrent() || !taskHost.isConnected) return;
    if (scope === 'ordinary-production' || scope === 'developer-live') {
      taskHost.replaceChildren();
      return;
    }
    await api.inspectTaskAuthorization().then(
      (projection) => {
        if (page.isCurrent() && taskHost.isConnected && projection.bookId === taskHost.dataset['taskAuthorizationBookId']) {
          renderTaskAuthorization(taskHost, projection);
        }
      },
      (error) => {
        if (!page.isCurrent() || !taskHost.isConnected) return;
        const unavailable = element('section', 'task-authorization-card attention-note');
        unavailable.dataset['taskAuthorizationState'] = 'unavailable';
        unavailable.append(
          element('h3', undefined, TASK_DRAWER_TITLE),
          element('p', undefined, rendererErrorMessage(error, '无法读取本地图书的任务记录。')),
        );
        taskHost.replaceChildren(unavailable);
      },
    );
  };
  // 工作概览 is a destination that shows the Book whole (editor-surfaces §2): the analysis is one line
  // here — what state it is in — and its own destination under 资料与记录 is one step away (§3).
  const analysisHost = element('section', 'book-analysis-summary');
  analysisHost.dataset['analysisBookId'] = overview.book.bookId;
  const analysisState = element('div');
  const analysisOpen = button('打开分析', 'secondary', () => renderBookAnalysis(overview.book.bookId, overview.book.title));
  analysisOpen.dataset['analysisAction'] = 'open-analysis';
  analysisHost.append(element('h3', undefined, '分析'), analysisState, analysisOpen);
  const inspectBaselineAnalysis = (): void => {
    const page = navigation.read(analysisHost);
    if (!page.isCurrent() || !analysisHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    void api.inspectBaselineAnalysis().then(
      (projection) => {
        if (!page.isCurrent() || !analysisHost.isConnected || projection.bookId !== analysisHost.dataset['analysisBookId']) return;
        analysisHost.dataset['analysisState'] = projection.state;
        if (projection.resultSetRevision !== null) void api.getPreferences().then((preferences) => {
          if (guidance.isConnected && preferences.values['onboarding.state'] !== null) guidance.remove();
        }, () => undefined);
        analysisState.replaceChildren(
          element('p', undefined, projection.resultSetRevision === null
            ? `${technicalWords('基线分析', '稿件分析')} · ${projection.stateLabel}`
            : technicalWords(`基线分析 · ${projection.stateLabel} · 读的是 ${projection.resultSetRevision.manuscriptPin.revisionLabel} · ${projection.resultSetRevision.freshness.state === 'current' ? '稿件此后没有改动' : '稿件此后有改动'}`,
              `稿件分析 · ${projection.stateLabel} · ${projection.resultSetRevision.freshness.state === 'current' ? '与当前稿件一致' : '稿件已更新，可重新分析'}`)),
        );
      },
      (error) => {
        if (!page.isCurrent() || !analysisHost.isConnected) return;
        analysisHost.dataset['analysisState'] = 'unavailable';
        const code = rendererErrorCode(error);
        const refusal = overviewAnalysisRefusalView(code, '暂时无法读取分析状态，请打开分析重试。');
        analysisState.replaceChildren(element('p', 'attention-note', technicalWords(rendererErrorMessage(error, refusal.text), refusal.text)));
        if (refusal.actionLabel !== null) {
          analysisState.append(button('去设置', 'quiet', () => void state.modelSettings()));
        }

      },
    );
  };
  // 审阅 is one line here as well (editor-surfaces §2, §4): the latest Review Run and what waits for the
  // editor, one step from its destination under 工作, which comes before 资料与记录's 分析.
  const reviewHost = element('section', 'book-review-summary');
  reviewHost.dataset['reviewBookId'] = overview.book.bookId;
  const reviewState = element('div');
  const reviewOpen = button(REVIEW_ACTION_LABELS['open-review'], 'secondary', () => renderBookReview(overview.book.bookId, overview.book.title));
  reviewOpen.dataset['reviewAction'] = 'open-review';
  reviewHost.append(element('h3', undefined, REVIEW_CARD_HEADING), reviewState, reviewOpen);
  const inspectReviewSummary = (): void => {
    const page = navigation.read(reviewHost);
    if (!page.isCurrent() || !reviewHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    // The line needs the Runs and the coverage only, so it asks for the page after the last finding —
    // an empty one — and never carries a Run's findings onto the overview.
    void api.inspectReviewWorkspace({ reviewRunId: null, findingsAfterOrdinal: Number.MAX_SAFE_INTEGER }).then(
      (workspace) => {
        if (!page.isCurrent() || !reviewHost.isConnected || workspace.bookId !== reviewHost.dataset['reviewBookId']) return;
        reviewHost.dataset['reviewState'] = workspace.run === null ? 'empty' : workspace.run.state;
        reviewState.replaceChildren(element('p', undefined, reviewOverviewLine(workspace)));
      },
      (error) => {
        if (!page.isCurrent() || !reviewHost.isConnected) return;
        reviewHost.dataset['reviewState'] = 'unavailable';
        reviewState.replaceChildren(
          element('p', 'attention-note', technicalWords(rendererErrorMessage(error, REVIEW_WORKSPACE_UNAVAILABLE), REVIEW_WORKSPACE_UNAVAILABLE)),
        );
      },
    );
  };
  // 交付物 is one line too (editor-surfaces §2: 交付物一行计数): where the manuscript's 发稿 stands — how many
  // milestones, which 发稿版本, whether the manuscript changed since — one step from its destination under
  // 工作, after 审阅. No percentage (WORK-007).
  const deliverablesHost = element('section', 'book-deliverables-summary');
  deliverablesHost.dataset['deliverablesBookId'] = overview.book.bookId;
  const deliverablesState = element('div');
  const deliverablesOpen = button(PUBLICATION_ACTION_LABELS.open, 'secondary', () => renderBookDeliverables(overview.book.bookId, overview.book.title));
  deliverablesOpen.dataset['deliverablesAction'] = 'open';
  deliverablesHost.append(element('h3', undefined, DELIVERABLES_ENTRY_LABEL), deliverablesState, deliverablesOpen);
  const inspectDeliverablesSummary = (): void => {
    const page = navigation.read(deliverablesHost);
    if (!page.isCurrent() || !deliverablesHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    void api.inspectDeliverables().then(
      (deliverables) => {
        if (!page.isCurrent() || !deliverablesHost.isConnected || deliverables.bookId !== deliverablesHost.dataset['deliverablesBookId']) return;
        deliverablesHost.dataset['deliverablesState'] = publicationStateOf(deliverables);
        deliverablesState.replaceChildren(
          element('p', undefined, deliverablesOverviewLine(deliverables)),
        );
      },
      (error) => {
        if (!page.isCurrent() || !deliverablesHost.isConnected) return;
        deliverablesHost.dataset['deliverablesState'] = 'unavailable';
        deliverablesState.replaceChildren(
          element('p', 'attention-note', technicalWords(rendererErrorMessage(error, DELIVERABLES_UNAVAILABLE), DELIVERABLES_UNAVAILABLE)),
        );
      },
    );
  };
  // 评估 is one line too (Issue #429, S81a; editor-surfaces §5): the latest version, its state, total and conclusion, one step
  // from its destination.
  const evaluationHost = element('section', 'book-evaluation-summary');
  evaluationHost.dataset['evaluationBookId'] = overview.book.bookId;
  const evaluationState = element('div');
  const evaluationOpen = button('打开评估', 'secondary', () => renderBookEvaluation(overview.book.bookId, overview.book.title));
  evaluationOpen.dataset['evaluationAction'] = 'open';
  evaluationHost.append(element('h3', undefined, EVALUATION_TITLE), evaluationState, evaluationOpen);
  const inspectEvaluationSummary = (): void => {
    const page = navigation.read(evaluationHost);
    if (!page.isCurrent() || !evaluationHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    void api.inspectEvaluation({ recordId: null }).then(
      (workspace) => {
        if (!page.isCurrent() || !evaluationHost.isConnected || workspace.bookId !== evaluationHost.dataset['evaluationBookId']) return;
        evaluationHost.dataset['evaluationState'] = workspace.records[0]?.state ?? 'empty';
        evaluationState.replaceChildren(element('p', undefined, evaluationOverviewLine(workspace)));
      },
      (error) => {
        if (!page.isCurrent() || !evaluationHost.isConnected) return;
        evaluationHost.dataset['evaluationState'] = 'unavailable';
        evaluationState.replaceChildren(
          element('p', 'attention-note', technicalWords(rendererErrorMessage(error, EVALUATION_STATUS.unavailable), EVALUATION_STATUS.unavailable)),
        );
      },
    );
  };
  // The four work areas side by side (Issue #1413 cluster 4): 审阅 · 评估 · 分析 · 交付物, each its state, its count and its way in.
  const secondary = element('div', 'book-overview-secondary');
  if (overview.manuscriptState.state === 'populated') {
    const grid = element('div', 'book-overview-grid');
    for (const host of [reviewHost, evaluationHost, analysisHost, deliverablesHost]) host.classList.add('book-overview-tile');
    grid.append(reviewHost, evaluationHost, analysisHost, deliverablesHost);
    content.append(grid);
    const sources = element('section', 'overview-line book-sources-summary');
    sources.append(element('h3', undefined, '来源与证据'),
      button('查看来源与证据', 'quiet', () => renderBookSources(overview.book.bookId, overview.book.title)));
    secondary.append(sources);
    if (technicalLayerVisible) content.append(taskHost);
  }

  const detailHost = element('div');
  const actions = element('div', 'button-row');
  const completionActionButtons: HTMLButtonElement[] = [];
  if (sourceCompletion) {
    const sourceRecord = sourceCompletion.receipt.source;
    const sourceImportRecord = sourceCompletion.receipt.record;
    if (sourceRecord.sourceVersionId !== sourceCompletion.sourceVersionId ||
      sourceImportRecord.sourceImportRecordId !== sourceCompletion.sourceImportRecordId) {
      throw new Error('AI7_SOURCE_IMPORT_RESULT_INVALID');
    }
    const viewSource = button('查看来源材料', 'primary', () => detailHost.replaceChildren(recordPresentation(sourceRecord)));
    viewSource.dataset['viewSourceVersionId'] = sourceCompletion.sourceVersionId;
    const viewImportRecord = button('查看来源导入记录', 'secondary', () =>
      detailHost.replaceChildren(recordPresentation(sourceImportRecord)));
    viewImportRecord.dataset['viewSourceImportRecordId'] = sourceCompletion.sourceImportRecordId;
    viewSource.disabled = true;
    viewImportRecord.disabled = true;
    completionActionButtons.push(viewSource, viewImportRecord);
    actions.append(viewSource, viewImportRecord);
  }
  if (overview.primaryAction.kind === 'import-first-manuscript' && !sourceCompletion) {
    const importFirst = button('导入首份稿件', 'primary', async () => {
      importFirst.disabled = true;
      setStatus('正在本地解析 DOCX…', 'busy');
      try {
        const result = await api.selectAndStageManuscript();
        if (result.status === 'cancelled') {
          importFirst.disabled = false;
          setStatus('已取消文件选择');
          return;
        }
        let staged = result.staged;
        let exactChoice = staged.targetChoices.find(
          (choice) => choice.kind === 'existing-book' && choice.bookId === overview.book.bookId,
        );
        if (!exactChoice) {
          exactChoice = {
            kind: 'existing-book',
            id: `existing-book:${overview.book.bookId}`,
            bookId: overview.book.bookId,
            label: `${overview.book.title} · ${overview.book.internalNumber === null ? '' : `内部编号 ${overview.book.internalNumber} · `}图书 ID ${overview.book.bookId}`,
            internalNumber: overview.book.internalNumber,
            manuscriptState: 'empty',
            reimportLineageSourceVersionIds: [],
            reimportLineagePageAfter: null,
            reimportLineagePreviousCursor: null,
            reimportLineageNextCursor: null,
            selected: false,
          };
          staged = { ...staged, targetChoices: [...staged.targetChoices, exactChoice] };
        }
        renderTargetChoice(staged, exactChoice.id, undefined, recoveryReturn);
      } catch (error) {
        importFirst.disabled = false;
        setStatus(rendererErrorMessage(error, '无法开始首份稿件导入。'), 'error');
      }
    });
    actions.append(importFirst);
    if (completion) {
      importFirst.disabled = true;
      completionActionButtons.push(importFirst);
    }
  } else if (overview.primaryAction.kind === 'open-manuscript') {
    const primaryActionButton = button('继续编辑稿件', 'primary', async () => {
      setStatus('正在打开稿件…', 'busy');
      try {
        await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId: overview.book.bookId, bookTitle: overview.book.title }, recoveryReturn);
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error');
      }
    });
    actions.append(primaryActionButton);
    if (completion) {
      primaryActionButton.disabled = true;
      completionActionButtons.push(primaryActionButton);
    }
  }


  const records = element('section', 'review-section record-navigation');
  if (technicalLayerVisible) records.append(element('h3', undefined, '精确记录'));
  const recordButtons = element('div', 'button-row');
  for (const record of overview.records) {
    if (!technicalLayerVisible && ['book', 'manuscript', 'revision', 'workflow'].includes(record.kind)) continue;
    const open = button(editorialRecordLabel(record), 'secondary', () => detailHost.replaceChildren(recordPresentation(record)));
    open.dataset['recordKind'] = record.kind;
    if (record.kind === 'book') open.dataset['recordId'] = record.bookId;
    else if (record.kind === 'manuscript') open.dataset['recordId'] = record.manuscriptId;
    else if (record.kind === 'revision') open.dataset['recordId'] = record.revisionId;
    else if (record.kind === 'source') open.dataset['recordId'] = record.sourceVersionId;
    else if (record.kind === 'workflow') open.dataset['recordId'] = record.workflowInstanceId;
    else if (record.kind === 'import-record') open.dataset['recordId'] = record.importRecordId;
    else if (record.kind === 'source-import-record') open.dataset['recordId'] = record.sourceImportRecordId;
    else open.dataset['recordId'] = record.reimportRecordId;
    recordButtons.append(open);
  }
  records.append(recordButtons, detailHost);
  const historyNavigation = element('div', 'button-row compact-actions');
  const replaceHistoryPage = async (historyCursor: NonNullable<BookWorkOverviewProjection['historyPage']['nextCursor']>) => {
    const current = navigation.begin();
    setStatus('正在读取图书历史页…', 'busy');
    try {
      const next = await api.getBookOverview({ bookId: overview.book.bookId, historyCursor });
      if (!current.isCurrent()) return;
      navigation.present(() => renderBookOverview(next, undefined, recoveryReturn));
    } catch (error) {
      if (navigation.errorIsCurrent(error, current)) setStatus(rendererErrorMessage(error, '无法读取图书历史页。'), 'error');
    }
  };
  if (overview.historyPage.previousCursor !== null) {
    const previous = button('较早记录', 'quiet', () => void replaceHistoryPage(overview.historyPage.previousCursor!));
    previous.dataset['bookHistoryPrevious'] = overview.historyPage.previousCursor.stableId;
    historyNavigation.append(previous);
  }
  if (overview.historyPage.nextCursor !== null) {
    const next = button('较新记录', 'quiet', () => void replaceHistoryPage(overview.historyPage.nextCursor!));
    next.dataset['bookHistoryNext'] = overview.historyPage.nextCursor.stableId;
    historyNavigation.append(next);
  }
  records.append(historyNavigation);
  // 导入记录 folds away below the work (Issue #1413 cluster 4); a Book with no manuscript yet or an import just finished
  // opens it. It is where the removed 历史与恢复 row led (#1521).
  const history = element('details', 'book-overview-history');
  history.open = overview.manuscriptState.state !== 'populated' || sourceCompletion !== undefined;
  history.append(element('summary', undefined, technicalWords('精确记录', '导入记录')), records);
  secondary.prepend(peopleSlot, seriesSlot, agentEntry);
  content.append(secondary, history);
  if (technicalLayerVisible) content.append(identity);
  if (sourceCompletion) {
    const receiptActions = element('div', 'button-row');
    for (const action of Array.from(actions.children)) receiptActions.append(action);
    records.prepend(receiptActions);
    const open = Array.from(receiptActions.querySelectorAll('button')).find((action) => action.textContent === '继续编辑稿件');
    if (open) actions.append(open);
  }
  if (overview.manuscriptState.state === 'empty') {
    if (actions.children.length > 0) content.querySelector('h2')?.after(actions);
  }
  else (content.querySelector('.manuscript-anchor') ?? content).append(actions);

  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen(completion ? 'imported' : 'book-overview', content, { bookId: overview.book.bookId, title: overview.book.title, section: 'overview' });
  shell.setContextActions(button('打开另一本图书', 'quiet', () => renderBookWorkbenchChooser(overview)));
  // The drawer's bar started a Task of this Book (Issue #420): J-03's card and the one-line summaries read it again.
  state.taskSurfaceRefresh = {
    'fixed-task': inspectTaskAuthorization,
    'baseline-analysis': inspectBaselineAnalysis,
    'review-run': inspectReviewSummary,
  };
  if (completion) {
    void acknowledgeCompletionAfterPaint(completion).then((acknowledged) => {
      if (acknowledged && !state.authorityInterrupted && content.isConnected) {
        for (const action of completionActionButtons) action.disabled = false;
        setStatus(completion.completionLabel, 'success');
      }
      inspectTaskAuthorization();
      inspectReviewSummary();
      inspectEvaluationSummary();
      inspectDeliverablesSummary();
      inspectBaselineAnalysis();
    });
  } else {
    inspectTaskAuthorization();
    inspectReviewSummary();
    inspectEvaluationSummary();
    inspectDeliverablesSummary();
    inspectBaselineAnalysis();
    setStatus('图书工作概览已打开');
  }
}

return { renderBookOverview };
}
