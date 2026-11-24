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
async function historicalModule(root: string, codeRoot: string, revision: string, source: string | { contents: string },
  prepare?: (checkout: string) => Promise<void>) {
  const checkout = await mkdtemp(join(dirname(root), 'released-service-'));
  const archive = join(checkout, 'release.tar');
  await run('git', ['-C', codeRoot, 'archive', '--format=tar', '-o', archive, revision, 'src', 'config', 'package.json']);
  await run('tar', ['-xf', archive, '-C', checkout]);
  await prepare?.(checkout);
  await symlink(join(codeRoot, 'node_modules'), join(checkout, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const entry = join(checkout, 'service.mjs');
  const input = typeof source === 'string'
    ? { entryPoints: [join(checkout, 'src', 'service', source)] }
    : { stdin: { ...source, resolveDir: join(checkout, 'src', 'service') } };
  await build({ ...input, outfile: entry, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' });
  return {entry,checkout};
}

/** Keep the execution owner, ledgers, fixture adapter and store from the same release. */
export async function legacyFixtureService(root: string, codeRoot: string, revision: string) {
  const { entry, checkout } = await historicalModule(root, codeRoot, revision, { contents: `
    export { EditorialStore } from './store.ts';
    export { ModelRequestGovernor, BaselineAnalysisExecutionOwner } from './analysis/execution.ts';
    export { ReviewRunDriver } from './review/review-run-driver.ts';
    export { fixtureEntryKey } from './provider/model-fixture.ts';
    export { resolveSourceCheckoutLaunchPolicy } from './launch-policy.ts';
    export { initialEvaluationObservationSetDigest, initialEvaluationSynthesisRequestDigest } from './evaluation/initial-evaluation-contract.ts';
    export { taskSynopsisRequestDigest } from './analysis/baseline-synopsis.ts';
  ` });
  const service = createRequire(import.meta.url)(entry) as
    Pick<typeof import('../../src/service/store.js'), 'EditorialStore'> &
    Pick<typeof import('../../src/service/analysis/execution.js'), 'ModelRequestGovernor' | 'BaselineAnalysisExecutionOwner'> &
    Pick<typeof import('../../src/service/review/review-run-driver.js'), 'ReviewRunDriver'> &
    Pick<typeof import('../../src/service/provider/model-fixture.js'), 'fixtureEntryKey'> &
    Pick<typeof import('../../src/service/evaluation/initial-evaluation-contract.js'), 'initialEvaluationObservationSetDigest' | 'initialEvaluationSynthesisRequestDigest'> &
    Pick<typeof import('../../src/service/analysis/baseline-synopsis.js'), 'taskSynopsisRequestDigest'> &
    Pick<typeof import('../../src/service/launch-policy.js'), 'resolveSourceCheckoutLaunchPolicy'>;
  return { ...service, checkout };
}

export async function legacySampleService(root: string, codeRoot: string, revision = release) {
  const {entry,checkout} = await historicalModule(root,codeRoot,revision,'store.ts');
  const service = createRequire(import.meta.url)(entry) as { EditorialStore: typeof EditorialStore };
  return (dataRoot: string) => service.EditorialStore.open(dataRoot, checkout);
}

export async function historicalUpgradeService(root: string,codeRoot: string,revision: string,softwareVersion: string) {
  // Use the same directory labels for historical recovery and its backup inventory.
  const {entry} = await historicalModule(root,codeRoot,revision,'in-app-upgrade.ts',async checkout => {
    const service = join(checkout,'src','service');
    const upgrade = join(service,'in-app-upgrade.ts');
    const exporter = join(service,'database-exports.ts');
    const [upgradeCode, exportCode] = await Promise.all([readFile(upgrade,'utf8'),readFile(exporter,'utf8')]);
    const versionPattern = softwareVersion.replace(/[.+]/gu,'\\$&');
    await Promise.all([
      writeFile(upgrade,upgradeCode.replace(/store-(before|after)-0\.8\.0-/gu, `store-$1-${softwareVersion}-`)),
      writeFile(exporter,exportCode.replace(String.raw`-0\.8\.0-`, `-${versionPattern}-`)),
    ]);
  });
  return createRequire(import.meta.url)(entry) as typeof import('../../src/service/in-app-upgrade.js');
}

export async function upgradeWithEarlierOrigin(root: string,codeRoot: string,revision: string,softwareVersion: string): Promise<void> {
  const earlier = await historicalUpgradeService(root,codeRoot,revision,softwareVersion);
  await earlier.beginUpgrade(root);
  await earlier.resumeUpgrade(root,softwareVersion);
  // Supply the directory label while retaining the historical backup metadata under test.
  const originPath = join(root,'store','upgrade-origin.json');
  const origin = JSON.parse(await readFile(originPath,'utf8'));
  await writeFile(originPath,JSON.stringify({...origin,softwareVersion}));
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
    return { openLegacy, binding, bookId: window.bookId, markId: mark.markId };
  } finally { old.markCleanShutdown(); old.close(); }
}
