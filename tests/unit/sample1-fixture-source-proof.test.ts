import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx } from '../../src/service/docx.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { buildUnitMessage, BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';

// Source admission regression (#387): public sample1 plus an external temporary synthetic product
// record. No protected cache, ledger, credential or actual business store is read by this test.
// @ts-expect-error Plain ESM tool has no declarations.
const tool = await import('../../tools/generate-model-fixture.mjs') as {
  parseCachedRequest(body: string, contract: string): unknown;
  verifySample1Capture(request: unknown, selection: unknown, parsed: unknown): Promise<boolean>;
  redactUnitResultText(text: string, own: string[], carried: string[], verified?: boolean): string;
  parseGenerationArguments(args: string[]): unknown;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceDigest = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';

describe('exact sample1 fixture exemption source proof', () => {
  let temporary: string;
  let database: DatabaseSync;
  let request: { sample1Store: string; sample1Task: string };
  let selection: { model: string; taskPromptContractDigest: string; captured: { route: string } };
  let message: string;
  let own: string[];
  beforeEach(async () => {
    temporary = await mkdtemp(join(tmpdir(), 'ai7-sample1-proof-'));
    request = { sample1Store: join(temporary, 'synthetic.sqlite'), sample1Task: randomUUID() };
    selection = { model: 'synthetic-proof-model', taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, captured: { route: 'opencode-go' } };
    const blocks: ManifestBlockInput[] = [];
    await parseDocx(resolve(root, 'SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }), { digest: sourceDigest, bytes: 29_550 });
    const manifest = deriveCoverageManifest({ bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', revisionDigest: 'a'.repeat(64), blocks });
    const unit = manifest.units[0]!;
    const byId = new Map(blocks.map((block) => [block.blockId, block]));
    message = buildUnitMessage(unit, manifest.units.length, byId);
    own = unit.blockIds.map((id) => byId.get(id)!.text);
    database = new DatabaseSync(request.sample1Store);
    database.exec('CREATE TABLE analysis_plan_records (task_intent_id TEXT, plan_version INTEGER, component TEXT, canonical_json TEXT, sha256 TEXT); CREATE TABLE analysis_result_set_revisions (task_intent_id TEXT, ordinal INTEGER, canonical_json TEXT, sha256 TEXT)');
    const insert = database.prepare('INSERT INTO analysis_plan_records VALUES (?,1,?,?,?)');
    for (const [component, value] of Object.entries({
      'manuscript-pin': { sourceDigest, revisionId: manifest.manuscript.revisionId, revisionDigest: manifest.manuscript.revisionDigest },
      'coverage-manifest': manifest,
      'plan-envelope': { promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST },
    })) { const json = canonicalJson(value); insert.run(request.sample1Task, component, json, sha256Hex(json)); }
    const revision = canonicalJson({ coverageManifestDigest: manifest.digest, adapterPin: { model: selection.model, route: selection.captured.route }, bindingPin: { promptContractDigest: selection.taskPromptContractDigest } });
    database.prepare('INSERT INTO analysis_result_set_revisions VALUES (?,1,?,?)').run(request.sample1Task, revision, sha256Hex(revision));
  });
  afterEach(async () => { database.close(); await rm(temporary, { recursive: true, force: true }); });
  const parsed = () => tool.parseCachedRequest(JSON.stringify({ messages: [{ role: 'system', content: BASELINE_PROMPT_CONTRACT.systemPrompt }, { role: 'user', content: message }] }), BASELINE_PROMPT_CONTRACT_DIGEST);

  it('proves the carrier, extracted full manifest and exact message before preserving sample1 quotations', async () => {
    const verified = await tool.verifySample1Capture(request, selection, parsed());
    expect(verified).toBe(true);
    const text = JSON.stringify({ synopsis: own.find((paragraph) => paragraph.length > 40)!.slice(0, 20) });
    expect(tool.redactUnitResultText(text, own, own, verified) === text).toBe(true);
    expect(() => tool.redactUnitResultText(text, own, own)).toThrowError(/FIXTURE_GEN\/manuscript-echo/);
  });

  it.each(['source', 'manifest', 'digest', 'task', 'model', 'message'] as const)('refuses %s mismatch rather than exempting another capture', async (damage) => {
    if (damage === 'source') {
      const json = canonicalJson({ sourceDigest: 'b'.repeat(64) });
      database.prepare("UPDATE analysis_plan_records SET canonical_json=?,sha256=? WHERE component='manuscript-pin'").run(json, sha256Hex(json));
    } else if (damage === 'manifest') {
      const row = database.prepare("SELECT canonical_json FROM analysis_plan_records WHERE component='coverage-manifest'").get()!;
      const manifest = JSON.parse(row.canonical_json as string) as { units: Array<{ blockDigests: string[] }> };
      manifest.units[0]!.blockDigests[0] = 'c'.repeat(64);
      const json = canonicalJson(manifest);
      database.prepare("UPDATE analysis_plan_records SET canonical_json=?,sha256=? WHERE component='coverage-manifest'").run(json, sha256Hex(json));
    } else if (damage === 'digest') database.exec("UPDATE analysis_plan_records SET sha256='damaged'");
    else if (damage === 'task') request.sample1Task = randomUUID();
    else if (damage === 'model') selection.model = 'other-model';
    else message = message.replace(own[5]!, '完全不同的合成稿件段落。');
    await expect(tool.verifySample1Capture(request, selection, parsed())).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });

  it('requires the external store and task as a pair, and leaves ordinary conversion bounded', async () => {
    const args = ['--from-cache', 'S40/proof/1', '--cache-root', temporary, '--identity', 'proof', '--description', 'Synthetic proof', '--out', join(temporary, 'candidate.json')];
    expect(() => tool.parseGenerationArguments([...args, '--sample1-task', request.sample1Task])).toThrowError(/FIXTURE_GEN\/arguments-invalid/);
    expect(await tool.verifySample1Capture({}, selection, parsed())).toBe(false);
    await expect(tool.verifySample1Capture({ ...request, sample1Store: resolve(root, 'synthetic.sqlite') }, selection, parsed())).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });

  it('refuses carried foreign turns even when the final unit message matches sample1', async () => {
    const candidate = tool.parseCachedRequest(JSON.stringify({ messages: [
      { role: 'system', content: BASELINE_PROMPT_CONTRACT.systemPrompt },
      { role: 'assistant', content: '来自另一份合成稿件的早先回答。' },
      { role: 'user', content: message },
    ] }), BASELINE_PROMPT_CONTRACT_DIGEST);
    await expect(tool.verifySample1Capture(request, selection, candidate)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });
});
