import type { EditorialMarkAnchorProjection, ManuscriptMarksPage, ManuscriptWindowAtInput, ManuscriptWindowProjection } from '../shared/protocol.js';
import { MARKS_MORE, MARKS_MORE_NAME, MARKS_PAGE_FAILED, marksShownLine } from './editorial-mark-labels.js';
import { rendererErrorCode } from './error-words.js';

/**
 * A window that holds more marks than one answer carries (Issue #1604): the 批注栏 says how many it shows, 显示更多 reads the
 * next page, and the pages the editor loaded stay loaded across a decision, a reload or a save. The pages live in the editor's
 * own window (`marks`, `marksPage`); this holds only how many were loaded, a read in flight and the words of a read that failed.
 */
export interface MarksPagingHost {
  window(): Pick<ManuscriptWindowProjection, 'manuscriptId' | 'branchId' | 'blocks' | 'journalSequence' | 'marks' | 'marksPage'>;
  /** The marks (and their paging facts) the window on screen holds now: drawn in the text, and a card each in the pane. */
  setMarks(marks: ReadonlyArray<EditorialMarkAnchorProjection>, truncated: boolean, page: ManuscriptMarksPage | undefined): void;
  read(input: ManuscriptWindowAtInput): Promise<ManuscriptWindowProjection>;
  /** The marks on screen changed: the pane draws its cards again. */
  changed(): void;
  alive(): boolean;
  /** Where focus goes when 显示更多 is pressed for the last time and the row leaves. */
  focusAfter(): void;
  errorMessage(error: unknown, fallback: string): string;
  setStatus(message: string, tone: 'error'): void;
}

export interface MarksPaging {
  /** The row beneath the filter: 「已显示 N / M 条。」 and 显示更多, hidden while the window carries every mark. */
  readonly row: HTMLElement;
  /** The window on screen may have changed: if it holds fewer marks than were loaded for it, the pages are read again. */
  observe(): void;
  /** 显示更多: the next page. `false` when it could not be read (the row says so). */
  more(): Promise<boolean>;
  /**
   * Pages are read until the mark is held, then set in one move; `false` when it is not held at the end. There is no ceiling on the
   * pages: it goes on while a next page exists and each one makes progress. It belongs to the window it was asked in: once the editor
   * is in another window it reads nothing more and answers `false`, whatever that window holds.
   */
  hold(markId: string): Promise<boolean>;
  /** Pages are being read back after a reload that brought only the first: what the window holds meanwhile is not the whole list. */
  restoring(): boolean;
  /** Resolves once no read-back is under way (at once when none is). */
  settled(): Promise<void>;
  paint(): void;
}

const windowKey = (window: ReturnType<MarksPagingHost['window']>): string => `${window.manuscriptId}|${window.branchId}|${window.blocks[0]?.blockId ?? ''}`;
const WINDOW_MARKS_CHANGED = 'WINDOW_MARKS_CHANGED';

export function createMarksPaging(host: MarksPagingHost): MarksPaging {
  const row = document.createElement('p');
  row.className = 'review-part-paging marks-paging';
  row.dataset['marksPaging'] = '';
  row.hidden = true;
  const line = document.createElement('span');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = MARKS_MORE;
  button.setAttribute('aria-label', MARKS_MORE_NAME);
  button.dataset['marksMore'] = '';
  const failed = document.createElement('span');
  failed.className = 'review-page-failed';
  failed.setAttribute('role', 'alert');
  failed.hidden = true;
  row.append(line, button, failed);

  /** How many marks were loaded for which window: what a reload that brings only the first page must bring back. */
  let loaded: { readonly key: string; count: number } | null = null;
  let reading: Promise<boolean> | null = null;
  let abandoned = false;
  /** Pages being read back after a reload: the row stays as it was, so the pane's header does not move under the editor's hand. */
  let restoring = false;
  let restoreDone: Promise<void> | null = null;
  let failure: string | null = null;

  /**
   * Reads following pages in ascending order until `target` marks are held or the last page is read, then sets them in one move.
   * A refused digest, or a reply at another journal position or window, starts again from the first page once; then it stops
   * and says so, keeping what the screen holds. A window that changed on screen meanwhile discards the read: whoever changed it
   * observes again. `until` ends the read as soon as what is carried satisfies it (a mark that must be held): one move however many pages.
   */
  async function pages(target: number, until?: (marks: ReadonlyArray<EditorialMarkAnchorProjection>) => boolean): Promise<void> {
    const start = host.window();
    const first = start.blocks[0]?.blockId;
    if (first === undefined || start.marksPage === undefined || start.marksPage.nextOrdinal === null) return;
    const sequence = start.journalSequence;
    let carried: EditorialMarkAnchorProjection[] = [...start.marks];
    let next: number | null = start.marksPage.nextOrdinal;
    let { digest, total } = start.marksPage;
    let restarted = false;
    const at = { manuscriptId: start.manuscriptId, branchId: start.branchId, target: { kind: 'window-start', blockId: first } } as const;
    const stillThere = (): boolean => host.alive() && host.window().marks === start.marks;
    while (next !== null && carried.length < target && !(until?.(carried) ?? false)) {
      let read: ManuscriptWindowProjection | null = null;
      try {
        read = await host.read({ ...at, marks: { afterOrdinal: next, digest } });
      } catch (error) {
        if (rendererErrorCode(error) !== WINDOW_MARKS_CHANGED) throw error;
      }
      if (!stillThere()) { abandoned = true; return; }
      if (read === null || read.journalSequence !== sequence || read.blocks[0]?.blockId !== first || read.marksPage === undefined) {
        if (restarted) throw new Error('window marks changed twice');
        restarted = true;
        const fresh = await host.read(at);
        if (!stillThere()) { abandoned = true; return; }
        if (fresh.journalSequence !== sequence || fresh.blocks[0]?.blockId !== first) throw new Error('window moved while its marks were read');
        carried = [...fresh.marks];
        ({ nextOrdinal: next, digest, total } = fresh.marksPage ?? { nextOrdinal: null, digest, total: fresh.marks.length });
        continue;
      }
      const known = new Set(carried.map((mark) => mark.markId));
      for (const mark of read.marks) if (!known.has(mark.markId)) carried.push(mark);
      const advanced = read.marksPage.nextOrdinal === null || read.marksPage.nextOrdinal > next;
      ({ nextOrdinal: next, digest, total } = read.marksPage);
      // A page that does not move the next ordinal on would be read again for ever: stop with what is carried.
      if (!advanced) next = null;
    }
    host.setMarks(carried, next !== null, { shown: carried.length, total, nextOrdinal: next, digest });
  }

  function run(work: () => Promise<void>): Promise<boolean> {
    if (reading !== null) return reading;
    failure = null;
    abandoned = false;
    const started: Promise<boolean> = work().then(() => true, (error: unknown) => {
      if (!host.alive()) return false;
      failure = host.errorMessage(error, MARKS_PAGE_FAILED);
      host.setStatus(failure, 'error');
      return false;
    }).then((done) => {
      reading = null;
      // The held count follows what the screen holds now, so a read that gave up is not asked for again by every repaint.
      if (loaded !== null) loaded.count = host.window().marks.length;
      if (host.alive()) { paint(); if (abandoned) observe(); }
      return done;
    });
    reading = started;
    paint();
    return started;
  }

  function observe(): void {
    if (reading !== null) return;
    const window = host.window();
    const key = windowKey(window);
    const page = window.marksPage;
    if (loaded !== null && loaded.key === key && page !== undefined && page.nextOrdinal !== null && window.marks.length < loaded.count) {
      const want = loaded.count;
      restoring = true;
      restoreDone = run(() => pages(want)).then(() => { restoring = false; restoreDone = null; if (host.alive()) { paint(); host.changed(); } });
      return;
    }
    loaded = { key, count: window.marks.length };
    paint();
  }

  async function more(): Promise<boolean> {
    const done = await run(() => pages(host.window().marks.length + 1));
    if (host.alive()) host.changed();
    return done;
  }

  async function hold(markId: string): Promise<boolean> {
    // The window this hold was asked for: once the editor is anywhere else, whatever that window holds is none of its business.
    const key = windowKey(host.window());
    const gone = (): boolean => !host.alive() || windowKey(host.window()) !== key;
    const holds = (): boolean => host.window().marks.some((mark) => mark.markId === markId);
    // Each turn must add marks, so this ends with the pages; a read already under way is waited for, then looked at again.
    while (!holds() && host.window().marksPage?.nextOrdinal != null) {
      if (gone()) return false;
      const before = host.window().marks.length;
      const done = await run(() => pages(Number.POSITIVE_INFINITY, (marks) => marks.some((mark) => mark.markId === markId)));
      if (gone()) return false;
      if (!done) break;
      host.changed();
      if (host.window().marks.length <= before) break;
    }
    return !gone() && holds();
  }

  function paint(): void {
    const window = host.window();
    const page = window.marksPage;
    const hadFocus = row.contains(document.activeElement);
    if (restoring) return;
    if (page === undefined || page.nextOrdinal === null) {
      row.hidden = true;
      failed.hidden = true;
      if (hadFocus) host.focusAfter();
      return;
    }
    row.hidden = false;
    const text = marksShownLine(window.marks.length, page.total);
    if (line.textContent !== text) line.textContent = text;
    button.disabled = reading !== null;
    row.setAttribute('aria-busy', String(reading !== null));
    failed.hidden = failure === null;
    if (failure !== null && failed.textContent !== failure) failed.textContent = failure;
  }

  button.addEventListener('click', () => void more());
  return { row, observe, more, hold, restoring: () => restoring, settled: () => restoreDone ?? Promise.resolve(), paint };
}
