import type { BookSummaryProjection, ImportStartupProjection, PickerStageResult, RendererApi } from '../shared/protocol.js';
import { IMPORT_ENTRY_WORDS } from './import-entry-labels.js';

export type ImportBook = Pick<BookSummaryProjection, 'bookId' | 'title' | 'internalNumber' | 'manuscriptState'>;

export function createImportWindow<Raw extends RendererApi>(raw: Raw) {
  let pending = false;
  let draft: string | null = null;
  let book: ImportBook | undefined;
  const occupied = (): boolean => pending || draft !== null;
  const stage = async (pick: () => Promise<PickerStageResult>): Promise<PickerStageResult> => {
    if (occupied()) throw new Error(IMPORT_ENTRY_WORDS.pending);
    pending = true;
    try {
      const answer = await pick();
      if (answer.status === 'staged') draft = answer.staged.draftId;
      return answer;
    } finally { pending = false; }
  };
  const remember = (startup: ImportStartupProjection): void => {
    draft = 'recovery' in startup ? startup.recovery.draftId : null;
  };
  const overrides: Partial<RendererApi> = {
    selectAndStageManuscript: () => stage(() => raw.selectAndStageManuscript()),
    importBundledSampleBook: () => stage(() => raw.importBundledSampleBook()),
    stageDroppedManuscript: (file) => stage(() => raw.stageDroppedManuscript(file)),
    abandonImportDraft: async (input) => {
      const result = await raw.abandonImportDraft(input);
      remember(result);
      return result;
    },
    acknowledgeImportCompletion: async (input) => {
      const result = await raw.acknowledgeImportCompletion(input);
      draft = null;
      return result;
    },
    getStartup: async () => {
      const result = await raw.getStartup();
      if (result.state === 'import') remember(result.startup);
      return result;
    },
    getImportStartup: async () => {
      const result = await raw.getImportStartup();
      remember(result);
      return result;
    },
    getBookOverview: async (input) => {
      const result = await raw.getBookOverview(input);
      book = { bookId: result.book.bookId, title: result.book.title, internalNumber: result.book.internalNumber, manuscriptState: result.manuscriptState.state };
      return result;
    },
  };
  const api = { ...raw, ...overrides };
  return { api, occupied, bookFor: (id: string) => book?.bookId === id ? book : undefined };
}
