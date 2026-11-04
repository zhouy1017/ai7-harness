/** Snapshot existing admitted manual-run owners locally; no provider sends, credential reads or CI. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { externalRecordingDirectory } from './development-call-recording.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// These owners hold execution/source evidence, not connection settings or the Protected Secret Store.
const admittedTable = /^(?:analysis_(?!background)|factual_|research_evidence|dialogue_|review_run|run_source_scopes$|source_versions$|source_provenance$|source_import_records$|manuscript_revisions$)/u;

export function archiveDevelopmentCalls({ directory, material, providerCacheRoots = [], databases = [], identity }) {
  if (material !== 'admitted-public-samplebooks') throw Error('DEVELOPMENT_ARCHIVE/material-scope');
  const root = externalRecordingDirectory(directory);
  const inventory = { schema: 'ai7.local-development-archive/1', createdAt: new Date().toISOString(),
    material, identity, files: [], databases: [], gaps: [
      'Historical raw wire/stream bytes exist only where the original owner retained them; absent data is not reconstructed.',
      'Production execution records preserve requests/results/stream projections available to their owning tables, not a claim of complete HTTP capture.',
      'Synthetic, replay and newly transmitted outcomes keep original owner labels; archive is not an admitted active mock fixture.',
    ] };
  const retain = (source, relative) => {
    const bytes = readFileSync(source), target = join(root, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    if (existsSync(target)) throw Error('DEVELOPMENT_ARCHIVE/existing-target');
    copyFileSync(source, target);
    inventory.files.push({ path: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) });
  };
  for (let index = 0; index < providerCacheRoots.length; index++) {
    const cache = providerCacheRoots[index], prefix = 'provider-cache-' + index;
    for (const file of ['ledger.jsonl', 'invalidations.jsonl']) if (existsSync(join(cache, file))) retain(join(cache, file), join(prefix, file));
    for (const folder of ['entries', 'claims']) if (existsSync(join(cache, folder))) {
      for (const file of readdirSync(join(cache, folder)).sort()) {
        if (!/^[a-zA-Z0-9._-]+\.json$/u.test(file)) continue;
        retain(join(cache, folder, file), join(prefix, folder, file));
      }
    }
  }
  for (let index = 0; index < databases.length; index++) {
    const database = databases[index], db = new DatabaseSync(database, { readOnly: true });
    const entry = { index, tables: [] };
    db.exec('BEGIN');
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      for (const { name } of tables.filter(({ name }) => admittedTable.test(name))) {
        if (!/^[a-z_]+$/u.test(name)) throw Error('DEVELOPMENT_ARCHIVE/table-name');
        const relative = 'database-' + index + '/' + name + '.jsonl', path = join(root, relative);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
        let count = 0;
        // Iterate the read snapshot; large evidence bodies never require a whole-table memory copy.
        const digest = createHash('sha256');
        for (const row of db.prepare('SELECT * FROM "' + name + '"').iterate()) {
          const bytes = JSON.stringify(row) + '\n';
          // One handle per append also ensures no unfinished buffered writes survive a process exit.
          writeFileSync(path, bytes, { flag: 'a', mode: 0o600 }); digest.update(bytes); count++;
        }
        entry.tables.push({ name, rows: count, path: relative, sha256: digest.digest('hex') });
      }
      db.exec('COMMIT');
    } finally { db.close(); }
    inventory.databases.push(entry);
  }
  writeFileSync(join(root, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { directory: root, files: inventory.files.length, tables: inventory.databases.reduce((sum, db) => sum + db.tables.length, 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(archiveDevelopmentCalls(config)));
}
