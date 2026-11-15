import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { clarificationPromptContractDigest } from '../../src/service/provider/clarification-contract.js';
import { parseDocx } from '../../src/service/docx.js';
import { blockDigest } from '../../src/service/manuscript/command-history.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, BASELINE_PROMPT_CONTRACT_V2_DIGEST, parseUnitResult, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_V1_DIGEST, crossUnitRequestDigest, citedBlocksByUnit, crossUnitRows, unitSetDigest, type ClosedUnitResult } from '../../src/service/analysis/cross-unit-contract.js';

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
    for (const unit of manifest.units) keys.set(unitRequestDigest(clarificationPromptContractDigest(BASELINE_PROMPT_CONTRACT_V2_DIGEST), unit.ordinal, unit.digest), unitRequestDigest(clarificationPromptContractDigest(BASELINE_PROMPT_CONTRACT_DIGEST), unit.ordinal, unit.digest));
    const question = { question: '本范围按哪个阅读重点处理？', options: ['人物', '事件'], freeTextAllowed: true };
    const answer = canonicalJson({ schema: 'ai7.provider.clarification-answer-turn/2', question, answer: '人物' });
    const unit = manifest.units[0]!;
    const followup = (contract: string) => sha256Hex(canonicalJson({ unitRequestDigest: unitRequestDigest(clarificationPromptContractDigest(contract), unit.ordinal, unit.digest), answer }));
    keys.set(followup(BASELINE_PROMPT_CONTRACT_V2_DIGEST), followup(BASELINE_PROMPT_CONTRACT_DIGEST));
  }
  for (const set of ['07dcb9d6dc825a008ba491c8f0fcb236252b8dba68ceaa1be738b2614473857f', '330f5f44073d4758826cbe384c615677ff1e53fa55c546ac7b30bbb218d682e1', '487d3aa59a9aa024db456117b35d6c46ea52590b2e1bf6a5d901dddcab9eaeac']) {
    keys.set(crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_V1_DIGEST, set), crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, set));
  }
  keys.set(unitRequestDigest(BASELINE_PROMPT_CONTRACT_V2_DIGEST, 1, '0'.repeat(64)), unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, '0'.repeat(64)));
  mkdirSync(resolve('.cache'), { recursive: true });
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

// One-shot upgrade of the hand-authored responses; safe to repeat after the upgrade.
async function upgradeAuthoredBaselineFixtures() {
  const directory = resolve('tests/fixtures/model');
  const blocks: ManifestBlockInput[] = [];
  await parseDocx(resolve('SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }));
  const id = '11111111-1111-4111-8111-111111111111';
  const manifest = deriveCoverageManifest({ bookId: id, manuscriptId: id, branchId: id, revisionId: id, revisionLabel: 'r1', revisionDigest: 'a'.repeat(64), blocks });
  const files = readdirSync(directory).filter((name) => name.endsWith('.json')).map((name) => ({ name, source: readFileSync(resolve(directory, name), 'utf8') }))
    .filter(({ source }) => !(JSON.parse(source).entries ?? []).some((entry: { capture?: unknown }) => entry.capture !== undefined));
  for (const file of files) {
    if (!['sample1-baseline-happy.json', 'sample1-model-clarification.json'].includes(file.name)) continue;
    const fixture = JSON.parse(file.source);
    for (const entry of fixture.entries) {
      if (entry.unitOrdinal < 1 || entry.response.kind !== 'unit-result') continue;
      const body = JSON.parse(entry.response.text);
      if (body.schema !== 'ai7.baseline-manuscript-analysis.unit-result/1') continue;
      const overlap = manifest.units[entry.unitOrdinal - 1]!.overlapBlockIds.length;
      for (const section of ['entities', 'events', 'relationships', 'settingClaims', 'conflicts', 'unresolved']) {
        for (const item of body[section] ?? []) {
          if (!Array.isArray(item.sourceRanges)) continue;
          item.blockOrdinals = item.sourceRanges.map((range: { blockId: string }) => {
            const match = /^\{\{block:(\d+)\}\}$/u.exec(range.blockId);
            if (match === null) throw new Error('AUTHORED_BLOCK_REFERENCE_UNEXPECTED');
            return Number(match[1]) + overlap;
          });
          delete item.sourceRanges;
        }
      }
      entry.response.text = JSON.stringify(body);
    }
    file.source = JSON.stringify(fixture, null, 2) + '\n';
  }
  const happy = JSON.parse(files.find(({ name }) => name === 'sample1-baseline-happy.json')!.source);
  const closed = (ordinals: number[], edited = false): ClosedUnitResult[] => ordinals.map((unitOrdinal) => {
    const entries = happy.entries.filter((entry: { unitOrdinal: number }) => entry.unitOrdinal === unitOrdinal);
    const entry = unitOrdinal !== 1 ? entries[0] : entries.find((entry: { response: { text: string } }) => entry.response.text.includes(edited ? '已确认编辑后重算' : '合成概述（单元 1）：'));
    const blockIds = Array.from({ length: 32 }, (_, index) => `blk_${String(unitOrdinal).padStart(2, '0')}${String(index + 1).padStart(2, '0')}${'0'.repeat(20)}`);
    const parsed = parseUnitResult(entry.response.text, { unitOrdinal, blockIds });
    if (!parsed.ok) throw new Error('AUTHORED_UNIT_INVALID');
    return { unitOrdinal, result: parsed.result };
  });
  const seven = [1, 3, 4, 5, 6, 7, 8], eight = [1, 2, 3, 4, 5, 6, 7, 8];
  const sets = [closed(seven), closed(seven, true), closed(eight)];
  const oldSets = ['07dcb9d6dc825a008ba491c8f0fcb236252b8dba68ceaa1be738b2614473857f', '330f5f44073d4758826cbe384c615677ff1e53fa55c546ac7b30bbb218d682e1', '487d3aa59a9aa024db456117b35d6c46ea52590b2e1bf6a5d901dddcab9eaeac'];
  const oldContracts = ['8298dc9db1b95f26072cabb00a8c9a14997f68ebe7bf07d01181985f848e66cb', '1cb1fb36d7cf54d0b887a01d85598b67fb4487e4f8446209861edc1c18018142', BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST];
  const keys = new Map<string, string>();
  for (const [index, set] of sets.entries()) for (const contract of oldContracts) {
    keys.set(crossUnitRequestDigest(contract, oldSets[index]!), crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(set)));
  }
  const newSets = new Map(sets.map((set) => [crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(set)), set]));
  for (const file of files) {
    let source = file.source;
    for (const [from, to] of keys) if (from !== to) source = source.replaceAll(from, to);
    const fixture = JSON.parse(source);
    let converted = false;
    for (const entry of fixture.entries ?? []) {
      const set = newSets.get(entry.requestDigest);
      if (set === undefined || entry.response.kind !== 'unit-result') continue;
      const body = JSON.parse(entry.response.text);
      if (body.schema !== 'ai7.baseline-manuscript-analysis.cross-unit-result/1') continue;
      const rows = crossUnitRows(set), cited = citedBlocksByUnit(set);
      for (const finding of body.findings) {
        if (!Array.isArray(finding.sides)) continue;
        finding.rowRefs = finding.sides.map((side: { unitOrdinal: number; sourceRanges: Array<{ blockId: string }> }) => {
          const ids = side.sourceRanges.map(({ blockId }) => {
            const match = /^\{\{unit:(\d+):block:(\d+)\}\}$/u.exec(blockId);
            if (match === null) throw new Error('AUTHORED_SIDE_REFERENCE_UNEXPECTED');
            return cited.get(Number(match[1]))![Number(match[2]) - 1]!;
          });
          const index = rows.findIndex((row) => row.unitOrdinal === side.unitOrdinal && row.sourceRanges.length === ids.length && row.sourceRanges.every((range) => ids.includes(range.blockId)));
          if (index < 0) throw new Error('AUTHORED_ROW_REFERENCE_UNRESOLVED');
          return `r${index + 1}`;
        });
        delete finding.sides; converted = true;
      }
      entry.response.text = JSON.stringify(body);
    }
    if (converted) source = JSON.stringify(fixture, null, 2) + '\n';
    if (source !== readFileSync(resolve(directory, file.name), 'utf8')) writeFileSync(resolve(directory, file.name), source);
  }
  mkdirSync(resolve('.cache'), { recursive: true });
  writeFileSync(resolve('.cache/1434-ordinal-upgrade.json'), JSON.stringify({ contract: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, sets: sets.map(unitSetDigest), keys: Object.fromEntries(keys) }));
  expect(sets).toHaveLength(3);
}

it.skipIf(process.env.AI7_REGENERATE_BASELINE !== '1')('upgrades authored baseline fixtures to ordinal answers without model calls', upgradeAuthoredBaselineFixtures);
