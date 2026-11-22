import type { RendererApi, StagedImportProjection } from '../shared/protocol.js';
import { createSheet, sheetContent } from './components/sheet.js';
import { IMPORT_ENTRY_WORDS } from './import-entry-labels.js';
import { reportResult } from './notifications.js';
import type { ImportBook } from './import-window.js';
import type { NavigationCheckpoint } from './navigation-generation.js';
import type { RecoveryReturnContext } from './import-review.js';

/**
 * How a file reaches the import page from a Book that already has work in it (Issue #1682, items 11.1 and N.10): the
 * 「导入新版本…」 entries, and the question a dropped file asks before anything is staged. The page itself is
 * `renderTargetChoice`; this module only chooses its Book and relationship, and holds the one rule that a staging in
 * progress, an open question or an open picker admits no second file.
 */

type Relationship = 'reimport' | 'source-only';
type Choice = StagedImportProjection['targetChoices'][number];

export interface ImportEntryHost {
  api: Pick<RendererApi, 'selectAndStageManuscript' | 'stageDroppedManuscript' | 'getReimportLineageSourceVersionPage' | 'abandonImportDraft'>;
  bookFor(id: string): ImportBook | undefined;
  occupied(): boolean;
  route(): NavigationCheckpoint;
  inBook(): boolean;
  renderTargetChoice(staged: StagedImportProjection, selectedChoiceId: Choice['id'] | null, recoveryNotice?: string,
    recoveryReturn?: RecoveryReturnContext, relationshipSelection?: Relationship | null): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  rendererErrorMessage(error: unknown, fallback: string): string;
  /** The current surface's own leave guard: an editor's typing is written before anything is staged. */
  settleScreen(): Promise<boolean>;
}

let host: ImportEntryHost | null = null;
/** A picker open, a staging under way: one at a time. */
let busy = false;
let question: { close(): void } | null = null;
let openDerivativeForm: ((file: File) => boolean) | null = null;

/** Hand the renderer's own request and page functions over once; every entry below reads them from here. */
export function configureImportEntry(next: ImportEntryHost): void {
  host = next;
  busy = false;
  question?.close();
}

function hosted(): ImportEntryHost {
  if (host === null) throw new Error('AI7_IMPORT_ENTRY_UNCONFIGURED');
  return host;
}

/**
 * The 衍生稿件 form that can take a dropped file: 稿件's switcher on a 衍生稿件 in the editor and the management page
 * register their method while mounted. The returned function clears it, and only if it is still the registered one.
 */
export function registerDerivativeImportForm(open: (file: File) => boolean): () => void {
  openDerivativeForm = open;
  return () => { if (openDerivativeForm === open) openDerivativeForm = null; };
}

/** The import page with this Book chosen, adding the Book's choice when the staged first page of Books does not list it. */
async function openImportPage(staged: StagedImportProjection, bookId: string, wanted: Relationship, origin: NavigationCheckpoint, recoveryReturn?: RecoveryReturnContext): Promise<boolean> {
  const { api, renderTargetChoice } = hosted();
  let choice = staged.targetChoices.find((item): item is Extract<Choice, { kind: 'existing-book' }> => item.kind === 'existing-book' && item.bookId === bookId);
  if (choice === undefined) {
    const book = hosted().bookFor(bookId);
    if (!book || staged.nextBookCursor === null) throw new Error(IMPORT_ENTRY_WORDS.bookUnavailable);
    const lineage = await api.getReimportLineageSourceVersionPage({ bookId, after: null });
    const { title, internalNumber, manuscriptState } = book;
    choice = {
      kind: 'existing-book',
      id: `existing-book:${bookId}`,
      bookId,
      label: `${title} · ${internalNumber === null ? '' : `内部编号 ${internalNumber} · `}图书 ID ${bookId}`,
      internalNumber,
      manuscriptState,
      reimportLineageSourceVersionIds: lineage.items,
      reimportLineagePageAfter: lineage.after,
      reimportLineagePreviousCursor: lineage.previousCursor,
      reimportLineageNextCursor: lineage.nextCursor,
      selected: false,
    };
    staged = { ...staged, targetChoices: [...staged.targetChoices, choice] };
  }
  // A file that cannot become an editable manuscript is offered as source material, with the page's own reason.
  if (!origin.isCurrent()) return false;
  renderTargetChoice(staged, choice.id, undefined, recoveryReturn, wanted === 'reimport' && choice.manuscriptState === 'populated' && staged.editableImport.available ? 'reimport' : 'source-only');
  return true;
}

/** 导入新版本…: settle the typing, ask the system for a file, then the import page with this Book and 更新稿件. */
export async function startNewVersionImport(bookId: string, recoveryReturn?: RecoveryReturnContext): Promise<void> {
  await stageFile(null, (staged, origin) => openImportPage(staged, bookId, 'reimport', origin, recoveryReturn));
}

const DROP_SCREENS = ['landing', 'editor', 'book-overview', 'book-derivatives'];

type DropPage =
  /** 书库, a Book with no manuscript yet, or an editor with no Book to name: the import page, as it always was. */
  | { kind: 'plain'; bookId: string | undefined }
  | { kind: 'manuscript'; bookId: string }
  | { kind: 'derivative'; bookId: string };

function dropPage(screen: HTMLElement): DropPage {
  const root = screen.querySelector<HTMLElement>('[data-book-id]');
  const bookId = root?.dataset['bookId'];
  const name = screen.dataset['screen'];
  if (bookId === undefined || name === 'landing') return { kind: 'plain', bookId: screen.querySelector<HTMLElement>('.book-overview')?.dataset['bookId'] };
  if (name === 'book-derivatives' || screen.querySelector('[data-manuscript-kind="derivative"]')) return { kind: 'derivative', bookId };
  if (name === 'editor' || root?.dataset['manuscriptState'] === 'populated') return { kind: 'manuscript', bookId };
  return { kind: 'plain', bookId };
}

/** Stage the dropped file once, then hand it to `open`; a refusal stands in the status line. */
async function stageFile(file: File | null, open: (staged: StagedImportProjection, origin: NavigationCheckpoint) => boolean | Promise<boolean>): Promise<void> {
  const h = hosted();
  if (busy || question !== null) return;
  if (h.occupied()) { h.setStatus(IMPORT_ENTRY_WORDS.pending, 'error'); return; }
  const origin = h.route();
  busy = true;
  let owned: StagedImportProjection | undefined;
  try {
    if (!await h.settleScreen() || !origin.isCurrent()) return;
    if (!file) h.setStatus(IMPORT_ENTRY_WORDS.parsing, 'busy');
    const result = file ? await h.api.stageDroppedManuscript(file) : await h.api.selectAndStageManuscript();
    if (result.status !== 'staged') {
      if (!file && origin.isCurrent()) reportResult(h.setStatus, IMPORT_ENTRY_WORDS.pickerCancelled);
      return;
    }
    owned = result.staged;
    if (origin.isCurrent() && await open(owned, origin)) owned = undefined;
  } catch (error) {
    if (origin.isCurrent()) h.setStatus(h.rendererErrorMessage(error, file ? IMPORT_ENTRY_WORDS.dropFailed : IMPORT_ENTRY_WORDS.startFailed), 'error');
  } finally {
    try {
      if (owned) await h.api.abandonImportDraft({ draftId: owned.draftId, expectedDraftVersion: owned.draftVersion, ...(h.inBook() ? { preserveBookRoute: true } : {}) });
    } catch (error) {
      if (origin.isCurrent()) h.setStatus(h.rendererErrorMessage(error, IMPORT_ENTRY_WORDS.pending), 'error');
    } finally { busy = false; }
  }
}

/** The question: nothing is staged until one answer is pressed, and 取消, Escape or leaving the page stage nothing. */
function ask(screen: HTMLElement, file: File, page: Exclude<DropPage, { kind: 'plain' }>): void {
  const words = IMPORT_ENTRY_WORDS;
  const origin = screen.firstElementChild;
  const route = hosted().route();
  const sheet = createSheet('import-entry-sheet');
  sheet.dataset['importQuestion'] = page.kind;
  const heading = document.createElement('h3');
  heading.id = 'import-entry-question';
  heading.textContent = words.question(file.name);
  sheet.setAttribute('aria-labelledby', heading.id);
  const foot = document.createElement('div');
  foot.className = 'button-row';
  let finished = false;
  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(() => { if (screen.firstElementChild !== origin) finish(); }) : null;
  observer?.observe(screen, { childList: true });
  function finish(): void {
    if (finished) return;
    finished = true;
    observer?.disconnect();
    if (question === handle) question = null;
    if (sheet.open) sheet.close();
    sheet.remove();
  }
  const handle = { close: finish };
  const answer = (key: string, label: string, className: 'primary' | 'secondary' | 'quiet', run: () => void): void => {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = `btn ${className}`;
    control.textContent = label;
    control.dataset['importAnswer'] = key;
    control.addEventListener('click', () => {
      if (finished) return;
      finish();
      if (route.isCurrent() && screen.firstElementChild === origin) run();
    });
    foot.append(control);
  };
  const { bookId } = page;
  answer('update', words.update, 'primary', () => void stageFile(file, (staged, origin) => openImportPage(staged, bookId, 'reimport', origin)));
  if (page.kind === 'manuscript') {
    answer('source', words.asSource, 'secondary', () => void stageFile(file, (staged, origin) => openImportPage(staged, bookId, 'source-only', origin)));
  } else {
    answer('derivative', words.asDerivative, 'secondary', () => {
      if (openDerivativeForm === null || !openDerivativeForm(file)) hosted().setStatus(words.derivativeFormUnavailable, 'error');
    });
  }
  answer('cancel', words.cancel, 'quiet', () => undefined);
  sheet.addEventListener('close', finish);
  sheetContent(sheet, heading, [], foot);
  document.body.append(sheet);
  question = handle;
  sheet.show();
}

/** Drop handlers for the screens that take a file: 书库, 工作概览, 稿件 and 衍生稿件. */
export function installImportDrop(screen: HTMLElement): void {
  const accepts = (): boolean => DROP_SCREENS.includes(screen.dataset['screen'] ?? '');
  screen.addEventListener('dragover', (event) => {
    if (accepts() && event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  screen.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files[0];
    if (!file || !accepts()) return;
    event.preventDefault();
    if (busy || question !== null) return;
    if (!/\.docx$/iu.test(file.name)) { hosted().setStatus(IMPORT_ENTRY_WORDS.notDocx, 'error'); return; }
    if (hosted().occupied()) { hosted().setStatus(IMPORT_ENTRY_WORDS.pending, 'error'); return; }
    const page = dropPage(screen);
    if (page.kind !== 'plain') { ask(screen, file, page); return; }
    // As today: the import page, with this Book chosen when the page is a Book's own.
    void stageFile(file, (staged) => {
      const choice = staged.targetChoices.find((item) => item.kind === 'existing-book' && item.bookId === page.bookId);
      hosted().renderTargetChoice(staged, choice?.id ?? null);
      return true;
    });
  });
}
