import { afterEach, expect, it } from 'vitest';
import { EditorialMemoryFacade } from '../../../../src/service/learning/memory-facade.js';
import { editorialMemoryDatabase, transaction } from '../../../support/domain/editorial-memory.js';

let db: ReturnType<typeof editorialMemoryDatabase> | undefined;
afterEach(() => { db?.close(); db = undefined; });

it('builds production memory relations without a database file and gates requests by scope and policy', () => {
  db = editorialMemoryDatabase();
  expect(db.prepare('PRAGMA database_list').all().find((row) => row.name === 'main')!.file).toBe('');
  expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1);
  const facade = new EditorialMemoryFacade(db);
  expect(facade.inspect({ signalOffset: 0, itemOffset: 0 }).items).toEqual([]);
  for (const operationalScope of ['ordinary-production', 'developer-live', 'development-ci'] as const) {
    expect(facade.request({ operationalScope, providerProcessingVersion: 'v35', bookId: null, taskKind: 'global-agent' })).toBeNull();
  }
  expect(facade.request({ operationalScope: 'ordinary-production', providerProcessingVersion: 'v34', bookId: null, taskKind: 'global-agent' })).toBeNull();
});

it('rolls back a learning control when the caller cannot finish its transaction', () => {
  db = editorialMemoryDatabase();
  const facade = new EditorialMemoryFacade(db);
  expect(() => transaction(db!, () => {
    facade.change({ kind: 'switch', enabled: false, expectedEntries: 0 });
    throw new Error('caller refused publication');
  })).toThrow('caller refused publication');
  expect(facade.controls()).toMatchObject({ enabled: true, entries: 0 });
});
