// The generator of the authored fixtures `sample1-polish-authored` and `sample1-conflict-regenerate-authored` (Issue #842). The
// answers in tests/support/fast-role.ts are the authored part: each was written after reading the one sentence of exact `sample1`
// (ADR 0043) it answers, and each quotation is a verbatim substring of that sentence except the one meant not to anchor. The
// request digests depend on the two frozen contracts and on the words the service sends, so they are derived here from the real
// store exactly as the service derives them.
//
// It never runs in the Local Verification Ladder or in CI. After either contract changes, regenerate the fixtures with
//   AI7_REGENERATE_FAST_ROLE_FIXTURES=1 pnpm exec vitest run tests/service/fast-role-fixture-generator.test.ts
// and review the fixtures' diff like any other change.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import {
  AUTHORED_POLISH_ANSWER,
  AUTHORED_REGENERATION_ANSWER,
  conflictOf,
  conflictUnitIndex,
  constructSample1Conflict,
  polishRequestDigestOf,
  regenerationRequestDigestOf,
} from '../support/fast-role.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-fast-role-fixtures-');
  await requireExactSample1(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

function fixture(identity: string, description: string, requestDigest: string, text: string): Record<string, unknown> {
  return {
    schema: 'ai7.model-fixture/1',
    identity,
    description,
    basedOn: null,
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: [{ unitOrdinal: 0, requestDigest, response: { kind: 'unit-result', text, usage: { inputTokens: 320, outputTokens: 60 } } }],
  };
}

it.runIf(process.env['AI7_REGENERATE_FAST_ROLE_FIXTURES'] === '1')('generates the authored polish and conflict regeneration fixtures', async () => {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    const book = await importSample1Book(store, roots.codeRoot, '润色夹具');
    const polishDigest = polishRequestDigestOf(store, book);
    const { markId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const regenerationDigest = regenerationRequestDigestOf(conflict, conflictUnitIndex(conflict));
    expect(polishDigest).toMatch(/^[0-9a-f]{64}$/u);
    await writeFile(resolve(FIXTURES, 'sample1-polish-authored.json'), `${JSON.stringify(fixture(
      'sample1-polish-authored',
      'Authored 润色这段 answer (Issue #842) for one sentence of exact sample1, keyed under unit ordinal 0 by the ai7.editorial-polish/1 request digest of that selection and its paragraph context: two anchored replacements quoting the sentence and one whose words are not in it, which the service withholds.',
      polishDigest,
      AUTHORED_POLISH_ANSWER,
    ), null, 2)}\n`, 'utf8');
    await writeFile(resolve(FIXTURES, 'sample1-conflict-regenerate-authored.json'), `${JSON.stringify(fixture(
      'sample1-conflict-regenerate-authored',
      'Authored 基于当前稿件重新生成建议 answer (Issue #842) for the one conflict unit of a Three-way Proposal Conflict constructed from tester edits of exact sample1 (a 修改建议 on one phrase, then typing over part of it), keyed under unit ordinal 0 by the ai7.conflict-regenerate/1 request digest of that unit.',
      regenerationDigest,
      AUTHORED_REGENERATION_ANSWER,
    ), null, 2)}\n`, 'utf8');
  } finally {
    store.close();
  }
}, 60_000);
