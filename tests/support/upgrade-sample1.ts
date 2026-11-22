import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import { DataVersionLedger, writeDataVersionMarker } from '../../src/service/data-version.js';
import { RUN_SYNTHESIS_SCHEMA_SQL } from '../../src/service/review/run-synthesis-storage.js';
import { requireUpgradeSource } from '../../src/service/upgrade-store.js';

// 0.7.2's additive 115 -> 116 step (#1433) on the admitted historical sample1 archive.
// Its real archived and paused reviews keep their original plans, decisions, paragraphs and files.
export async function createUpgradeSample1(root: string, codeRoot: string): Promise<void> {
  const archive = unzipSync(await readFile(join(codeRoot,'tests/fixtures/database/sample1-review-071.ai7db')));
  for (const [member, bytes] of Object.entries(archive)) {
    if (member === 'manifest.json') continue;
    const path = join(root,member);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,bytes);
  }
  const db = new DatabaseSync(join(root,'store','ai7.sqlite'));
  try {
    db.exec('BEGIN');
    db.exec(RUN_SYNTHESIS_SCHEMA_SQL.review_run_synthesis);
    db.exec('PRAGMA user_version=116');
    new DataVersionLedger(db).recordOpen({dataVersion:1,schemaRevision:116,softwareVersion:'0.7.2'});
    db.exec('COMMIT');
    requireUpgradeSource(db);
  } finally { db.close(); }
  await writeDataVersionMarker(root,{ dataVersion:1,schemaRevision:116,softwareVersion:'0.7.2',writtenAt:new Date().toISOString() });
}
