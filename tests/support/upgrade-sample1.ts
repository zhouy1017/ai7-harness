import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import type { EditorialStore } from '../../src/service/store.js';

const run = promisify(execFile);
const release = '790acbcbde8ca268217b152194f83241d1f13d10';

/** Build the released service outside the checkout, using only its committed source and installed dependencies. */
export async function legacySampleService(root: string, codeRoot: string) {
  const checkout = await mkdtemp(join(dirname(root), 'released-service-'));
  const archive = join(checkout, 'release.tar');
  await run('git', ['-C', codeRoot, 'archive', '--format=tar', '-o', archive, release, 'src', 'config', 'package.json']);
  await run('tar', ['-xf', archive, '-C', checkout]);
  await symlink(join(codeRoot, 'node_modules'), join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const entry = join(checkout, 'service.mjs');
  await build({ entryPoints: [join(checkout, 'src', 'service', 'store.ts')], outfile: entry, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' });
  const service = createRequire(import.meta.url)(entry) as { EditorialStore: typeof EditorialStore };
  return (dataRoot: string) => service.EditorialStore.open(dataRoot, checkout);
}

// The released service performs its actual migrations and records its own version.
export async function createUpgradeSample1(root: string, codeRoot: string) {
  const archive = unzipSync(await readFile(join(codeRoot, 'tests/fixtures/database/sample1-review-071.ai7db')));
  for (const [member, bytes] of Object.entries(archive)) {
    if (member === 'manifest.json') continue;
    const path = join(root, member);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  const openLegacy = await legacySampleService(root, codeRoot);
  const old = await openLegacy(root);
  try {
    const db = new DatabaseSync(join(root, 'store', 'ai7.sqlite'), { readOnly: true });
    let binding;
    try {
      const row = db.prepare('SELECT manuscript_id,branch_id FROM branch_working_state ORDER BY branch_id LIMIT 1').get()!;
      binding = { manuscriptId: String(row.manuscript_id), branchId: String(row.branch_id) };
    } finally { db.close(); }
    const window = old.getManuscriptWindow(binding.manuscriptId, binding.branchId, null);
    const block = window.blocks.find(item => item.kind === 'paragraph' && item.text.length > 0)!;
    const windowStartBlockId = window.blocks[0]!.blockId;
    const first = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(block.text)][0]!.segment;
    const mark = old.createEditorialMark({
...binding, windowStartBlockId, clientMarkId: randomUUID(), baseRevisionId: window.revisionId,
      expectedJournalSequence: window.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 1,
      selectedText: first, kind: 'change-suggestion', highlightColor: null, body: '', proposedText: first + first, rationale: null
});
    old.applyChangeSuggestion({ ...binding, windowStartBlockId, markId: mark.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    return { openLegacy, binding, bookId:window.bookId, markId: mark.markId };
  } finally { old.markCleanShutdown(); old.close(); }
}
