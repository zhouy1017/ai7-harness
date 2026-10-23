import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { RESEARCH_EVIDENCE_SCHEMA_SQL, RESEARCH_EVIDENCE_TRIGGER_SQL } from '../../src/service/research-evidence-schema.js';
import { LATEST_SCHEMA_VERSION, RESEARCH_EVIDENCE_SCHEMA_VERSION, SEARCH_BACKEND_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { RetainedEvidence, RetainedUnit } from '../../src/service/analysis/factual-review-evidence.js';
import { dropFactualVerificationRelations, FACTUAL_VERIFICATION_SCHEMA_NAMES, dropMaterialIndexLayerRelations, dropResearchEvidenceRelations, restoreProposalReviewPredecessor, pre77SchemaRows, restoreTaskIntentDraftPredecessor, pre80SchemaRows } from '../support/pre74-schema.js';
import { MATERIAL_INDEX_LAYER_SCHEMA_SQL, MATERIAL_INDEX_LAYER_TRIGGER_SQL } from '../../src/service/material-index.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';
import { ResearchEvidenceLedger } from '../../src/service/research-evidence.js';
import { MAX_FRAME_BYTES } from '../../src/shared/protocol.js';

// Issue #425 (S70): schema revision 75's research evidence ledger over the real store — the migration from a planted revision
// 74, the CHECK pins and immutability, and staleness by age and by a later capture under another hash. Every text here is
// synthetic and public.
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const URL_A = 'https://example.org/source-a';
const FINDING = `fnd_${'e'.repeat(24)}`;

function evidence(text: string, capturedAt: string): RetainedEvidence {
  return {
    findingId: FINDING, queryClass: '史实', url: URL_A, sourceTitle: '公开来源', capturedAt, captureState: 'full-text', content: text,
    contentSha256: digest(text), pageSha256: digest(`<p>${text}</p>`), snapshotDigest: digest(`snapshot ${text}`),
    claim: { text: '公开事实', origin: 'basis-quotation' }, alignment: 'aligned', anchors: [{ from: 0, to: 4, sentence: 1 }], translation: null, failure: null,
  };
}

function unit(entries: RetainedEvidence[]): RetainedUnit {
  return { state: 'completed', searchCalls: 1, retentionFetches: entries.length, failedRetrievals: 0,
    findings: [{ findingId: FINDING, blockId: `blk_${'f'.repeat(24)}`, quote: '合成引文', category: '史实', sources: entries.length }], evidence: entries };
}

function schemaRows(path: string): Array<{ type: string; name: string; sql: string | null }> {
  const db = new DatabaseSync(path);
  try {
    return (db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{ type: string; name: string; sql: string | null }>);
  } finally { db.close(); }
}

describe('the research evidence ledger, schema 75', () => {
  it('bounds actual response bytes, pages all records and scopes identical finding identities to their Run', async () => {
    const roots = await createServiceTestRoots('ai7-research-evidence-frame-');
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const book = await importSample1Book(store, roots.codeRoot, '分帧回归');
      const runRecordId = randomUUID();
      store.recordResearchEvidence({ bookId: book.bookId, runRecordId, unitOrdinal: 1, backendId: 'search-tinyfish',
        unit: unit(Array.from({ length: 40 }, () => ({ ...evidence('公开事实一则。', new Date().toISOString()), sourceTitle: '公开标题'.repeat(6000) }))) });
      store.recordResearchEvidence({ bookId: book.bookId, runRecordId: randomUUID(), unitOrdinal: 1, backendId: 'search-tinyfish', unit: unit([evidence('另一运行来源。', new Date().toISOString())]) });
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const ledger = new ResearchEvidenceLedger(db);
        let after: number | null = null;
        let seen = 0;
        do {
          const result = ledger.projection({ bookId: book.bookId, runRecordId, findingId: FINDING, after, now: new Date(), saveRefusal: () => null });
          expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
          expect(result.records.every((record) => record.runRecordId === runRecordId)).toBe(true);
          expect(result.findings.every((finding) => finding.runRecordId === runRecordId)).toBe(true);
          seen += result.records.length;
          after = result.next;
        } while (after !== null);
        expect(seen).toBe(40);
      } finally { db.close(); }
    } finally { store?.close(); await roots.dispose(); }
  });

  it('migrates an exact revision-74 store by adding its four relations, moving nothing else, and refuses a 75 without them', async () => {
    const roots = await createServiceTestRoots('ai7-research-evidence-migration-');
    let store: EditorialStore | undefined;
    try {
      expect(RESEARCH_EVIDENCE_SCHEMA_VERSION).toBe(75);
      // Revisions 76 (#892), 77 (#902), and 78 (#901) follow it; the exact revision-74 store traverses each.
      // Synchronized delta with #66 and #89: revisions 81 and 83 add imported Skill sibling relations.
      // #1044 adds independent model selection and translation-attempt metadata at revision 84.
      expect(LATEST_SCHEMA_VERSION).toBe(RESEARCH_EVIDENCE_SCHEMA_VERSION + 9);
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      await importSample1Book(store, roots.codeRoot, '迁移回归');
      store.close(); store = undefined;
      const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
      const terminal = schemaRows(path);
      // The predecessor is planted as revision 74 left it: none of revision 75's relations or triggers, nor revision 76's.
      const plant = new DatabaseSync(path);
      // Synchronized delta with Issue #423 (slice 7a): a predecessor of revision 80 has no drafts and the narrower Task Intents.
      restoreTaskIntentDraftPredecessor(plant);
      dropFactualVerificationRelations(plant);
      restoreProposalReviewPredecessor(plant);
      dropMaterialIndexLayerRelations(plant);
      dropResearchEvidenceRelations(plant);
      plant.exec(`PRAGMA user_version = ${SEARCH_BACKEND_SCHEMA_VERSION}`);
      plant.close();
      const predecessor = schemaRows(path);
      const added = [...FACTUAL_VERIFICATION_SCHEMA_NAMES, ...Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL), ...Object.keys(RESEARCH_EVIDENCE_TRIGGER_SQL),
        ...Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL), ...Object.keys(MATERIAL_INDEX_LAYER_TRIGGER_SQL)];
      expect(predecessor.filter((row) => added.includes(row.name))).toEqual([]);
      expect(predecessor).toEqual(pre77SchemaRows(pre80SchemaRows(terminal).filter((row) => !added.includes(row.name))));

      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      store.close(); store = undefined;
      expect(schemaRows(path)).toEqual(terminal);
      const migrated = new DatabaseSync(path);
      expect(migrated.prepare('PRAGMA user_version').get()!.user_version).toBe(LATEST_SCHEMA_VERSION);
      for (const name of Object.keys(RESEARCH_EVIDENCE_SCHEMA_SQL)) expect(migrated.prepare(`SELECT count(*) AS n FROM ${name}`).get()!.n).toBe(0);
      // A store stamped 75 that lost them is refused, never rebuilt.
      dropResearchEvidenceRelations(migrated);
      migrated.close();
      await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
    } finally { store?.close(); await roots.dispose(); }
  });

  it('pins every column by CHECK, refuses a unit twice, and keeps every row immutable', async () => {
    const roots = await createServiceTestRoots('ai7-research-evidence-pins-');
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const book = await importSample1Book(store, roots.codeRoot, 'CHECK 回归');
      const runRecordId = randomUUID();
      const [evidenceId] = store.recordResearchEvidence({ bookId: book.bookId, runRecordId, unitOrdinal: 1, backendId: 'search-tinyfish', unit: unit([evidence('公开事实一则。', new Date().toISOString())]) });
      expect(() => store!.recordResearchEvidence({ bookId: book.bookId, runRecordId, unitOrdinal: 1, backendId: 'search-tinyfish', unit: unit([]) }))
        .toThrow(expect.objectContaining({ code: 'RESEARCH_EVIDENCE_UNIT_RECORDED' }));
      expect(() => store!.recordResearchEvidence({ bookId: book.bookId, runRecordId, unitOrdinal: 2, backendId: 'search-tinyfish',
        unit: unit([{ ...evidence('正文', new Date().toISOString()), contentSha256: digest('另一段') }]) })).toThrow(expect.objectContaining({ code: 'RESEARCH_EVIDENCE_DIGEST_MISMATCH' }));
      store.close(); store = undefined;

      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        db.exec('PRAGMA foreign_keys = ON');
        const row = db.prepare('SELECT * FROM research_evidence WHERE evidence_id = ?').get(evidenceId!) as Record<string, unknown>;
        const insert = (patch: Record<string, unknown>): void => {
          const values = { ...row, evidence_id: randomUUID(), sha256: digest(randomUUID()), ...patch };
          const columns = Object.keys(values);
          db.prepare(`INSERT INTO research_evidence(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...(Object.values(values) as never[]));
        };
        expect(() => insert({ query_class: '猜测' })).toThrow(/CHECK/u);
        expect(() => insert({ url: 'http://example.org/plain' })).toThrow(/CHECK/u);
        expect(() => insert({ backend_id: 'search-kimi' })).toThrow(/CHECK/u);
        expect(() => insert({ capture_state: 'failed' })).toThrow(/CHECK/u);
        expect(() => insert({ capture_state: 'snippet-only' })).toThrow(/CHECK/u);
        expect(() => insert({ alignment: '已验证' })).toThrow(/CHECK/u);
        expect(() => insert({ anchors_json: '{}' })).toThrow(/CHECK/u);
        expect(() => insert({ translation_json: '{"state":"guessed"}' })).toThrow(/CHECK/u);
        expect(() => insert({ translation_json: '{}' })).toThrow(/CHECK/u);
        expect(() => insert({ finding_id: null })).toThrow(/CHECK/u);
        expect(() => insert({ staleness_state: 'stale' })).toThrow(/CHECK/u);
        expect(() => insert({ content_sha256: digest('absent') })).toThrow(/FOREIGN KEY/u);
        // Every relation that holds a row refuses to change it; the saved-material link is proven the same way by its trigger text.
        expect(Object.keys(RESEARCH_EVIDENCE_TRIGGER_SQL)).toHaveLength(8);
        for (const table of ['research_evidence_contents', 'research_evidence', 'research_evidence_units']) {
          expect(() => db.exec(`UPDATE ${table} SET recorded_at = recorded_at`)).toThrow(/RESEARCH_EVIDENCE_LEDGER_IMMUTABLE/u);
          expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/RESEARCH_EVIDENCE_LEDGER_IMMUTABLE/u);
        }
      } finally { db.close(); }
    } finally { store?.close(); await roots.dispose(); }
  });

  it('marks a source 可能已过期 past the configured age, or once a later capture of its address carries another hash', async () => {
    const roots = await createServiceTestRoots('ai7-research-evidence-staleness-');
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const book = await importSample1Book(store, roots.codeRoot, '过期回归');
      const old = new Date(Date.now() - 120 * 86_400_000).toISOString();
      store.recordResearchEvidence({ bookId: book.bookId, runRecordId: randomUUID(), unitOrdinal: 1, backendId: 'search-tinyfish', unit: unit([evidence('公开事实一则。', old)]) });
      let read = store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: null });
      expect(read.records[0]!.staleness).toEqual({ state: 'possibly-stale', reasons: ['age'], label: '可能已过期' });
      expect(store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: 365 }).records[0]!.staleness.state).toBe('current');

      // The same address captured again, now under another hash: the earlier capture may be out of date, the new one is not.
      const now = new Date().toISOString();
      store.recordResearchEvidence({ bookId: book.bookId, runRecordId: randomUUID(), unitOrdinal: 1, backendId: 'search-brave', unit: unit([evidence('公开事实已更新。', now)]) });
      read = store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: 365 });
      expect(read.records.map((record) => [record.capturedAt, record.staleness.state, record.staleness.reasons]))
        .toEqual([[now, 'current', []], [old, 'possibly-stale', ['hash-changed']]]);
      expect(read.units).toHaveLength(2);
      expect(read.findings.every((entry) => entry.state === 'sourced')).toBe(true);
      // The same text captured again changes nothing: it is kept once, and nothing is marked.
      store.recordResearchEvidence({ bookId: book.bookId, runRecordId: randomUUID(), unitOrdinal: 1, backendId: 'search-brave', unit: unit([evidence('公开事实已更新。', now)]) });
      expect(store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: 365 }).records.filter((record) => record.staleness.state === 'current')).toHaveLength(2);
      // Replaying an older capture later does not make the genuinely newer page stale.
      store.recordResearchEvidence({ bookId: book.bookId, runRecordId: randomUUID(), unitOrdinal: 1, backendId: 'search-brave', unit: unit([evidence('公开事实一则。', old)]) });
      expect(store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: 365 }).records.filter((record) => record.capturedAt === now).every((record) => record.staleness.state === 'current')).toBe(true);
      expect(() => store!.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: 0 })).toThrow(expect.objectContaining({ code: 'RESEARCH_EVIDENCE_STALE_AFTER_INVALID' }));
      // One read stays within one frame however much the Book researched: the latest 64 units and at most 400 of their findings.
      const many = (index: number): RetainedUnit => ({ ...unit([]), findings: Array.from({ length: 7 }, (_, at) => ({
        findingId: `fnd_${(index * 7 + at).toString(16).padStart(24, '0')}`, blockId: `blk_${'f'.repeat(24)}`, quote: '合成引文', category: '史实' as const, sources: 0 })) });
      for (let index = 0; index < 70; index += 1) store.recordResearchEvidence({ bookId: book.bookId, runRecordId: randomUUID(), unitOrdinal: 1, backendId: null, unit: many(index) });
      const bounded = store.inspectResearchEvidence({ bookId: book.bookId, after: null, staleAfterDays: null });
      expect(bounded.units).toHaveLength(64);
      expect(bounded.findings).toHaveLength(400);
      expect(bounded.findings.every((entry) => entry.state === 'unsupported')).toBe(true);
      // Another Book reads none of it.
      const other = await importSample1Book(store, roots.codeRoot, '另一本');
      expect(store.inspectResearchEvidence({ bookId: other.bookId, after: null, staleAfterDays: null })).toMatchObject({ records: [], units: [], findings: [] });
    } finally { store?.close(); await roots.dispose(); }
  });
});
