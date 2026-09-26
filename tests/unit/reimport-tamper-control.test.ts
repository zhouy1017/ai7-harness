import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { REIMPORT_PROOF_TAMPER_SQL } from '../../src/service/store.js';

// Unit suite for J-01's reimport tamper control (Issue #569): the startup validation it proves can only refuse a store the
// control actually altered. A deletion mapping carries no staged text, and SQLite's `NULL || text` is NULL, so choosing one
// would report a change and alter nothing — the product would then start, and J-01 fail by chance.

describe('the reimport tamper control', () => {
  it('alters a mapping that has staged text, even when a deletion with NULL text comes first', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('CREATE TABLE manuscript_reimport_mappings (mapping_id TEXT PRIMARY KEY, staged_text TEXT)');
      const insert = database.prepare('INSERT INTO manuscript_reimport_mappings(mapping_id, staged_text) VALUES (?, ?)');
      insert.run('00000000-0000-4000-8000-000000000000', null);
      insert.run('ffffffff-ffff-4fff-bfff-ffffffffffff', '保留的段落');
      expect(database.prepare(REIMPORT_PROOF_TAMPER_SQL).run().changes).toBe(1);
      expect(database.prepare('SELECT mapping_id, staged_text FROM manuscript_reimport_mappings ORDER BY mapping_id').all()).toEqual([
        { mapping_id: '00000000-0000-4000-8000-000000000000', staged_text: null },
        { mapping_id: 'ffffffff-ffff-4fff-bfff-ffffffffffff', staged_text: '保留的段落篡改' },
      ]);
    } finally {
      database.close();
    }
  });

  it('changes nothing when no mapping has staged text, so the control refuses to run', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('CREATE TABLE manuscript_reimport_mappings (mapping_id TEXT PRIMARY KEY, staged_text TEXT)');
      database.prepare('INSERT INTO manuscript_reimport_mappings(mapping_id, staged_text) VALUES (?, ?)').run('00000000-0000-4000-8000-000000000000', null);
      expect(database.prepare(REIMPORT_PROOF_TAMPER_SQL).run().changes).toBe(0);
    } finally {
      database.close();
    }
  });
});
