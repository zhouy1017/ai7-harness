import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPreferenceStore } from '../../src/main/preferences.js';
import { BoundedStoreError, EditJournalFaultInjection, journalWriteUnderFault } from '../../src/service/bounded-manuscript.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { presetTypography } from '../../src/renderer/layout.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  EDIT_JOURNAL_FAULT_CODE,
  EDIT_JOURNAL_FAULT_REFUSED_CODE,
  type JournalEditInput,
  type ManuscriptExportTargetInput,
  type ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { DEFAULT_TYPOGRAPHY } from '../../src/shared/preferences.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for Editing Protection Mode's service half (Issue #951, wave 12 slice 12a; T0-1, DUR-006,
// DUR-012, VIEW-006) over the real `EditorialStore` on a temporary Agent Data Root with exact `sample1`. The write-failure
// injection is the service's own object, composed with the journal write exactly as `src/service/index.ts` composes it; a
// refused write never reaches the store, a retry of the same client edit is one entry, and an acknowledged retry leaves no
// milestone, checkpoint, snapshot or Task behind. View preferences never reach an export. No manuscript text is printed.

const CURRENT: ManuscriptExportTargetInput = { kind: 'current' };
let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
  await requireExactSample1(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

function counts(): Record<string, number> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    // A Manuscript Checkpoint is a new revision with its milestone version; a Task begins as a Task Intent.
    return Object.fromEntries(['edit_journal_entries', 'manuscript_revisions', 'milestone_versions', 'recovery_snapshots', 'task_intents'].map((table) => [
      table, (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
    ]));
  } finally {
    database.close();
  }
}

function edit(window: ManuscriptWindowProjection, insertText: string): JournalEditInput {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && candidate.text.length > 0)!;
  return {
    clientEditId: randomUUID(),
    manuscriptId: window.manuscriptId,
    branchId: window.branchId,
    baseRevisionId: window.revisionId,
    blockId: block.blockId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence,
    fromGrapheme: 0,
    toGrapheme: 0,
    insertText,
  };
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof BoundedStoreError || error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

describe('the Edit Journal write-failure injection (T0-1)', () => {
  it('is refused outside the armed launch and never fires there', () => {
    const unarmed = new EditJournalFaultInjection(false);
    expect(code(() => unarmed.set('fail-all'))).toBe(EDIT_JOURNAL_FAULT_REFUSED_CODE);
    expect(code(() => unarmed.set('fail-next'))).toBe(EDIT_JOURNAL_FAULT_REFUSED_CODE);
    expect(unarmed.mode).toBe('off');
    expect(code(() => unarmed.beforeJournalWrite())).toBe('no-error');
    const armed = new EditJournalFaultInjection(true);
    expect(code(() => armed.set('sometimes'))).toBe('EDIT_JOURNAL_FAULT_INVALID');
  });

  it('refuses a write before the store, retries one exact entry, and leaves no artefact when the retry is acknowledged', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '保护模式样书');
      const fault = new EditJournalFaultInjection(true);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const before = counts();

      // fail-next: one refusal, then the same exact edit is one entry.
      expect(fault.set('fail-next')).toEqual({ mode: 'fail-next' });
      const first = edit(window, '甲');
      expect(code(() => journalWriteUnderFault(fault, () => store.flushJournalEdit(first)))).toBe(EDIT_JOURNAL_FAULT_CODE);
      expect(counts()).toEqual(before);
      expect(fault.mode).toBe('off');
      const ack = journalWriteUnderFault(fault, () => store.flushJournalEdit(first));
      expect(ack.sequence).toBe(window.journalSequence + 1);
      expect(counts().edit_journal_entries).toBe(before.edit_journal_entries! + 1);
      // A retry whose acknowledgement was lost is answered with the same entry, never a second (DUR-006).
      const again = journalWriteUnderFault(fault, () => store.flushJournalEdit(first));
      expect(again.sequence).toBe(ack.sequence);
      expect(again.resultingWorkingDigest).toBe(ack.resultingWorkingDigest);
      expect(counts().edit_journal_entries).toBe(before.edit_journal_entries! + 1);

      // fail-all: every attempt is refused until the injection is set off; then the exact buffered sequence lands in order.
      fault.set('fail-all');
      const second = edit(ack.window, '乙');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect(code(() => journalWriteUnderFault(fault, () => store.flushJournalEdit(second)))).toBe(EDIT_JOURNAL_FAULT_CODE);
      }
      expect(counts().edit_journal_entries).toBe(before.edit_journal_entries! + 1);
      fault.set('off');
      const landed = journalWriteUnderFault(fault, () => store.flushJournalEdit(second));
      expect(landed.sequence).toBe(ack.sequence + 1);
      const third = edit(landed.window, '丙');
      expect(journalWriteUnderFault(fault, () => store.flushJournalEdit(third)).sequence).toBe(landed.sequence + 1);

      // DUR-012: protection cleared by acknowledgement creates no milestone, checkpoint, snapshot or Task.
      const after = counts();
      expect(after.edit_journal_entries).toBe(before.edit_journal_entries! + 3);
      expect({ ...after, edit_journal_entries: 0 }).toEqual({ ...before, edit_journal_entries: 0 });

      // A buffered edit replayed against a moved target is refused as drift, never applied fuzzily (DUR-007).
      expect(code(() => journalWriteUnderFault(fault, () => store.flushJournalEdit({ ...edit(window, '丁') })))).toBe('EDIT_SEQUENCE_CHANGED');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });
});

describe('view-only typography (VIEW-006)', () => {
  it('leaves every export identical across reading presets and density', async () => {
    const preferencesRoot = await mkdtemp(join(tmpdir(), 'ai7-view-preferences-'));
    const outbox = join(roots.inputRoot, 'exports');
    await mkdir(outbox);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '排版样书');
      const preferences = createPreferenceStore(preferencesRoot);
      const choices = [
        { density: 'standard', typography: DEFAULT_TYPOGRAPHY },
        { density: 'compact', typography: presetTypography('reading') },
        { density: 'compact', typography: { ...presetTypography('reading'), fontFamily: 'kai', fontSize: 22, lineHeight: 2.3, columnWidth: 26, alignment: 'start' } },
      ] as const;
      const digests: string[] = [];
      for (const [index, choice] of choices.entries()) {
        preferences.save({ key: 'editor.density', value: choice.density });
        preferences.save({ key: 'editor.typography', value: choice.typography });
        expect(preferences.read().values['editor.typography']).toEqual(choice.typography);
        const shape: string[] = [];
        for (const format of ['docx', 'markdown'] as const) {
          const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, format }, true);
          const prepared = await store.prepareManuscriptExport({
            bookId: book.bookId, revisionId: reviewed.target.revisionId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
            reviewDigest: reviewed.reviewDigest, destination: join(outbox, `排版样书-${index}.${format === 'docx' ? 'docx' : 'md'}`), format,
          }, true);
          shape.push(`${format}:${reviewed.reviewDigest}:${prepared.technical.payloadDigest}`);
        }
        digests.push(shape.join('|'));
      }
      expect(new Set(digests).size).toBe(1);
      store.markCleanShutdown();
    } finally {
      store.close();
      await rm(preferencesRoot, { recursive: true, force: true });
    }
  });
});
