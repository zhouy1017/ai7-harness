import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
import { parseDocx } from '../../src/service/docx.js';
import { blockDigest } from '../../src/service/manuscript/command-history.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, BASELINE_PROMPT_CONTRACT_V2_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_V1_DIGEST, crossUnitRequestDigest } from '../../src/service/analysis/cross-unit-contract.js';

// Baseline fixtures are hand-authored. Rekey their requests offline; never rewrite captured responses.
it.skipIf(process.env.AI7_REGENERATE_BASELINE !== '1')('rekeys authored baseline fixtures from the SampleBook manifest', async () => {
  const blocks: ManifestBlockInput[] = [];
  await parseDocx(resolve('SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }));
  const keys = new Map<string, string>();
  const id = '11111111-1111-4111-8111-111111111111';
  for (const suffix of ['', '，J-04 结果集形成后的确认编辑']) {
    const input = blocks.map((block, index) => index !== 0 || suffix === '' ? block : { ...block, text: block.text + suffix,
      digest: blockDigest(block.kind, block.level, block.text + suffix), graphemes: block.graphemes + [...suffix].length });
    const manifest = deriveCoverageManifest({ bookId: id, manuscriptId: id, branchId: id, revisionId: id, revisionLabel: 'r1', revisionDigest: 'a'.repeat(64), blocks: input });
    for (const unit of manifest.units) keys.set(unitRequestDigest(BASELINE_PROMPT_CONTRACT_V2_DIGEST, unit.ordinal, unit.digest), unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest));
  }
  for (const set of ['07dcb9d6dc825a008ba491c8f0fcb236252b8dba68ceaa1be738b2614473857f', '330f5f44073d4758826cbe384c615677ff1e53fa55c546ac7b30bbb218d682e1', '487d3aa59a9aa024db456117b35d6c46ea52590b2e1bf6a5d901dddcab9eaeac']) {
    keys.set(crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_V1_DIGEST, set), crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, set));
  }
  keys.set(unitRequestDigest(BASELINE_PROMPT_CONTRACT_V2_DIGEST, 1, '0'.repeat(64)), unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, '0'.repeat(64)));
  writeFileSync(resolve('.cache/1434-keys.json'), JSON.stringify(Object.fromEntries(keys)));
  let changed = 0;
  for (const name of readdirSync(resolve('tests/fixtures/model'))) {
    if (!name.endsWith('.json')) continue;
    const path = resolve('tests/fixtures/model', name);
    const source = readFileSync(path, 'utf8');
    const fixture = JSON.parse(source);
    if (fixture.entries?.some((entry: { capture?: unknown }) => entry.capture !== undefined)) continue;
    let next = source;
    for (const [oldKey, newKey] of keys) next = next.replaceAll(oldKey, newKey);
    if (next !== source) { writeFileSync(path, next); changed++; }
  }
  expect(keys.size).toBeGreaterThan(8);
});
