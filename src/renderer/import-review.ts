import {
  type WordTrackedChangesChoice,
  type StagedImportProjection,
  type ServiceWireJobProjection as ServiceJobProjection,
  type ReviewBeforeImportProjection,
  type ReviewBeforeSourceImportProjection,
  type ReimportGroupProjection,
  type ReviewBeforeManuscriptReimportProjection,
  REIMPORT_GROUP_VERB_LABELS,
  type ImportDraftRecoveryProjection,
  type ImportCommitProjection,
} from '../shared/protocol.js';
import { renderFidelityReview } from './import-fidelity.js';
import { STRUCTURE_CHOICE_REQUIRED, renderStructureReview } from './import-structure.js';
import { bookChoiceWords } from './technical-layer-labels.js';
import {
  wordIntakeRefusalLabel,
  wordImportModeOption,
  reimportFidelityHeading,
  WORD_IMPORT_MODE_NAMES,
  fidelityReviewHeading,
  commitNote,
} from './import-fidelity-labels.js';
import type { ShellPlace } from './shell.js';

export interface RecoveryReturnContext {
  attentionId: string;
  attentionVersion: number;
  bookTitle: string;
}

type ImportRelationshipChoice = 'first-manuscript' | 'source-only' | 'reimport';

type ReimportLineageChoice = 'unconfirmed' | string;

/** The same draft/version's visible form choice survives target/paging/error rerenders; restart reads the saved service choice. */
const wordIntakeFormChoices = new Map<string, WordTrackedChangesChoice>();

/** What each verb means for a row, beside its button (Issue #412, S63; V2-UX-IMP-057). */
const REIMPORT_VERB_NOTES: Readonly<Record<ReimportGroupProjection['verbs'][number], string>> = {
  split: '当前这一段在新文件中拆成了几段；标记跟随到它的文字所在的新段落。',
  rewrite: '新文件在这里改写或新增了段落；当前段落按顺序延续，标记跟随到仍在的文字。',
  delete: '新文件删去了这些段落；它们上面的标记不跟随，重新导入后会列出。',
  merge: '当前这几段在新文件中并成了一段；标记跟随到它们的文字所在的新段落。',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => void action());
  return node;
}

function panel(): HTMLElement {
  return element('section', 'panel');
}

/** What the shell lends the import review: its screen changes, status line, recovery return and the routes an import leaves by. */
export interface ImportReviewOptions {
  abandonAndContinue(recovery: Pick<ImportDraftRecoveryProjection, 'draftId' | 'draftVersion'>, recoveryReturn?: RecoveryReturnContext): Promise<void>;
  appendRecoveryReturnAction(content: HTMLElement, context: RecoveryReturnContext | undefined): void;
  awaitServiceJob(initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  hasErrorCode(error: unknown, code: string): boolean;
  identityFindingDisclosure(findings: StagedImportProjection['identityFindings'], reviewTarget?: ReviewBeforeImportProjection['target']['label'] | ReviewBeforeSourceImportProjection['target']['label']): HTMLElement;
  initializeStartup(): Promise<void>;
  instantValue(iso: string): HTMLElement;
  rendererErrorMessage(error: unknown, fallback: string): string;
  renderError(error: unknown, retry: () => void): void;
  renderImported(result: ImportCommitProjection, recoveryReturn?: RecoveryReturnContext): void;
  replaceScreen(state: string, content: HTMLElement, place?: ShellPlace | null): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  sourceCard(staged: StagedImportProjection): HTMLElement;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
}

/** The review before an import (Issue #1172): the target choice, Word intake controls, source-only and manuscript-reimport reviews and the first-import review, moved verbatim from the shell. */
export function createImportReview(options: ImportReviewOptions) {
  const {
      abandonAndContinue, appendRecoveryReturnAction, awaitServiceJob, hasErrorCode, identityFindingDisclosure, initializeStartup,
      instantValue, rendererErrorMessage, renderError, renderImported, replaceScreen, setStatus, sourceCard, technicalDetails
  } = options;
  /** An exact identity of a reimport choice, one disclosure away (ADR 0096 §3, ADR 0071 §1). */
  const identityDisclosure = (term: string, value: string): HTMLElement =>
    technicalDetails(undefined, element('dt', undefined, term), element('dd', 'technical-identity', value));

  function renderWordIntakeControls(staged: StagedImportProjection): {
    elements: HTMLElement[]; choice(): WordTrackedChangesChoice | undefined; allowed(): boolean;
    bind(button: HTMLButtonElement): void; setBusy(value: boolean): void;
  } {
    const projection = staged.wordTrackedChanges;
    if (projection === undefined) return { elements: [], choice: () => undefined, allowed: () => true, bind: () => undefined, setBusy: () => undefined };
    const group = element('fieldset'); group.dataset['wordImportControls'] = projection.compatibility;
    group.append(element('legend', undefined, 'Word 修订导入方式'));
    if (projection.compatibility === 'unsupported') {
      group.append(element('p', undefined, '此文件含当前不支持的修订结构，不能作为首份稿件导入；来源材料继续按原有导入边界处理。'));
      const reasons = element('ul'); for (const code of projection.reasonCodes) reasons.append(element('li', undefined, wordIntakeRefusalLabel(code)));
      group.append(reasons, element('p', 'field-note', `定位到 ${projection.locationCount} 处；完整原始文件仍留在本机暂存中。`));
      return { elements: [group], choice: () => undefined, allowed: () => false,
        bind: (control) => { control.disabled = true; }, setBusy: () => undefined };
    }
    const key = `${staged.draftId}:${staged.draftVersion}:${staged.source.sourceSha256}`;
    let selected = wordIntakeFormChoices.get(key) ?? projection.savedChoice ??
      { mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false };
    wordIntakeFormChoices.set(key, { ...selected });
    while (wordIntakeFormChoices.size > 16) { const oldest = wordIntakeFormChoices.keys().next().value; if (oldest === undefined) break; wordIntakeFormChoices.delete(oldest); }
    group.append(element('p', 'field-note', `当前暂存预览：${projection.previewReading === 'rejected' ? '撤销修订后的阅读' : '接受修订后的阅读'}。这只是预览，尚未选择稿件基线。`));
    const modes: Array<{ input: HTMLInputElement; mode: WordTrackedChangesChoice['mode'] }> = [];
    for (const mode of ['suggestions', 'accepted-baseline'] as const) {
      const line = element('label', 'choice'); const input = element('input'); input.type = 'radio';
      input.name = `word-import-mode-${staged.draftId}`; input.value = mode; input.dataset['wordImportMode'] = mode;
      line.append(input, element('span', undefined, wordImportModeOption(mode))); group.append(line); modes.push({ input, mode });
      input.addEventListener('change', () => { if (!input.checked || busy) return;
        selected = { ...selected, mode, acceptedBaselineConfirmed: false }; changed(); });
    }
    const confirmationLabel = element('label', 'choice'); const confirmation = element('input'); confirmation.type = 'checkbox';
    confirmation.dataset['wordAcceptedBaselineConfirmation'] = '';
    confirmationLabel.append(confirmation, element('span', undefined, '我确认以接受修订后的文字建立稿件基线，原始修订留在原文件中。'));
    const learningLabel = element('label', 'choice'); const learning = element('input'); learning.type = 'checkbox'; learning.dataset['wordLearnFromEdits'] = '';
    learningLabel.append(learning, element('span', undefined, '允许在本机按当前学习设置保留原始修改对（默认开启，可取消）'));
    const notice = element('p', 'field-note'); notice.dataset['wordReadingAvailability'] = '';
    group.append(confirmationLabel, learningLabel,
      element('p', 'field-note', '全局关闭、本书排除和材料排除优先；本次导入不会创建编辑记忆、更新审阅偏好或调用模型。'), notice);
    let busy = false;
    const buttons: HTMLButtonElement[] = [];
    const allowed = (): boolean => projection.readings[selected.mode === 'suggestions' ? 'rejected' : 'accepted'].usable &&
      (selected.mode === 'suggestions' ? !selected.acceptedBaselineConfirmed : selected.acceptedBaselineConfirmed);
    const paint = (): void => {
      for (const { input, mode } of modes) { input.checked = selected.mode === mode; input.disabled = busy; }
      confirmation.checked = selected.acceptedBaselineConfirmed; confirmation.disabled = busy || selected.mode !== 'accepted-baseline';
      learning.checked = selected.learnFromEdits; learning.disabled = busy;
      const reading = projection.readings[selected.mode === 'suggestions' ? 'rejected' : 'accepted'];
      notice.textContent = !reading.usable ? reading.blockCount === 0
        ? selected.mode === 'suggestions' ? '撤销修订后没有可编辑的非空稿件，不能按「转为 AI7 修订建议」准备；仍可明确选择并确认「直接并入正文（作为定稿基线）」。'
          : '接受修订后没有可编辑的非空稿件，不能建立该基线。'
        : '所选阅读超出当前支持边界，不能准备；可选择另一项可用阅读。'
        : selected.mode === 'accepted-baseline' && !selected.acceptedBaselineConfirmed ? '请单独确认「直接并入正文（作为定稿基线）」，再准备导入。'
          : '最终保真、导入方式及本机保留范围会在下一步复核。';
      for (const control of buttons) control.disabled = busy || !allowed();
    };
    const changed = (): void => { wordIntakeFormChoices.set(key, { ...selected }); paint(); };
    confirmation.addEventListener('change', () => { if (busy) return;
      selected = { ...selected, acceptedBaselineConfirmed: selected.mode === 'accepted-baseline' && confirmation.checked }; changed(); });
    learning.addEventListener('change', () => { if (busy) return; selected = { ...selected, learnFromEdits: learning.checked }; changed(); });
    paint();
    return { elements: [group], choice: () => ({ ...selected }), allowed,
      bind: (control) => { buttons.push(control); paint(); }, setBusy: (value) => { busy = value; paint(); } };
  }

  function renderTargetChoice(
    staged: StagedImportProjection,
    selectedChoiceId: StagedImportProjection['targetChoices'][number]['id'] | null,
    recoveryNotice?: string,
    recoveryReturn?: RecoveryReturnContext,
    relationshipSelection: ImportRelationshipChoice | null = null,
    reuseSourceVersionId: string | null | undefined = undefined,
    reimportLineageChoice: ReimportLineageChoice | undefined = undefined,
  ): void {
    const content = panel();
    content.append(
      element('p', 'section-label', '步骤 1 / 3'),
      element('h2', undefined, '选择本地文件导入目标'),
      element('p', 'lede', '系统不会替你选择图书目标、导入关系或同图书来源版本复用。'),
      sourceCard(staged),
    );
    if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));
    if (staged.identityFindings.length > 0) content.append(identityFindingDisclosure(staged.identityFindings));
    const choices = element('fieldset');
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', '本地文件导入目标');
    choices.dataset['importTargetChoices'] = 'unselected-by-default';
    choices.append(element('legend', undefined, '图书目标（默认不选择）'));
    for (const targetChoice of staged.targetChoices) {
      const choice = element('label', 'choice');
      const radio = element('input');
      radio.type = 'radio';
      radio.name = 'import-target';
      radio.value = targetChoice.id;
      radio.dataset['importTargetChoice'] = targetChoice.kind;
      if (targetChoice.kind === 'existing-book') radio.dataset['bookId'] = targetChoice.bookId;
      // The Book's identity is one disclosure away, beside the choice and outside its label, so opening it chooses nothing.
      const words = targetChoice.kind === 'existing-book' ? bookChoiceWords(targetChoice.label, targetChoice.bookId) : targetChoice.label;
      radio.setAttribute('aria-label', words);
      radio.checked = selectedChoiceId === targetChoice.id;
      const copy = element('span');
      copy.append(element('strong', undefined, words));
      if (targetChoice.kind === 'new-book') {
        copy.append(element('small', undefined, '选择后仍须另行选择“首份稿件”或“来源材料”关系。'));
      } else {
        copy.append(element(
          'small',
          undefined,
          `${targetChoice.internalNumber ? `内部编号 ${targetChoice.internalNumber} · ` : ''}${
          targetChoice.manuscriptState === 'empty' ? '尚无稿件' : '已有主稿件；仍可导入来源材料'
        }`,
        ));
      }
      choice.append(radio, copy);
      choices.append(choice, ...(targetChoice.kind === 'existing-book' ? [identityDisclosure('图书 ID', targetChoice.bookId)] : []));
      radio.addEventListener('change', () =>
        renderTargetChoice(staged, targetChoice.id, recoveryNotice, recoveryReturn));
    }
    content.append(choices);
    if (selectedChoiceId === null && staged.nextBookCursor) {
      const moreTargets = button('加载更多图书目标', 'secondary', async () => {
        moreTargets.disabled = true;
        setStatus('正在读取下一页图书目标…', 'busy');
        try {
          const page = await window.ai7.listBooks({ after: staged.nextBookCursor });
          const knownBookIds = new Set(staged.targetChoices.flatMap((choice) =>
            choice.kind === 'existing-book' ? [choice.bookId] : []));
          const additional = page.items.filter((book) => !knownBookIds.has(book.bookId)).map((book) => ({
            kind: 'existing-book' as const,
            id: `existing-book:${book.bookId}`,
            bookId: book.bookId,
            label: `${book.title} · ${book.internalNumber === null ? '' : `内部编号 ${book.internalNumber} · `}图书 ID ${book.bookId}`,
            internalNumber: book.internalNumber,
            manuscriptState: book.manuscriptState,
            reimportLineageSourceVersionIds: book.reimportLineageSourceVersionIds,
            reimportLineagePageAfter: null,
            reimportLineagePreviousCursor: null,
            reimportLineageNextCursor: book.reimportLineageNextCursor,
            selected: false as const,
          }));
          renderTargetChoice(
            { ...staged, targetChoices: [...staged.targetChoices, ...additional], nextBookCursor: page.nextCursor },
            null,
            recoveryNotice,
            recoveryReturn,
          );
          setStatus('已加载更多图书目标', 'success');
        } catch (error) {
          moreTargets.disabled = false;
          setStatus(rendererErrorMessage(error, '无法读取下一页图书目标。'), 'error');
        }
      });
      const moreTargetActions = element('div', 'button-row');
      moreTargetActions.append(moreTargets);
      content.append(moreTargetActions);
    }
    const selectedChoice = selectedChoiceId === null
      ? undefined
      : staged.targetChoices.find((choice) => choice.id === selectedChoiceId);
    if (selectedChoiceId !== null && !selectedChoice) throw new Error('AI7_IMPORT_TARGET_INVALID');

    const cancelImport = button('取消导入', 'quiet', () =>
      abandonAndContinue({ draftId: staged.draftId, draftVersion: staged.draftVersion }, recoveryReturn),
    );
    let revealedControl: HTMLElement | undefined;
    if (selectedChoice) {
      // A format the product cannot read as an editable Manuscript states why, right above the one
      // relationship it can still offer (ADR 0072 §2, V2-UX-IMP-006).
      if (!staged.editableImport.available) {
        content.append(element('p', 'attention-note', staged.editableImport.reason));
      }
      const relationship = element('fieldset');
      relationship.setAttribute('role', 'radiogroup');
      relationship.setAttribute('aria-label', '本地文件与所选图书的关系');
      relationship.dataset['importRelationshipChoices'] = 'unselected-by-default';
      relationship.append(element('legend', undefined, '导入关系（默认不选择）'));
      const allowedRelationships: ReadonlyArray<ImportRelationshipChoice> = !staged.editableImport.available
        ? ['source-only']
        : selectedChoice.kind === 'existing-book' && selectedChoice.manuscriptState === 'populated'
          ? ['source-only', 'reimport']
          : ['first-manuscript', 'source-only'];
      for (const relationshipKind of allowedRelationships) {
        const relationshipChoice = element('label', 'choice');
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'import-relationship';
        radio.value = relationshipKind;
        radio.dataset['importRelationship'] = relationshipKind;
        radio.checked = relationshipSelection === relationshipKind;
        const copy = element('span');
        if (relationshipKind === 'first-manuscript') {
          radio.setAttribute('aria-label', '作为首份稿件导入');
          copy.append(
            element('strong', undefined, '作为首份稿件导入'),
            element('small', undefined, '创建主稿件、r1、稿件导入记录与工作流程实例。'),
          );
        } else if (relationshipKind === 'source-only') {
          radio.setAttribute('aria-label', '作为来源材料导入');
          copy.append(
            element('strong', undefined, '作为来源材料导入'),
            element('small', undefined, '只形成图书拥有的来源版本、来源记录与来源导入记录；不创建或改变稿件。'),
          );
        } else {
          radio.setAttribute('aria-label', '重新导入主稿件');
          copy.append(
            element('strong', undefined, '重新导入主稿件'),
            element('small', undefined, '先明确来源关系并复核逐块比较；没有已确认来源关系时仍可继续保守的两方比较。'),
          );
        }
        relationshipChoice.append(radio, copy);
        relationship.append(relationshipChoice);
        radio.addEventListener('change', () =>
          renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, relationshipKind));
        if (!revealedControl) revealedControl = radio;
      }
      content.append(relationship);
    }

    if (selectedChoice?.kind === 'new-book' && relationshipSelection !== null) {
      const form = element('section', 'form-row');
      form.dataset['importTitleForRelationship'] = relationshipSelection;
      const label = element('label', undefined, '书名');
      label.htmlFor = 'book-title';
      const title = element('input');
      title.id = 'book-title';
      title.name = 'book-title';
      title.maxLength = 180;
      title.required = true;
      title.value = staged.titleSuggestion.value;
      const note = element('span', 'field-note', `建议来源：${staged.titleSuggestion.sourceLabel}。这是可编辑建议，不会自动创建图书。`);
      const fidelityView = renderFidelityReview(staged.fidelity, staged.source.conversion, { kind: 'offer' });
      const structureView = renderStructureReview(staged.structure);
      const wordControls = relationshipSelection === 'first-manuscript' ? renderWordIntakeControls(staged) : null;
      const confirm = button('确认书名并复核', 'primary', async () => {
        if (wordControls !== null && !wordControls.allowed()) { setStatus('请选择可用的 Word 阅读；选择「直接并入正文（作为定稿基线）」时须单独确认。', 'error'); return; }
        if (relationshipSelection === 'first-manuscript' && !structureView.allowed()) { setStatus(STRUCTURE_CHOICE_REQUIRED, 'error'); return; }
        const structure = relationshipSelection === 'first-manuscript' ? structureView.choice() : undefined;
        const trackedChanges = wordControls?.choice();
        const confirmedTitle = title.value.normalize('NFC').replace(/\s+/g, ' ').trim();
        if (!confirmedTitle || confirmedTitle.length > 180) {
          setStatus('请输入 1–180 个字符的书名。', 'error');
          title.focus();
          return;
        }
        confirm.disabled = true;
        wordControls?.setBusy(true);
        title.disabled = true;
        setStatus('正在准备导入前复核…', 'busy');
        try {
          if (relationshipSelection === 'source-only') {
            const review = await window.ai7.prepareSourceImportReview({
              draftId: staged.draftId,
              expectedDraftVersion: staged.draftVersion,
              target: {
                kind: 'new-book',
                choiceId: selectedChoice.id,
                confirmedTitle,
                relationship: 'source-only',
              },
            });
            renderSourceImportReview(review, recoveryNotice, recoveryReturn);
          } else {
            const review = await window.ai7.prepareNewBookReview({
              draftId: staged.draftId,
              expectedDraftVersion: staged.draftVersion,
              target: { kind: 'new-book', choiceId: selectedChoice.id, confirmedTitle },
              acceptDegradation: false,
              textBoxDisposition: fidelityView.textBoxDisposition(),
              ...(trackedChanges === undefined ? {} : { trackedChanges }),
              ...(structure === undefined ? {} : { structure }),
            });
            renderReview(review, recoveryNotice, recoveryReturn);
          }
          setStatus('导入前复核已准备', 'success');
        } catch (error) {
          wordControls?.setBusy(false);
          renderError(error, () => void initializeStartup());
        }
      });
      const actions = element('div', 'button-row');
      actions.append(confirm, cancelImport);
      form.append(label, title, note);
      if (relationshipSelection === 'first-manuscript') {
        if (wordControls !== null) { form.append(...wordControls.elements); wordControls.bind(confirm); }
        form.append(...fidelityView.elements, ...structureView.elements);
      }
      form.append(actions);
      content.append(form);
      revealedControl = title;
    } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'first-manuscript') {
      if (selectedChoice.manuscriptState !== 'empty') throw new Error('AI7_IMPORT_RELATIONSHIP_INVALID');
      const fidelityView = renderFidelityReview(staged.fidelity, staged.source.conversion, { kind: 'offer' });
      const structureView = renderStructureReview(staged.structure);
      const wordControls = renderWordIntakeControls(staged);
      content.append(...wordControls.elements, ...fidelityView.elements, ...structureView.elements);
      const actions = element('div', 'button-row');
      const confirm = button('复核导入到所选图书', 'primary', async () => {
        if (!wordControls.allowed()) { setStatus('请选择可用的 Word 阅读；选择「直接并入正文（作为定稿基线）」时须单独确认。', 'error'); return; }
        if (!structureView.allowed()) { setStatus(STRUCTURE_CHOICE_REQUIRED, 'error'); return; }
        const structure = structureView.choice();
        const trackedChanges = wordControls.choice();
        confirm.disabled = true;
        wordControls.setBusy(true);
        setStatus('正在重新校验所选图书并准备导入前复核…', 'busy');
        try {
          const review = await window.ai7.prepareNewBookReview({
            draftId: staged.draftId,
            expectedDraftVersion: staged.draftVersion,
            target: { kind: 'existing-book', bookId: selectedChoice.bookId, relationship: 'first-manuscript' },
            acceptDegradation: false,
            textBoxDisposition: fidelityView.textBoxDisposition(),
            ...(trackedChanges === undefined ? {} : { trackedChanges }),
            ...(structure === undefined ? {} : { structure }),
          });
          renderReview(review, recoveryNotice, recoveryReturn);
          setStatus('导入前复核已准备', 'success');
        } catch (error) {
          confirm.disabled = false;
          wordControls.setBusy(false);
          setStatus(rendererErrorMessage(error, '无法复核所选图书。'), 'error');
        }
      });
      wordControls.bind(confirm);
      actions.append(confirm, cancelImport);
      content.append(actions);
      revealedControl = confirm;
    } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'source-only') {
      const sameBookMatches = [...new Set(staged.identityFindings
        .filter((finding) => finding.bookId === selectedChoice.bookId && finding.identityClass.kind === 'immutable-original')
        .map((finding) => finding.sourceVersionId))];
      if (sameBookMatches.length > 0) {
        const reuseChoices = element('fieldset');
        reuseChoices.setAttribute('role', 'radiogroup');
        reuseChoices.setAttribute('aria-label', '同图书精确来源版本复用');
        reuseChoices.dataset['sourceVersionReuseChoices'] = 'unselected-by-default';
        reuseChoices.append(element('legend', undefined, '同图书精确来源版本（必须明确选择复用）'));
        for (const sourceVersionId of sameBookMatches) {
          const reuseChoice = element('label', 'choice');
          const radio = element('input');
          radio.type = 'radio';
          radio.name = 'source-version-reuse';
          radio.value = sourceVersionId;
          radio.dataset['reuseSourceVersionId'] = sourceVersionId;
          radio.checked = reuseSourceVersionId === sourceVersionId;
          radio.setAttribute('aria-label', '复用这个同图书精确来源版本');
          const copy = element('span');
          copy.append(element('strong', undefined, '复用这个同图书精确来源版本'));
          reuseChoice.append(radio, copy);
          reuseChoices.append(reuseChoice, identityDisclosure('来源版本', sourceVersionId));
          radio.addEventListener('change', () =>
            renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, 'source-only', sourceVersionId));
          if (reuseSourceVersionId === undefined) revealedControl = radio;
        }
        content.append(reuseChoices);
      }
      const actions = element('div', 'button-row');
      if (sameBookMatches.length === 0 || reuseSourceVersionId !== undefined) {
        const confirm = button('复核来源材料导入', 'primary', async () => {
          confirm.disabled = true;
          setStatus('正在重新校验图书与来源身份并准备复核…', 'busy');
          try {
            const review = await window.ai7.prepareSourceImportReview({
              draftId: staged.draftId,
              expectedDraftVersion: staged.draftVersion,
              target: {
                kind: 'existing-book',
                bookId: selectedChoice.bookId,
                relationship: 'source-only',
                reuseSourceVersionId: reuseSourceVersionId ?? null,
              },
            });
            renderSourceImportReview(review, recoveryNotice, recoveryReturn);
            setStatus('来源材料导入前复核已准备', 'success');
          } catch (error) {
            confirm.disabled = false;
            setStatus(rendererErrorMessage(error, '无法复核来源材料导入。'), 'error');
          }
        });
        confirm.dataset['prepareSourceImportReview'] = selectedChoice.bookId;
        actions.append(confirm);
        revealedControl = confirm;
      }
      actions.append(cancelImport);
      content.append(actions);
    } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'reimport') {
      if (selectedChoice.manuscriptState !== 'populated') throw new Error('AI7_IMPORT_RELATIONSHIP_INVALID');
      const exactSameBookSources = [...new Set(staged.identityFindings
        .filter((finding) => finding.bookId === selectedChoice.bookId &&
          finding.identityClass.kind === 'immutable-original')
        .map((finding) => finding.sourceVersionId))];
      const verifiedLineageSources = selectedChoice.reimportLineageSourceVersionIds;

      const lineageChoices = element('fieldset');
      lineageChoices.setAttribute('role', 'radiogroup');
      lineageChoices.setAttribute('aria-label', '稿件重新导入来源关系');
      lineageChoices.dataset['reimportLineageChoices'] = 'unselected-by-default';
      lineageChoices.append(element('legend', undefined, '来源关系（必须明确选择）'));
      const addLineageChoice = (value: ReimportLineageChoice, title: string, note: string, identity?: string): void => {
        const choice = element('label', 'choice');
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'reimport-lineage';
        radio.value = value;
        radio.dataset['reimportLineage'] = value === 'unconfirmed' ? 'unconfirmed' : 'verified-source-version';
        if (value !== 'unconfirmed') radio.dataset['sourceVersionId'] = value;
        radio.checked = reimportLineageChoice === value;
        radio.setAttribute('aria-label', title);
        const copy = element('span');
        copy.append(element('strong', undefined, title), element('small', undefined, note));
        choice.append(radio, copy);
        lineageChoices.append(choice, ...(identity === undefined ? [] : [identityDisclosure('来源版本', identity)]));
        radio.addEventListener('change', () =>
          renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, 'reimport',
            reuseSourceVersionId, value));
        if (reimportLineageChoice === undefined) revealedControl = radio;
      };
      addLineageChoice('unconfirmed', '来源关系未确认', '继续保守的两方比较；这不会被解释为来源确认或阻断导入。');
      verifiedLineageSources.forEach((sourceVersionId, index) => addLineageChoice(sourceVersionId,
        verifiedLineageSources.length === 1 ? '确认这个来源版本' : `确认来源版本（第 ${index + 1} 个）`,
        '使用该图书拥有且已关联主稿件结果修订版的精确来源，执行三方比较。', sourceVersionId));
      const loadLineagePage = async (after: string | null, control: HTMLButtonElement): Promise<void> => {
        control.disabled = true;
        setStatus('正在读取来源关系版本页…', 'busy');
        try {
          const page = await window.ai7.getReimportLineageSourceVersionPage({
            bookId: selectedChoice.bookId,
            after,
          });
          const pageItems = [...page.items];
          if (reimportLineageChoice !== undefined && reimportLineageChoice !== 'unconfirmed' &&
            !pageItems.includes(reimportLineageChoice)) pageItems.push(reimportLineageChoice);
          const targetChoices = staged.targetChoices.map((choice) =>
            choice.kind !== 'existing-book' || choice.id !== selectedChoice.id
            ? choice
            : {
                ...choice,
                reimportLineageSourceVersionIds: pageItems,
                reimportLineagePageAfter: page.after,
                reimportLineagePreviousCursor: page.previousCursor,
                reimportLineageNextCursor: page.nextCursor,
              });
          renderTargetChoice(
            { ...staged, targetChoices }, selectedChoice.id, recoveryNotice, recoveryReturn,
            'reimport', reuseSourceVersionId, reimportLineageChoice,
          );
          setStatus('来源关系版本页已替换', 'success');
        } catch (error) {
          control.disabled = false;
          setStatus(rendererErrorMessage(error, '无法读取来源关系版本页。'), 'error');
        }
      };
      if (selectedChoice.reimportLineagePageAfter !== null) {
        const previousLineage = button('上一页来源关系版本', 'quiet', () =>
          void loadLineagePage(selectedChoice.reimportLineagePreviousCursor, previousLineage));
        previousLineage.dataset['previousReimportLineage'] = selectedChoice.reimportLineagePreviousCursor ?? 'first';
        lineageChoices.append(previousLineage);
      }
      if (selectedChoice.reimportLineageNextCursor !== null) {
        const moreLineage = button('下一页来源关系版本', 'quiet', () =>
          void loadLineagePage(selectedChoice.reimportLineageNextCursor, moreLineage));
        moreLineage.dataset['loadMoreReimportLineage'] = selectedChoice.reimportLineageNextCursor;
        lineageChoices.append(moreLineage);
      }
      content.append(lineageChoices);

      const sourceChoices = element('fieldset');
      sourceChoices.setAttribute('role', 'radiogroup');
      sourceChoices.setAttribute('aria-label', '稿件重新导入来源版本结果');
      sourceChoices.dataset['reimportSourceVersionChoices'] = 'unselected-by-default';
      sourceChoices.append(element('legend', undefined, '来源版本结果（必须另行明确选择）'));
      const sourceChoice = element('label', 'choice');
      const sourceRadio = element('input');
      sourceRadio.type = 'radio';
      sourceRadio.name = 'reimport-source-version';
      const exactSourceVersionId = exactSameBookSources.length === 1 ? exactSameBookSources[0]! : null;
      if (exactSourceVersionId) {
        sourceRadio.value = exactSourceVersionId;
        sourceRadio.dataset['reuseSourceVersionId'] = exactSourceVersionId;
        sourceRadio.checked = reuseSourceVersionId === exactSourceVersionId;
        sourceRadio.setAttribute('aria-label', `复用来源版本 ${exactSourceVersionId}`);
      } else {
        sourceRadio.value = 'create-new';
        sourceRadio.dataset['createSourceVersion'] = 'true';
        sourceRadio.checked = reuseSourceVersionId === null;
        sourceRadio.setAttribute('aria-label', '创建新的图书来源版本');
      }
      const sourceCopy = element('span');
      sourceCopy.append(element('strong', undefined, exactSourceVersionId ? '复用这个同图书精确来源版本' : '创建新的图书来源版本'));
      sourceChoice.append(sourceRadio, sourceCopy);
      sourceChoices.append(sourceChoice, exactSourceVersionId ? identityDisclosure('来源版本', exactSourceVersionId) : identityDisclosure('来源 SHA-256', staged.source.sourceSha256));
      sourceRadio.addEventListener('change', () =>
        renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, 'reimport',
          exactSourceVersionId, reimportLineageChoice));
      if (reuseSourceVersionId === undefined && reimportLineageChoice !== undefined) revealedControl = sourceRadio;
      content.append(sourceChoices);

      const actions = element('div', 'button-row');
      if (reimportLineageChoice !== undefined && reuseSourceVersionId !== undefined) {
        let activePreparationJob: ServiceJobProjection | null = null;
        const cancelPreparation = button('取消当前操作', 'secondary', async () => {
          if (activePreparationJob === null) return;
          cancelPreparation.disabled = true;
          try {
            activePreparationJob = await window.ai7.cancelServiceJob({ jobId: activePreparationJob.jobId });
            setStatus(activePreparationJob.progress.label, 'success');
          } catch (error) {
            setStatus(rendererErrorMessage(error, '无法取消重新导入比较准备。'), 'error');
          }
        });
        cancelPreparation.dataset['cancelReimportPreparation'] = 'true';
        cancelPreparation.hidden = true;
        const prepare = button('准备稿件重新导入比较', 'primary', async () => {
          prepare.disabled = true;
          setStatus('正在建立安全固定点并准备逐块比较…', 'busy');
          try {
            activePreparationJob = await window.ai7.prepareManuscriptReimport({
              draftId: staged.draftId,
              expectedDraftVersion: staged.draftVersion,
              target: {
                kind: 'existing-book',
                bookId: selectedChoice.bookId,
                relationship: 'reimport',
                lineage: reimportLineageChoice === 'unconfirmed'
                  ? { kind: 'unconfirmed' }
                  : { kind: 'verified-source-version', sourceVersionId: reimportLineageChoice },
                reuseSourceVersionId,
              },
            });
            cancelPreparation.dataset['jobProgressCompleted'] = String(activePreparationJob.progress.completed);
            cancelPreparation.dataset['jobProgressTotal'] = String(activePreparationJob.progress.total);
            cancelPreparation.hidden = false;
            cancelPreparation.disabled = false;
            const completed = await awaitServiceJob(activePreparationJob, (job) => {
              activePreparationJob = job;
              cancelPreparation.dataset['jobProgressCompleted'] = String(job.progress.completed);
              cancelPreparation.dataset['jobProgressTotal'] = String(job.progress.total);
              const progress = `${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}`;
              setStatus(`${job.progress.label} ${progress}`, job.state === 'failed' ? 'error' : 'busy');
            });
            if (completed.state === 'cancelled') {
              activePreparationJob = null;
              cancelPreparation.hidden = true;
              prepare.disabled = false;
              setStatus('重新导入比较准备已取消；暂存草稿未变化。', 'success');
              return;
            }
            if (completed.kind !== 'reimport-preparation') {
              throw new Error('重新导入比较任务未返回复核结果。');
            }
            const review = completed.result;
            if (review === null || !('draftId' in review)) throw new Error('重新导入比较任务未返回复核结果。');
            renderManuscriptReimportReview(review, recoveryNotice, recoveryReturn);
            setStatus('稿件重新导入比较已准备', 'success');
          } catch (error) {
            activePreparationJob = null;
            cancelPreparation.hidden = true;
            prepare.disabled = false;
            setStatus(rendererErrorMessage(error, '无法准备稿件重新导入比较。'), 'error');
          }
        });
        prepare.dataset['prepareManuscriptReimport'] = selectedChoice.bookId;
        actions.append(prepare, cancelPreparation);
        revealedControl = prepare;
      }
      actions.append(cancelImport);
      content.append(actions);
    } else {
      const actions = element('div', 'button-row');
      actions.append(cancelImport);
      content.append(actions);
    }

    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen(selectedChoiceId === null ? 'target' : relationshipSelection === null ? 'relationship' : 'title', content);
    queueMicrotask(() => {
      revealedControl?.focus();
      if (!selectedChoice) setStatus('请选择精确图书目标。');
      else if (relationshipSelection === null) setStatus('图书目标已选择；请另行选择导入关系。');
      else if (relationshipSelection === 'source-only' && reuseSourceVersionId === undefined &&
        selectedChoice.kind === 'existing-book' && staged.identityFindings.some((finding) =>
          finding.bookId === selectedChoice.bookId && finding.identityClass.kind === 'immutable-original')) {
        setStatus('发现同图书精确来源版本；必须明确选择复用。');
      } else if (selectedChoice.kind === 'existing-book') {
        setStatus(
          relationshipSelection === 'first-manuscript'
            ? `已选择“作为首份稿件导入”；可以复核目标图书「${bookChoiceWords(selectedChoice.label, selectedChoice.bookId)}」。`
            : relationshipSelection === 'source-only'
              ? `已选择“作为来源材料导入”；可以复核目标图书「${bookChoiceWords(selectedChoice.label, selectedChoice.bookId)}」。`
              : reimportLineageChoice === undefined
                ? '已选择“重新导入主稿件”；请明确来源关系。'
                : reuseSourceVersionId === undefined
                  ? '来源关系已选择；请另行明确来源版本结果。'
                  : `重新导入决定已明确；可以准备目标图书「${bookChoiceWords(selectedChoice.label, selectedChoice.bookId)}」的逐块比较。`,
        );
      }
    });
  }

  function listSection(title: string, items: ReadonlyArray<string>): HTMLElement {
    const section = element('section', 'review-section');
    section.append(element('h3', undefined, title));
    const list = element('ul');
    for (const item of items) list.append(element('li', undefined, item));
    section.append(list);
    return section;
  }

  function degradationItems(review: ReviewBeforeImportProjection): HTMLElement {
    const list = element('ul', 'degradation-list');
    for (const item of review.degradationDecision.items) {
      const row = element('li', undefined, `${item.label} · ${item.count} 项`);
      row.dataset['degradationCategory'] = item.categoryKey;
      row.dataset['degradationCount'] = String(item.count);
      list.append(row);
    }
    return list;
  }

  function renderSourceImportReview(
    review: ReviewBeforeSourceImportProjection,
    recoveryNotice?: string,
    recoveryReturn?: RecoveryReturnContext,
  ): void {
    const content = panel();
    content.dataset['importReviewKind'] = 'source-only';
    content.append(
      element('p', 'section-label', '步骤 2 / 3 · 来源材料导入前复核'),
      element('h2', undefined, '复核来源材料导入'),
      element('p', 'lede', '本次提交只形成图书拥有的来源材料记录；不会创建或改变稿件及其工作状态。'),
    );
    if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));

    const target = element('section', 'source-card');
    target.dataset['sourceReviewTarget'] = review.target.kind;
    target.dataset['bookId'] = review.target.bookId;
    target.dataset['stableIdentity'] = review.target.stableIdentity;
    const targetValues = element('dl');
    targetValues.append(
      element('dt', undefined, '精确目标'), element('dd', undefined, review.target.label),
      ...(review.target.kind === 'new-book'
        ? [element('dt', undefined, '确认书名'), element('dd', undefined, review.target.confirmedTitle)]
        : [element('dt', undefined, '内部编号'), element('dd', undefined, review.target.internalNumber ?? '未设置')]),
      element('dt', undefined, '导入关系'), element('dd', undefined, review.target.relationshipLabel),
    );
    target.append(element('h3', undefined, '目标与关系'), targetValues, technicalDetails(
      undefined,
      element('dt', undefined, '目标图书 ID'), element('dd', 'technical-identity', review.target.bookId),
      element('dt', undefined, '目标稳定标识'), element('dd', 'technical-identity', review.target.stableIdentity),
    ));
    content.append(target);
    if (review.identityFindings.length > 0) {
      content.append(identityFindingDisclosure(review.identityFindings, review.target.label));
    }

    const boundary = element('section', 'review-section');
    boundary.dataset['sourceRetainedBoundary'] = review.retainedBoundary.kind;
    const boundaryValues = element('dl');
    // Each pinned value now carries its own attribute rather than being found by position in the `<dl>`,
    // because the three digests move into the disclosure and a positional lookup would silently follow
    // the wrong row.
    const retainedBytes = element('dd', undefined, String(review.retainedBoundary.sourceBytes));
    retainedBytes.setAttribute('data-source-bytes', '');
    const retainedDigest = element('dd', 'technical-identity', review.retainedBoundary.sourceSha256);
    retainedDigest.setAttribute('data-source-sha256', '');
    boundaryValues.append(
      element('dt', undefined, '保留边界'), element('dd', undefined, review.retainedBoundary.label),
      element('dt', undefined, '文件名'), element('dd', undefined, review.retainedBoundary.displayName),
      element('dt', undefined, '格式'), element('dd', undefined, review.retainedBoundary.format),
      element('dt', undefined, '来源字节数'), retainedBytes,
    );
    // A retained original the product never parsed has no content or structure identity, so those two
    // rows are absent rather than empty: the surface claims only what was actually derived.
    const parsedDigestRows: HTMLElement[] = [];
    if (review.retainedBoundary.contentDigest !== null && review.retainedBoundary.structureDigest !== null) {
      const contentDigest = element('dd', 'technical-identity', review.retainedBoundary.contentDigest);
      contentDigest.setAttribute('data-content-digest', '');
      const structureDigest = element('dd', 'technical-identity', review.retainedBoundary.structureDigest);
      structureDigest.setAttribute('data-structure-digest', '');
      parsedDigestRows.push(
        element('dt', undefined, '内容摘要'), contentDigest,
        element('dt', undefined, '结构摘要'), structureDigest,
      );
    }
    boundary.append(element('h3', undefined, '完整本地文件与内容边界'), boundaryValues, technicalDetails(
      undefined,
      element('dt', undefined, '来源 SHA-256'), retainedDigest,
      ...parsedDigestRows,
    ));

    const provenance = element('section', 'review-section');
    provenance.dataset['sourceReviewProvenance'] = review.provenance.acquisitionPath;
    const provenanceValues = element('dl');
    // This sub-surface holds no other technical row, so the exact instant rides inside the decision row
    // rather than justifying a disclosure of its own; `data-acquired-at` keeps the unmodified ISO instant.
    const acquiredAt = instantValue(review.provenance.acquiredAt);
    acquiredAt.setAttribute('data-acquired-at', review.provenance.acquiredAt);
    provenanceValues.append(
      element('dt', undefined, '取得方式'), element('dd', undefined, review.provenance.label),
      element('dt', undefined, '处理范围'), element('dd', undefined, review.provenance.locality === 'local-provider-free' ? '本地 · 未调用 Provider' : review.provenance.locality),
      element('dt', undefined, '取得时间'), acquiredAt,
    );
    provenance.append(element('h3', undefined, '来源记录'), provenanceValues);

    const sourceResult = element('section', 'review-section');
    sourceResult.dataset['sourceVersionDisposition'] = review.sourceVersionResult.disposition;
    const sourceResultValues = element('dl');
    sourceResultValues.append(
      element('dt', undefined, '结果'), element('dd', undefined, review.sourceVersionResult.label),
    );
    sourceResult.append(element('h3', undefined, '图书拥有的来源版本'), sourceResultValues, technicalDetails(
      undefined,
      element('dt', undefined, '来源版本 ID'),
      element('dd', 'technical-identity', review.sourceVersionResult.sourceVersionId ?? '提交时在所选图书内创建'),
    ));
    content.append(boundary, provenance, sourceResult);

    const dimensions = element('section', 'review-section');
    dimensions.append(
      element('h3', undefined, '图书编辑维度集 · 8 项'),
      element(
        'p',
        'field-note',
        `${review.editorialDimensionSet.createdWithBook ? '随新图书创建' : '保留现有集合'} · ${review.editorialDimensionSet.name} · 版本 ${review.editorialDimensionSet.profileVersion} · ${review.editorialDimensionSet.weightSemantics}`,
      ),
    );
    const dimensionList = element('ul', 'dimension-list');
    for (const dimension of review.editorialDimensionSet.dimensions) {
      dimensionList.append(element('li', undefined, `${dimension.label} · 中性起始权重 ${dimension.weight}`));
    }
    dimensions.append(dimensionList);
    const grid = element('div', 'review-grid');
    grid.append(dimensions, listSection('将创建的记录', review.recordsToCreate), listSection('明确不会发生', review.namedNonEffects));
    content.append(grid);

    const commitBar = element('section', 'commit-bar');
    const explanation = element('div');
    explanation.append(
      element('strong', undefined, '一次提交，不能部分创建'),
      element('div', 'field-note', '来源版本结果、当前取得的来源记录与文件专属来源导入记录会原子关联。'),
    );
    const commitButton = button(
      review.target.kind === 'new-book' ? '新建图书并导入来源材料' : '导入来源材料到所选图书',
      'primary',
      async () => {
        commitButton.disabled = true;
        setStatus('正在原子提交来源材料记录…', 'busy');
        try {
          const result = await window.ai7.commitSourceImport({
            draftId: review.draftId,
            expectedDraftVersion: review.draftVersion,
            reviewDigest: review.reviewDigest,
            commitAttemptId: review.commitAttemptId,
          });
          setStatus(result.completionLabel, 'success');
          renderImported(result, recoveryReturn);
        } catch (error) {
          if (
            hasErrorCode(error, 'IMPORT_COMMIT_OUTCOME_UNCERTAIN') ||
            hasErrorCode(error, 'REVIEW_CHANGED') ||
            hasErrorCode(error, 'SNAPSHOT_RESELECTION_REQUIRED') ||
            hasErrorCode(error, 'DRAFT_VERSION_CHANGED')
          ) {
            await initializeStartup();
            return;
          }
          commitButton.disabled = false;
          setStatus(rendererErrorMessage(error, '来源材料导入未完成，请重试。'), 'error');
        }
      },
    );
    commitButton.dataset['commitSourceImport'] = review.target.bookId;
    const actions = element('div', 'button-row compact-actions');
    actions.append(
      commitButton,
      button('取消导入', 'quiet', () =>
        abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn)),
    );
    commitBar.append(explanation, actions);
    content.append(commitBar);
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('review', content);
  }

  /** Where a row stands: the current revision's paragraphs, and the new file's. */
  function reimportRangeLine(currentFrom: number | null, currentTo: number | null, stagedFrom: number | null, stagedTo: number | null): string {
    const range = (from: number | null, to: number | null): string =>
      from === null ? '无' : from === to ? `第 ${from} 段` : `第 ${from}–${to} 段`;
    return `当前${range(currentFrom, currentTo)} → 新文件${range(stagedFrom, stagedTo)}`;
  }

  /** The comparison in one line: what the result will be, how many rows, how many are left, how many paragraphs matched exactly. */
  function reimportSummaryLine(review: ReviewBeforeManuscriptReimportProjection): string {
    const comparison = review.comparison;
    return `${comparison.resultPreviewLabel} · ${comparison.groups} 处变化 · ${comparison.unresolvedGroups} 处待你确定 · ${comparison.exactBlocks} 段完全一致，已自动对应`;
  }

  function renderManuscriptReimportReview(
    review: ReviewBeforeManuscriptReimportProjection,
    recoveryNotice?: string,
    recoveryReturn?: RecoveryReturnContext,
    mappingAfter: number | null = null,
  ): void {
    const content = panel();
    content.dataset['importReviewKind'] = 'reimport';
    content.dataset['reimportLineageStatus'] = review.lineage.status;
    content.dataset['reimportDraftId'] = review.draftId;
    content.dataset['reimportComparisonKind'] = review.lineage.comparisonKind;
    content.dataset['reimportCommitReady'] = String(review.commitReady);
    content.dataset['reimportDraftVersion'] = String(review.draftVersion);
    content.dataset['reimportReviewDigest'] = review.reviewDigest;
    content.dataset['reimportCommitAttemptId'] = review.commitAttemptId ?? '';
    content.append(
      element('p', 'section-label', '步骤 2 / 3 · 稿件重新导入复核'),
      element('h2', undefined, '按章节复核稿件重新导入'),
      element('p', 'lede', review.lineage.status === 'verified'
        ? '已由所选图书拥有的精确来源版本建立三方比较。'
        : '来源关系未确认；本次使用保守的两方比较，但不会阻断重新导入。'),
    );
    if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));

    const target = element('section', 'source-card');
    const values = element('dl');
    values.append(
      element('dt', undefined, '目标图书'), element('dd', undefined, review.target.label),
      element('dt', undefined, '导入关系'), element('dd', undefined, review.target.relationshipLabel),
      element('dt', undefined, '安全固定点'), element('dd', undefined, `${review.checkpoint.revisionLabel} · 修订日志 ${review.checkpoint.journalSequence}`),
      element('dt', undefined, '固定点来源'), element('dd', undefined,
        review.checkpoint.createdForDirtyJournal ? '已为未固定修订日志创建专用安全固定点' : '当前稿件已经位于持久固定点'),
      element('dt', undefined, '来源关系'), element('dd', undefined, review.lineage.label),
      element('dt', undefined, '比较方式'), element('dd', undefined,
        review.lineage.comparisonKind === 'three-way' ? '三方比较' : '两方比较'),
      element('dt', undefined, '来源版本结果'), element('dd', undefined, review.sourceVersionResult.label),
      element('dt', undefined, '暂存文件名'), element('dd', undefined, review.source.displayName),
      element('dt', undefined, '暂存格式'), element('dd', undefined, review.source.format),
      element('dt', undefined, '暂存来源字节数'), element('dd', undefined, String(review.source.sourceBytes)),
      element('dt', undefined, '暂存来源范围'), element('dd', undefined, review.source.provenanceLabel),
    );
    target.dataset['reimportSourceSha256'] = review.source.sourceSha256;
    target.dataset['reimportSourceBytes'] = String(review.source.sourceBytes);
    target.append(element('h3', undefined, '目标、固定点与来源关系'), values, technicalDetails(
      undefined,
      element('dt', undefined, '主稿件 ID'), element('dd', 'technical-identity', review.target.manuscriptId),
      element('dt', undefined, '稿件分支 ID'), element('dd', 'technical-identity', review.target.branchId),
      element('dt', undefined, '当前固定点修订版 ID'), element('dd', 'technical-identity', review.checkpoint.revisionId),
      element('dt', undefined, '当前固定点修订版摘要'), element('dd', 'technical-identity', review.checkpoint.revisionDigest),
      ...(review.lineage.status === 'verified'
        ? [
            element('dt', undefined, '来源关系版本 ID'),
            element('dd', 'technical-identity', review.lineage.sourceVersionId),
            element('dt', undefined, '来源关系修订版 ID'),
            element('dd', 'technical-identity', review.lineage.revisionId),
          ]
        : []),
      element('dt', undefined, '暂存来源 SHA-256'), element('dd', 'technical-identity', review.source.sourceSha256),
    ));
    content.append(target);

    const summary = element('section', 'review-section');
    summary.dataset['comparisonDigest'] = review.comparison.comparisonDigest;
    summary.append(
      element('h3', undefined, '比较摘要'),
      element('p', undefined, reimportSummaryLine(review)),
      element('p', 'field-note', review.comparison.changed
        ? '完全一致的段落已自动对应；每一处变化由你选一个动词确定——拆分、改写与新增、删除或并入，系统不预选，也不做模糊匹配。'
        : '当前主稿件与暂存稿件逐块完全一致；提交只记录“未发现稿件变化”，不会创建空修订版。'),
    );
    summary.dataset['reimportGroups'] = String(review.comparison.groups);
    summary.dataset['reimportUnresolvedGroups'] = String(review.comparison.unresolvedGroups);
    content.append(summary);

    const fidelity = element('section', 'review-section');
    fidelity.append(element('h3', undefined, reimportFidelityHeading(review.fidelity)));
    const fidelityList = element('ul', 'degradation-list');
    for (const category of review.fidelity) {
      fidelityList.append(element('li', undefined,
        `${category.label} · ${category.statusLabel} · ${category.count} 项 · ${category.detail}`));
    }
    fidelity.append(fidelityList);
    if (review.degradationDecision.state === 'required-unselected') {
      fidelity.append(element('p', 'attention-note', '必须明确接受完整降级集合后才能提交本次重新导入。'));
      const accept = button('明确接受完整降级集合', 'secondary', async () => {
        accept.disabled = true;
        setStatus('正在持久化重新导入降级接受…', 'busy');
        try {
          const refreshed = await window.ai7.acceptReimportDegradation({
            draftId: review.draftId,
            expectedDraftVersion: review.draftVersion,
          });
          renderManuscriptReimportReview(refreshed, recoveryNotice, recoveryReturn, mappingAfter);
          setStatus('完整降级集合已明确接受', 'success');
        } catch (error) {
          accept.disabled = false;
          setStatus(rendererErrorMessage(error, '无法接受重新导入降级集合。'), 'error');
        }
      });
      accept.dataset['acceptReimportDegradation'] = review.draftId;
      fidelity.append(accept);
    } else if (review.degradationDecision.state === 'accepted-complete-set') {
      fidelity.append(element('p', 'success-note', '已明确接受完整降级集合'));
    } else {
      fidelity.append(element('p', 'success-note', '未发现需要接受的降级'));
    }
    content.append(fidelity);

    const mappingsHost = element('section', 'review-section');
    mappingsHost.dataset['reimportMappings'] = 'loading';
    mappingsHost.append(element('h3', undefined, '章节对应'), element('p', 'field-note', '正在读取持久比较事实…'));
    content.append(mappingsHost);
    void Promise.resolve().then(async () => {
      try {
        const page = await window.ai7.getReimportMappingPage({
          draftId: review.draftId,
          expectedDraftVersion: review.draftVersion,
          after: mappingAfter,
        });
        if (!mappingsHost.isConnected) return;
        const list = element('div', 'comparison-list');
        const resolve = async (group: ReimportGroupProjection, verb: ReimportGroupProjection['verbs'][number], control: HTMLButtonElement) => {
          for (const choice of list.querySelectorAll<HTMLButtonElement>('[data-reimport-verb-choice]')) choice.disabled = true;
          try {
            const initial = await window.ai7.resolveReimportMapping({
              draftId: review.draftId,
              expectedDraftVersion: review.draftVersion,
              groupId: group.groupId,
              verb,
            });
            const cancelResolution = button('取消当前操作', 'quiet', async () => {
              cancelResolution.disabled = true;
              await window.ai7.cancelServiceJob({ jobId: initial.jobId });
            });
            cancelResolution.dataset['cancelReimportResolution'] = initial.jobId;
            cancelResolution.dataset['jobProgressCompleted'] = String(initial.progress.completed);
            cancelResolution.dataset['jobProgressTotal'] = String(initial.progress.total);
            control.after(cancelResolution);
            const completed = await awaitServiceJob(initial, (job) => {
              cancelResolution.dataset['jobProgressCompleted'] = String(job.progress.completed);
              cancelResolution.dataset['jobProgressTotal'] = String(job.progress.total);
              const progress = `${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}`;
              setStatus(`${job.progress.label} ${progress}`, job.state === 'failed' ? 'error' : 'busy');
            });
            if (completed.state === 'cancelled') {
              cancelResolution.remove();
              for (const choice of list.querySelectorAll<HTMLButtonElement>('[data-reimport-verb-choice]')) choice.disabled = false;
              setStatus('这一处的选择已取消；复核未变化。', 'success');
              return;
            }
            if (completed.kind !== 'reimport-resolution') throw new Error('对应行解决任务未返回复核结果。');
            const refreshed = completed.result;
            if (refreshed === null || !('draftId' in refreshed)) throw new Error('对应行解决任务未返回复核结果。');
            cancelResolution.remove();
            renderManuscriptReimportReview(refreshed, recoveryNotice, recoveryReturn, mappingAfter);
            setStatus(`第 ${group.ordinal} 处已按「${REIMPORT_GROUP_VERB_LABELS[verb]}」确定；复核摘要已更新`, 'success');
          } catch (error) {
            if (hasErrorCode(error, 'DRAFT_VERSION_CHANGED') || hasErrorCode(error, 'REVIEW_CHANGED')) {
              await initializeStartup();
              return;
            }
            for (const choice of list.querySelectorAll<HTMLButtonElement>('[data-reimport-verb-choice]')) choice.disabled = false;
            setStatus(rendererErrorMessage(error, '无法记录这一处的选择。'), 'error');
          }
        };
        for (const group of page.items) {
          const row = element('article', 'comparison-item reimport-group');
          row.dataset['reimportGroupId'] = group.groupId;
          row.dataset['reimportGroupOrdinal'] = String(group.ordinal);
          row.dataset['reimportGroupVerb'] = group.verb ?? '';
          row.dataset['reimportGroupShape'] = `${group.current.count}:${group.staged.count}`;
          row.append(element('strong', undefined,
            `第 ${group.ordinal} 处${group.chapterLabel === null ? '' : ` · 「${group.chapterLabel}」`} · ${reimportRangeLine(group.current.from, group.current.to, group.staged.from, group.staged.to)}`));
          const side = (label: string, part: ReimportGroupProjection['current']): HTMLElement => {
            const host = element('div', 'reimport-group-side');
            host.dataset['reimportSide'] = label;
            if (part.count === 0) {
              host.append(element('p', 'field-note', `${label}：这里没有段落。`));
              return host;
            }
            for (const excerpt of part.excerpts) {
              const line = element('p', 'field-note', `${label}第 ${excerpt.position} 段：${excerpt.text}${excerpt.truncated ? '…' : ''}`);
              line.dataset['reimportExcerptPosition'] = String(excerpt.position);
              host.append(line);
            }
            if (part.count > part.excerpts.length) host.append(element('p', 'field-note', `另有 ${part.count - part.excerpts.length} 段。`));
            return host;
          };
          row.append(side('当前', group.current), side('新文件', group.staged));
          if (group.verb === null) {
            const choices = element('div', 'button-row compact-actions reimport-verbs');
            for (const verb of group.verbs) {
              const choice = button(REIMPORT_GROUP_VERB_LABELS[verb], 'secondary', async () => {
                setStatus(`正在按「${REIMPORT_GROUP_VERB_LABELS[verb]}」确定第 ${group.ordinal} 处…`, 'busy');
                await resolve(group, verb, choice);
              });
              choice.dataset['reimportVerbChoice'] = verb;
              choice.dataset['reimportGroupId'] = group.groupId;
              choice.setAttribute('aria-describedby', `${group.groupId}-${verb}`);
              const note = element('small', 'field-note', REIMPORT_VERB_NOTES[verb]);
              note.id = `${group.groupId}-${verb}`;
              choices.append(choice, note);
            }
            row.append(choices);
          } else {
            row.append(element('p', 'success-note', `已选择：${REIMPORT_GROUP_VERB_LABELS[group.verb]}`));
          }
          list.append(row);
        }
        const navigation = element('div', 'button-row compact-actions');
        if (page.previousCursor !== null || mappingAfter !== null) {
          const previous = button('上一页', 'quiet', () =>
            renderManuscriptReimportReview(review, recoveryNotice, recoveryReturn, page.previousCursor));
          previous.dataset['reimportPreviousPage'] = String(page.previousCursor ?? 0);
          navigation.append(previous);
        }
        if (page.nextCursor !== null) {
          const next = button('下一页', 'quiet', () =>
            renderManuscriptReimportReview(review, recoveryNotice, recoveryReturn, page.nextCursor));
          next.dataset['reimportNextPage'] = String(page.nextCursor);
          navigation.append(next);
        }
        mappingsHost.dataset['reimportMappings'] = 'ready';
        mappingsHost.dataset['reimportPageItemCount'] = String(page.items.length);
        mappingsHost.replaceChildren(element('h3', undefined, '章节对应'),
          ...(page.items.length === 0 ? [element('p', 'field-note', '没有需要你确定的变化。')] : [list]), navigation);
      } catch (error) {
        mappingsHost.dataset['reimportMappings'] = 'failed';
        mappingsHost.replaceChildren(
          element('h3', undefined, '章节对应'),
          element('p', 'attention-note', rendererErrorMessage(error, '无法读取章节对应。')),
        );
      }
    });

    const grid = element('div', 'review-grid');
    grid.append(listSection('将创建的记录', review.recordsToCreate), listSection('明确不会发生', review.namedNonEffects));
    content.append(grid);
    const actions = element('div', 'button-row compact-actions');
    const abandon = button('取消导入', 'quiet', () =>
      abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn));
    if (review.commitReady) {
      let activeCommitJob: ServiceJobProjection | null = null;
      const cancelCommit = button('取消当前提交', 'secondary', async () => {
        if (activeCommitJob === null) return;
        cancelCommit.disabled = true;
        try {
          activeCommitJob = await window.ai7.cancelServiceJob({ jobId: activeCommitJob.jobId });
          setStatus(activeCommitJob.progress.label, 'success');
        } catch (error) {
          setStatus(rendererErrorMessage(error, '无法取消重新导入提交。'), 'error');
        }
      });
      cancelCommit.dataset['cancelReimportCommit'] = 'true';
      cancelCommit.hidden = true;
      const commit = button(review.comparison.changed ? '提交稿件重新导入' : '记录未发现稿件变化', 'primary', async () => {
        commit.disabled = true;
        abandon.disabled = true;
        setStatus('正在有界核对并提交稿件重新导入结果…', 'busy');
        try {
          activeCommitJob = await window.ai7.commitManuscriptReimport({
            draftId: review.draftId,
            expectedDraftVersion: review.draftVersion,
            reviewDigest: review.reviewDigest,
            commitAttemptId: review.commitAttemptId,
          });
          cancelCommit.dataset['jobProgressCompleted'] = String(activeCommitJob.progress.completed);
          cancelCommit.dataset['jobProgressTotal'] = String(activeCommitJob.progress.total);
          cancelCommit.hidden = false;
          cancelCommit.disabled = false;
          const completed = await awaitServiceJob(activeCommitJob, (job) => {
            activeCommitJob = job;
            cancelCommit.dataset['jobProgressCompleted'] = String(job.progress.completed);
            cancelCommit.dataset['jobProgressTotal'] = String(job.progress.total);
            const progress = `${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}`;
            setStatus(`${job.progress.label} ${progress}`, job.state === 'failed' ? 'error' : 'busy');
          });
          if (completed.state === 'cancelled') {
            activeCommitJob = null;
            cancelCommit.hidden = true;
            commit.disabled = false;
            abandon.disabled = false;
            setStatus('重新导入提交已取消；复核与稿件权威未变化。', 'success');
            return;
          }
          const result = completed.result;
          if (completed.kind !== 'reimport-commit' || result === null || !('reimportRecordId' in result)) {
            throw new Error('重新导入提交任务未返回完成凭据。');
          }
          renderImported(result, recoveryReturn);
          setStatus(result.completionLabel, 'success');
        } catch (error) {
          if (hasErrorCode(error, 'IMPORT_COMMIT_OUTCOME_UNCERTAIN') || hasErrorCode(error, 'REVIEW_CHANGED') ||
            hasErrorCode(error, 'SNAPSHOT_RESELECTION_REQUIRED') || hasErrorCode(error, 'DRAFT_VERSION_CHANGED')) {
            await initializeStartup();
            return;
          }
          commit.disabled = false;
          abandon.disabled = false;
          setStatus(rendererErrorMessage(error, '稿件重新导入未完成。'), 'error');
        }
      });
      commit.dataset['commitManuscriptReimport'] = review.target.bookId;
      actions.append(commit, cancelCommit);
    }
    actions.append(abandon);
    // The sticky `.commit-bar` the other two reviews use, so this review's commit and cancel stay
    // reachable below the fidelity table and the block mappings (V2-UX-LAYER-005). It carries the
    // action row alone: the atomic-commit sentence its siblings show is copy, and this change is
    // position only.
    const commitBar = element('section', 'commit-bar');
    commitBar.append(actions);
    content.append(commitBar);
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('review', content);
  }

  function renderReview(
    review: ReviewBeforeImportProjection,
    recoveryNotice?: string,
    recoveryReturn?: RecoveryReturnContext,
  ): void {
    const content = panel();
    content.append(
      element('p', 'section-label', '步骤 2 / 3 · 导入前复核'),
      element('h2', undefined, '导入前复核'),
      element('p', 'lede', '最后一次确认：下面的记录会在一个事务中一起创建；列出的非影响不会随导入发生。'),
    );
    if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));
    if (review.trackedChanges !== undefined) {
      const choice = review.trackedChanges;
      const word = element('section', 'review-section'); word.dataset['wordReviewedMode'] = choice.mode;
      word.dataset['wordReviewedLearning'] = String(choice.learnFromEdits);
      word.append(element('h3', undefined, '本次 Word 修订导入'), element('p', undefined, `导入方式：${WORD_IMPORT_MODE_NAMES[choice.mode]}`),
        element('p', undefined, choice.mode === 'suggestions' ? '撤销原修订后的文字作为稿件基线，原修订成为未应用的修改建议。'
          : '已单独确认：接受原修订后的文字作为稿件基线。原文件和原始修订证据仍会保留。'),
        element('p', undefined, choice.learnFromEdits ? '已允许按当前本机学习设置保留符合准入的原始修改对。' : '本次不保留学习修改对；来源、稿件对应和导入标记仍会保留。'));
      if (review.wordLearning !== undefined) word.append(element('p', undefined,
        `当前全局学习${review.wordLearning.globalEnabled ? '开启' : '关闭'}；本书${review.wordLearning.bookExcluded ? '已被排除' : '未被排除'}。` +
        `此次按当前设置可保留 ${review.wordLearning.eligibleSampleCount} / ${review.wordLearning.sourceTemplateCount} 条原始修改对，尚未用于编辑记忆、审阅偏好或模型任务。`));
      content.append(word);
    }
    const identity = element('section', 'source-card');
    identity.append(element('h3', undefined, review.target.kind === 'new-book'
      ? `${review.target.label} · ${review.target.confirmedTitle}`
      : `${review.target.label} · ${review.target.relationshipLabel}`));
    const identityDetails = element('dl');
    const sourceBytes = element('dd', undefined, String(review.source.sourceBytes));
    sourceBytes.setAttribute('data-source-bytes', '');
    const sourceDigest = element('dd', 'technical-identity', review.source.sourceSha256);
    sourceDigest.setAttribute('data-source-sha256', '');
    const degraded = review.degradationDecision.state !== 'not-required-clean-import';
    const finalActionLabel = review.target.kind === 'existing-book'
      ? degraded ? '按上述降级方式导入为首份稿件' : '导入为首份稿件'
      : degraded ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件';
    const identityExact: HTMLElement[] = [];
    if (review.target.kind === 'existing-book') {
      const reviewedBookId = element('dd', 'technical-identity', review.target.bookId);
      reviewedBookId.dataset['reviewedBookId'] = review.target.bookId;
      identityDetails.append(
        element('dt', undefined, '目标图书'),
        element('dd', undefined, review.target.label),
        element('dt', undefined, '目标内部编号'),
        element('dd', undefined, review.target.internalNumber ?? '未设置'),
        element('dt', undefined, '稿件关系'),
        element('dd', undefined, review.target.relationshipLabel),
      );
      identityExact.push(
        element('dt', undefined, '目标图书 ID'),
        reviewedBookId,
        element('dt', undefined, '目标稳定标识'),
        element('dd', 'technical-identity', review.target.stableIdentity),
      );
    }
    identityDetails.append(
      element('dt', undefined, '本地来源'),
      element('dd', undefined, review.source.displayName),
      element('dt', undefined, '来源边界'),
      element('dd', undefined, review.source.provenanceLabel),
      element('dt', undefined, '来源字节数'),
      sourceBytes,
      element('dt', undefined, '最终动作'),
      element('dd', undefined, finalActionLabel),
    );
    identityExact.push(element('dt', undefined, '来源 SHA-256'), sourceDigest);
    identity.append(identityDetails, technicalDetails(undefined, ...identityExact));
    content.append(identity);
    if (review.identityFindings.length > 0) {
      content.append(identityFindingDisclosure(review.identityFindings, review.target.label));
    }

    const fidelity = element('section', 'review-section');
    fidelity.append(
      element('h3', undefined, fidelityReviewHeading(review.fidelity)),
      ...renderFidelityReview(review.fidelity, review.source.conversion, {
        kind: 'stated',
        disposition: review.textBoxDisposition,
      }).elements,
      ...renderStructureReview(review.structure?.projection, review.structure?.choice).elements,
    );
    content.append(fidelity);

    if (review.degradationDecision.state !== 'not-required-clean-import') {
      const decision = element('section', 'review-section degradation-decision');
      decision.append(
        element('h3', undefined, '导入降级决定'),
        element('p', undefined, '本次接受只适用于当前导入，并覆盖下面由服务端确定的完整降级集合。'),
        degradationItems(review),
      );
      const acceptance = element('label', 'choice degradation-acceptance');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'accept-import-degradation';
      checkbox.checked = review.degradationDecision.state === 'accepted-complete-set';
      checkbox.disabled = review.degradationDecision.state === 'accepted-complete-set';
      const copy = element('span');
      copy.append(
        element('strong', undefined, '接受上述完整降级集合'),
        element('small', undefined, '接受后才会形成复核摘要，并允许一次性创建全部导入记录。'),
      );
      acceptance.append(checkbox, copy);
      decision.append(acceptance);
      if (review.degradationDecision.state === 'required-unselected') {
        checkbox.addEventListener('change', async () => {
          if (!checkbox.checked) return;
          checkbox.disabled = true;
          setStatus('正在记录本次导入的完整降级接受…', 'busy');
          try {
            const acceptedReview = await window.ai7.prepareNewBookReview({
              draftId: review.draftId,
              expectedDraftVersion: review.draftVersion,
              target: review.target.kind === 'new-book'
                ? {
                    kind: 'new-book',
                    choiceId: review.target.choiceId,
                    confirmedTitle: review.target.confirmedTitle,
                  }
                : {
                    kind: 'existing-book',
                    bookId: review.target.bookId,
                    relationship: review.target.relationship,
                  },
              acceptDegradation: true,
              textBoxDisposition: review.textBoxDisposition ?? 'retain',
              ...(review.trackedChanges === undefined ? {} : { trackedChanges: review.trackedChanges }),
              ...(review.structure === undefined ? {} : { structure: review.structure.choice }),
            });
            setStatus('已接受本次导入的完整降级集合', 'success');
            renderReview(acceptedReview, recoveryNotice, recoveryReturn);
          } catch (error) {
            renderError(error, () => void initializeStartup());
          }
        });
      }
      content.append(decision);
    }

    const grid = element('div', 'review-grid');
    const workflow = element('section', 'review-section');
    workflow.append(
      element('h3', undefined, '固定工作流程方案'),
      element('p', undefined, `${review.workflowProfile.name} · 版本 ${review.workflowProfile.version}`),
      element('p', 'field-note', `AI7 投影 ${review.workflowProfile.id}@${review.workflowProfile.version} · ${review.workflowProfile.digest}`),
      element('p', 'field-note', `原生 Profile ${review.workflowProfile.nativeProfile.id}@${review.workflowProfile.nativeProfile.version} · ${review.workflowProfile.nativeProfile.digest}`),
      element('p', 'field-note', '将创建一个同时绑定上述精确 AI7 投影与原生 Profile 的工作流程实例。'),
    );
    const dimensions = element('section', 'review-section');
    dimensions.append(
      element('h3', undefined, '图书编辑维度集 · 8 项'),
      element(
        'p',
        'field-note',
        `${review.editorialDimensionSet.name} · 版本 ${review.editorialDimensionSet.profileVersion} · ${review.editorialDimensionSet.weightSemantics}`,
      ),
    );
    const dimensionList = element('ul', 'dimension-list');
    for (const dimension of review.editorialDimensionSet.dimensions) {
      const item = element('li');
      item.append(
        element('span', undefined, dimension.label),
        element('span', 'neutral-weight', `中性起始权重 ${dimension.weight}`),
      );
      dimensionList.append(item);
    }
    dimensions.append(dimensionList);
    grid.append(workflow, dimensions, listSection('将创建的记录', review.recordsToCreate), listSection('明确不会发生', review.nonEffects));
    content.append(grid);

    if (review.reviewDigest !== null) {
      const commitBar = element('section', 'commit-bar');
      const explanation = element('div');
      const acceptedDegradation = review.degradationDecision.state === 'accepted-complete-set';
      explanation.append(
        element('strong', undefined, '一次提交，不能部分创建'),
        element('div', 'field-note', commitNote(acceptedDegradation)),
      );
      const commitButton = button(finalActionLabel, 'primary', async () => {
        commitButton.disabled = true;
        setStatus(review.target.kind === 'existing-book' ? '正在原子导入首份稿件…' : '正在原子提交图书与稿件记录…', 'busy');
        try {
          const result = await window.ai7.commitNewBookImport({
            draftId: review.draftId,
            expectedDraftVersion: review.draftVersion,
            reviewDigest: review.reviewDigest!,
            commitAttemptId: review.commitAttemptId,
          });
          setStatus(result.completionLabel, 'success');
          renderImported(result, recoveryReturn);
        } catch (error) {
          if (
            hasErrorCode(error, 'IMPORT_COMMIT_OUTCOME_UNCERTAIN') ||
            hasErrorCode(error, 'REVIEW_CHANGED') ||
            hasErrorCode(error, 'SNAPSHOT_RESELECTION_REQUIRED') ||
            hasErrorCode(error, 'DRAFT_VERSION_CHANGED')
          ) {
            await initializeStartup();
            return;
          }
          commitButton.disabled = false;
          setStatus(rendererErrorMessage(error, '导入未完成，请重试。'), 'error');
        }
      });
      const actions = element('div', 'button-row compact-actions');
      actions.append(
        commitButton,
        button('取消导入', 'quiet', () =>
          abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn),
        ),
      );
      commitBar.append(explanation, actions);
      content.append(commitBar);
    } else {
      const actions = element('div', 'button-row');
      actions.append(
        button('取消导入', 'quiet', () =>
          abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn),
        ),
      );
      content.append(actions);
    }
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('review', content);
  }

  return { listSection, reimportRangeLine, renderManuscriptReimportReview, renderReview, renderSourceImportReview, renderTargetChoice };
}
