import { join } from 'node:path';
import { restoreTaskIntentDraftPredecessor } from '../support/pre74-schema.js';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL } from '../../src/service/task-authorization.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

describe('the persisted search settings and schema 74', () => {
  it('keeps selection and opaque per-backend credential references across restart', async () => {
    const roots = await createServiceTestRoots();
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const settings = store.getSearchBackendSettings();
      expect(settings.selectedBackendId).toBe('search-tinyfish');
      expect(settings.backends.map((entry) => entry.backendId)).toEqual(['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai']);
      // Plain price lines; the one price whose vendor source was not retained (#884) carries that caveat, the others none.
      const byId = new Map(settings.backends.map((entry) => [entry.backendId, entry]));
      expect(byId.get('search-tinyfish')!.price).toBe('免费');
      expect(byId.get('search-deepseek')!.price).toMatch(/^按 token 计费，实测约 USD 0\.\d{4} \/ 次$/u);
      expect(byId.get('search-brave')!.price).toBe('USD 5 / 1000 次');
      expect(byId.get('search-bochaai')!.price).toBe('CNY 0.036 / 次');
      expect(settings.backends.filter((entry) => entry.note?.includes('单价来源未经核实')).map((entry) => entry.backendId)).toEqual(['search-bochaai']);
      expect(byId.get('search-tinyfish')!.note).toContain('30 次/分钟');
      expect(byId.get('search-brave')!.note).toContain('间歇性');
      const first = store.saveSearchBackendCredential('search-brave', null, 'needs-attention');
      const saved = store.saveSearchBackendCredential('search-brave', first.credentialReference, 'ready');
      expect(saved.credentialReference).toMatch(/^[0-9a-f-]{36}$/u);
      store.selectSearchBackend('search-brave');
      expect(() => store!.selectSearchBackend('search-kimi')).toThrow(/未提供/u);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getSearchBackendSettings().selectedBackendId).toBe('search-brave');
      expect(store.getSearchBackendConnections().find((row) => row.backendId === 'search-brave')).toEqual(saved.selected ? saved : { ...saved, selected: true, selectedAt: store.getSearchBackendConnections().find((row) => row.backendId === 'search-brave')!.selectedAt });
      const removed = store.saveSearchBackendCredential('search-brave', null, 'missing');
      expect(removed.credentialReference).toBe(first.credentialReference);
      expect(removed.credentialOperationState).toBe('missing');
    } finally { store?.close(); await roots.dispose(); }
  });

  it('migrates exact revision 73 once and refuses a malformed terminal CHECK', async () => {
    const roots = await createServiceTestRoots();
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); store.close(); store = undefined;
      const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
      const db = new DatabaseSync(path);
      // Synchronized delta with Issue #423 (slice 7a): a predecessor of revision 80 has no drafts and the narrower Task Intents.
      restoreTaskIntentDraftPredecessor(db);
      db.exec('DROP TABLE search_backend_connections; DROP TABLE analysis_plan_records;');
      db.exec(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_plan_records);
      db.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_update']!);
      db.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_delete']!);
      db.exec('PRAGMA user_version = 73'); db.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getSearchBackendConnections()).toHaveLength(5); store.close(); store = undefined;
      const terminal = new DatabaseSync(path);
      // Synchronized delta with #66 and #89: revisions 81 (imported Skill relations) and 83 (their updates) follow revision 80 (Task Intent Drafts).
      expect(terminal.prepare('PRAGMA user_version').get()!.user_version).toBe(83);
      expect(String(terminal.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_plan_records'").get()!.sql)).toContain('web-tools-backend');
      expect(() => terminal.prepare("INSERT INTO search_backend_connections VALUES ('search-kimi', NULL, 'missing', NULL, 'now')").run()).toThrow();
      terminal.exec('DROP TABLE search_backend_connections'); terminal.close();
      await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({ code: 'SCHEMA_MIGRATION_FAILED' });
    } finally { store?.close(); await roots.dispose(); }
  });
});
