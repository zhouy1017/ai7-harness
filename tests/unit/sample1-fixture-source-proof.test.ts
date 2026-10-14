import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx } from '../../src/service/docx.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import {
  buildUnitMessage,
  BASELINE_PROMPT_CONTRACT,
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_PROMPT_CONTRACT_V1,
  BASELINE_PROMPT_CONTRACT_V1_DIGEST,
} from '../../src/service/analysis/contract.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { reviewCategoryContract, reviewCategoryContractDigest, buildReviewCategoryUnitMessage } from '../../src/service/review/review-category-contract.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { evaluationRewriteKindDefinition } from '../../src/service/evaluation/evaluation-rewrite-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import type { AnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { WritingTasks } from '../../src/service/writing-tasks.js';
import { buildWritingUnitMessage, buildWritingSynthesisMessage, writingContract, writingContractDigest, type WritingContractInput } from '../../src/service/writing/writing-contract.js';
import type { CoverageManifestProjection } from '../../src/shared/protocol.js';

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

  it('proves a capture of the original /1 Run under /1 alone, and no task contract under another (#826)', async () => {
    const asV1 = (component: string, value: unknown) => {
      const json = canonicalJson(value);
      database.prepare('UPDATE analysis_plan_records SET canonical_json=?,sha256=? WHERE component=?').run(json, sha256Hex(json), component);
    };
    asV1('plan-envelope', { promptContractDigest: BASELINE_PROMPT_CONTRACT_V1_DIGEST });
    const row = database.prepare('SELECT canonical_json FROM analysis_result_set_revisions').get()!;
    const revision = canonicalJson({ ...(JSON.parse(row.canonical_json as string) as Record<string, unknown>), bindingPin: { promptContractDigest: BASELINE_PROMPT_CONTRACT_V1_DIGEST } });
    database.prepare('UPDATE analysis_result_set_revisions SET canonical_json=?,sha256=?').run(revision, sha256Hex(revision));
    const v1 = { ...selection, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_V1_DIGEST };
    const under = (system: string) => tool.parseCachedRequest(JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: message }] }), BASELINE_PROMPT_CONTRACT_V1_DIGEST);
    expect(await tool.verifySample1Capture(request, v1, under(BASELINE_PROMPT_CONTRACT_V1.systemPrompt))).toBe(true);
    // The /2 system prompt is not the /1 task's, and a /2 selection does not match the /1 Task's records.
    await expect(tool.verifySample1Capture(request, v1, under(BASELINE_PROMPT_CONTRACT.systemPrompt))).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    await expect(tool.verifySample1Capture(request, selection, parsed())).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    await expect(tool.verifySample1Capture(request, { ...selection, taskPromptContractDigest: 'f'.repeat(64) }, parsed())).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });

  it('requires the external store and task as a pair, and leaves ordinary conversion bounded', async () => {
    const args = ['--from-cache', 'S40/proof/1', '--cache-root', temporary, '--identity', 'proof', '--description', 'Synthetic proof', '--out', join(temporary, 'candidate.json')];
    expect(() => tool.parseGenerationArguments([...args, '--sample1-task', request.sample1Task])).toThrowError(/FIXTURE_GEN\/arguments-invalid/);
    expect(await tool.verifySample1Capture({}, selection, parsed())).toBe(false);
    await expect(tool.verifySample1Capture({ ...request, sample1Store: resolve(root, 'synthetic.sqlite') }, selection, parsed())).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });

  it('proves review captures against the frozen category and refuses a changed category or material references (#809)', async () => {
    const row = database.prepare("SELECT canonical_json FROM analysis_plan_records WHERE component='coverage-manifest'").get()!;
    const manifest = JSON.parse(String(row.canonical_json)) as CoverageManifestProjection;
    const blocks: ManifestBlockInput[] = [];
    await parseDocx(resolve(root, 'SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }), { digest: sourceDigest, bytes: 29_550 });
    const ids = manifest.units.flatMap((unit) => unit.blockIds);
    const byId = new Map(blocks.map((block, index) => [ids[index]!, { ...block, blockId: ids[index]! }]));
    const entry = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories[0]!;
    const contract = reviewCategoryContract(reviewCategoryContractInput(entry));
    const digest = reviewCategoryContractDigest(contract);
    const envelope = { promptContractDigest: digest };
    const json = canonicalJson(envelope);
    database.prepare("UPDATE analysis_plan_records SET canonical_json=?,sha256=? WHERE component='plan-envelope'").run(json, sha256Hex(json));
    const revision = canonicalJson({ coverageManifestDigest: manifest.digest, adapterPin: { model: selection.model, route: selection.captured.route }, bindingPin: { promptContractDigest: digest } });
    database.prepare('UPDATE analysis_result_set_revisions SET canonical_json=?,sha256=?').run(revision, sha256Hex(revision));
    database.exec('CREATE TABLE review_runs (canonical_json TEXT, sha256 TEXT)');
    const category = { executor: entry.executor, entry, task: { taskIntentId: request.sample1Task, kind: `editorial-review/${entry.categoryId}`, planEnvelopeDigest: sha256Hex(json) } };
    const snapshot = { categories: [category] };
    const save = (value: unknown) => {
      database.exec('DELETE FROM review_runs');
      const encoded = canonicalJson(value);
      database.prepare('INSERT INTO review_runs VALUES (?,?)').run(encoded, sha256Hex(encoded));
    };
    save(snapshot);
    const reviewSelection = { ...selection, taskPromptContractDigest: digest };
    const reviewMessage = buildReviewCategoryUnitMessage(contract, manifest.units[0]!, manifest.units.length, byId);
    const candidate = tool.parseCachedRequest(JSON.stringify({ messages: [{ role: 'system', content: contract.systemPrompt }, { role: 'user', content: reviewMessage }] }), digest);
    expect(await tool.verifySample1Capture(request, reviewSelection, candidate)).toBe(true);
    save({ categories: [{ ...category, entry: { ...entry, label: '另一审阅类别' } }] });
    await expect(tool.verifySample1Capture(request, reviewSelection, candidate)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    save({ ...snapshot, materialReferences: { bookId: randomUUID(), references: [] } });
    await expect(tool.verifySample1Capture(request, reviewSelection, candidate)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });

  describe('evaluation captures against the input their Task froze (#429)', () => {
    const profile = { ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) };
    const reportInput = { template: 'author' as const, record: { profile: { title: '合成方案', version: '1' },
      items: [{ label: '合成评分项', fullMarks: 100, score: 80, notRated: null, comment: '合成评语', ai7: null }],
      total: { score: 80, fullMarks: 100 }, strengths: ['合成优点'], weaknesses: ['合成问题'],
      risks: [], readiness: [], verdict: '合成总评', conclusion: '修改后再议' }, exemplars: [{ title: '合成本社范例', text: '合成范例段落，只用于测试。' }] };
    const rewriteInput = {
      profile: { title: '合成方案', version: '1' },
      items: [{ itemId: 'literary-quality', label: '文学品质', fullMarks: 20, score: 13, notRated: null, comment: '合成评语。', ai7: { score: 16.5, comment: '合成评语。' }, adjustment: { reasons: ['打分偏高'], note: null } }],
      strengths: ['合成优点'], weaknesses: ['合成问题'], verdict: null, conclusions: ['推荐出版', '修改后再议', '暂缓', '不推荐'],
    };
    const kinds = {
      evaluation: { table: 'initial_evaluation_tasks', definition: initialEvaluationKindDefinition(profile), frozen: { profile } },
      'readers-report': { table: 'readers_report_tasks', definition: readersReportKindDefinition(reportInput), frozen: { input: reportInput } },
      'evaluation-rewrite': { table: 'evaluation_rewrite_tasks', definition: evaluationRewriteKindDefinition(rewriteInput), frozen: { input: rewriteInput } },
    } as const;

    /** The Task's records as the store freezes them: its kind, plan, contract input and first revision. */
    async function freeze(kind: keyof typeof kinds, definition: AnalysisKindDefinition, frozen: Record<string, unknown>, execution: Record<string, unknown> = {}) {
      const row = database.prepare("SELECT canonical_json FROM analysis_plan_records WHERE component='coverage-manifest'").get()!;
      const manifest = JSON.parse(String(row.canonical_json)) as CoverageManifestProjection;
      const blocks: ManifestBlockInput[] = [];
      await parseDocx(resolve(root, 'SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }), { digest: sourceDigest, bytes: 29_550 });
      const ids = manifest.units.flatMap((unit) => unit.blockIds);
      const byId = new Map(blocks.map((block, index) => [ids[index]!, { ...block, blockId: ids[index]! }]));
      const digest = definition.promptContractDigest;
      const put = (component: string, value: unknown) => {
        const json = canonicalJson(value);
        database.prepare('DELETE FROM analysis_plan_records WHERE component=?').run(component);
        database.prepare('INSERT INTO analysis_plan_records VALUES (?,1,?,?,?)').run(request.sample1Task, component, json, sha256Hex(json));
      };
      put('plan-envelope', { promptContractDigest: digest });
      put('execution-plan', execution);
      const revisionId = randomUUID();
      const revision = canonicalJson({ revisionId, coverageManifestDigest: manifest.digest, adapterPin: { model: selection.model, route: selection.captured.route }, bindingPin: { promptContractDigest: digest } });
      database.prepare('UPDATE analysis_result_set_revisions SET canonical_json=?,sha256=?').run(revision, sha256Hex(revision));
      database.exec(`CREATE TABLE IF NOT EXISTS analysis_task_intents (task_intent_id TEXT, kind TEXT); DELETE FROM analysis_task_intents;
        CREATE TABLE IF NOT EXISTS ${kinds[kind].table} (task_intent_id TEXT, prompt_contract_sha256 TEXT, canonical_json TEXT, sha256 TEXT); DELETE FROM ${kinds[kind].table};
        CREATE TABLE IF NOT EXISTS analysis_unit_results (revision_id TEXT, unit_ordinal INTEGER, state TEXT, canonical_json TEXT, sha256 TEXT)`);
      database.prepare('INSERT INTO analysis_task_intents VALUES (?,?)').run(request.sample1Task, kind);
      const record = canonicalJson({ taskIntentId: request.sample1Task, promptContractSha256: digest, ...frozen });
      database.prepare(`INSERT INTO ${kinds[kind].table} VALUES (?,?,?,?)`).run(request.sample1Task, digest, record, sha256Hex(record));
      return { manifest, byId, digest, revisionId };
    }
    const capture = (system: string, user: string, digest: string) =>
      tool.parseCachedRequest(JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }), digest);

    it.each(Object.keys(kinds) as Array<keyof typeof kinds>)('proves a %s unit capture and refuses another frozen input or material references', async (kind) => {
      const { definition, frozen } = kinds[kind];
      const { manifest, byId, digest } = await freeze(kind, definition, frozen);
      const unit = capture(definition.systemPrompt, definition.buildUnitMessage(manifest.units[0]!, manifest.units.length, byId), digest);
      const chosen = { ...selection, taskPromptContractDigest: digest, promptContractDigest: digest };
      expect(await tool.verifySample1Capture(request, chosen, unit)).toBe(true);
      // Another frozen input names another contract: the capture is not proved by today's profile or record.
      const renamed = { ...BUILTIN_EVALUATION_PROFILE, items: BUILTIN_EVALUATION_PROFILE.items.map((item, index) => (index === 0 ? { ...item, label: '另一评分项' } : item)) };
      const other = kind === 'evaluation' ? { profile: { ...renamed, sha256: evaluationProfileDigest(renamed) } }
        : kind === 'readers-report' ? { input: { ...reportInput, record: { ...reportInput.record, verdict: '另一总评' } } }
        : { input: { ...rewriteInput, strengths: ['另一优点'] } };
      await freeze(kind, definition, other);
      await expect(tool.verifySample1Capture(request, chosen, unit)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
      // A snapshot whose profile does not read as its own digest proves nothing either.
      if (kind === 'evaluation') {
        await freeze(kind, definition, { profile: { ...renamed, sha256: profile.sha256 } });
        await expect(tool.verifySample1Capture(request, chosen, unit)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
      }
      await freeze(kind, definition, frozen, { materialReferences: [] });
      await expect(tool.verifySample1Capture(request, chosen, unit)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    });

    it('proves an evaluation synthesis capture from the closed units the revision kept', async () => {
      const { definition, frozen } = kinds.evaluation;
      const { manifest, digest, revisionId } = await freeze('evaluation', definition, frozen);
      const observations = [{ itemId: profile.items[0]!.itemId, note: '合成依据。', blockOrdinals: [1] }];
      const record = canonicalJson({ state: 'closed', unitOrdinal: 1, requestDigest: 'a'.repeat(64), responseDigest: 'b'.repeat(64), usage: null, observations });
      database.prepare("INSERT INTO analysis_unit_results VALUES (?,1,'closed',?,?)").run(revisionId, record, sha256Hex(record));
      const closed = [{ unitOrdinal: 1, result: definition.unitResultOfRecord(JSON.parse(record) as Record<string, unknown>, 1) }];
      const message = definition.crossUnit!.step!.buildMessage(closed as never, manifest.units.length);
      const chosen = { ...selection, taskPromptContractDigest: digest, promptContractDigest: digest };
      expect(await tool.verifySample1Capture(request, chosen, capture(definition.systemPrompt, message, digest))).toBe(true);
      const altered = definition.crossUnit!.step!.buildMessage([{ ...closed[0]!, result: { ...closed[0]!.result as object, observations: [] } }] as never, manifest.units.length);
      await expect(tool.verifySample1Capture(request, chosen, capture(definition.systemPrompt, altered, digest))).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    });
  });

  it('refuses carried foreign turns even when the final unit message matches sample1', async () => {
    const candidate = tool.parseCachedRequest(JSON.stringify({ messages: [
      { role: 'system', content: BASELINE_PROMPT_CONTRACT.systemPrompt },
      { role: 'assistant', content: '来自另一份合成稿件的早先回答。' },
      { role: 'user', content: message },
    ] }), BASELINE_PROMPT_CONTRACT_DIGEST);
    await expect(tool.verifySample1Capture(request, selection, candidate)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
  });

  it.each(['unit', 'synthesis'] as const)('proves writing %s from the frozen writing row and refuses altered inputs or source records (#810)', async (stage) => {
    const row = database.prepare("SELECT canonical_json FROM analysis_plan_records WHERE component='coverage-manifest'").get()!;
    const manifest = JSON.parse(String(row.canonical_json)) as CoverageManifestProjection;
    const blocks: ManifestBlockInput[] = [];
    await parseDocx(resolve(root, 'SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }), { digest: sourceDigest, bytes: 29_550 });
    const ids = manifest.units.flatMap((unit) => unit.blockIds);
    const byId = new Map(blocks.map((block, index) => [ids[index]!, { ...block, blockId: ids[index]! }]));
    const input: WritingContractInput = { type: { typeId: 'promotion-article', label: '宣传文章' },
      book: { title: '合成图书', authors: [], editors: [], series: [] }, audience: '读者', channel: '纸面', requirements: null,
      synopsis: null, evaluation: null, exemplars: [] };
    const contract = writingContract(input);
    const digest = writingContractDigest(contract);
    const envelope = canonicalJson({ promptContractDigest: digest });
    database.prepare("UPDATE analysis_plan_records SET canonical_json=?,sha256=? WHERE component='plan-envelope'").run(envelope, sha256Hex(envelope));
    const revisionId = randomUUID();
    const revision = canonicalJson({ revisionId, coverageManifestDigest: manifest.digest, adapterPin: { model: selection.model, route: selection.captured.route }, bindingPin: { promptContractDigest: digest } });
    database.prepare('UPDATE analysis_result_set_revisions SET canonical_json=?,sha256=?').run(revision, sha256Hex(revision));
    database.exec('CREATE TABLE writing_tasks (task_intent_id TEXT, prompt_contract_sha256 TEXT, book_id TEXT, type_id TEXT, evaluation_record_id TEXT, baseline_revision_id TEXT, recorded_at TEXT, canonical_json TEXT, sha256 TEXT); CREATE TABLE analysis_task_intents (task_intent_id TEXT, book_id TEXT, kind TEXT); CREATE TABLE analysis_unit_results (revision_id TEXT, unit_ordinal INTEGER, state TEXT, canonical_json TEXT, sha256 TEXT)');
    database.prepare('INSERT INTO analysis_task_intents VALUES (?,?,?)').run(request.sample1Task, manifest.manuscript.bookId, 'writing');
    new WritingTasks(database).recordTask({ taskIntentId: request.sample1Task, bookId: manifest.manuscript.bookId,
      evaluationRecordId: null, baselineRevisionId: null, exemplarSources: [], contract: input, promptContractSha256: digest, copyRules: 2 });
    const closed = manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal, result: { schema: 'ai7.writing.unit-result/1' as const, unitOrdinal: unit.ordinal,
      passages: [{ kind: 'highlight' as const, note: '合成看点。', blockOrdinals: [1] }] } }));
    for (const unit of closed) {
      const json = canonicalJson({ state: 'closed', unitOrdinal: unit.unitOrdinal, passages: unit.result.passages });
      database.prepare('INSERT INTO analysis_unit_results VALUES (?,?,?,?,?)').run(revisionId, unit.unitOrdinal, 'closed', json, sha256Hex(json));
    }
    const writingMessage = stage === 'unit' ? buildWritingUnitMessage(contract, manifest.units[0]!, manifest.units.length, byId)
      : buildWritingSynthesisMessage(contract, closed, manifest.units.length);
    const candidate = tool.parseCachedRequest(JSON.stringify({ messages: [{ role: 'system', content: contract.systemPrompt }, { role: 'user', content: writingMessage }] }), digest);
    // The writing synthesis turn's stage contract is the Task's own, as the execution owner records it.
    const writingSelection = { ...selection, taskPromptContractDigest: digest, promptContractDigest: digest };
    expect(await tool.verifySample1Capture(request, writingSelection, candidate)).toBe(true);
    if (stage === 'synthesis') {
      database.exec("UPDATE analysis_unit_results SET sha256='damaged'");
      await expect(tool.verifySample1Capture(request, writingSelection, candidate)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    } else {
      const row = database.prepare('SELECT canonical_json FROM writing_tasks').get()!;
      const record = JSON.parse(String(row.canonical_json)) as { input: WritingContractInput };
      const json = canonicalJson({ ...record, input: { ...record.input, audience: '另一受众' } });
      database.prepare('UPDATE writing_tasks SET canonical_json=?,sha256=?').run(json, sha256Hex(json));
      await expect(tool.verifySample1Capture(request, writingSelection, candidate)).rejects.toMatchObject({ code: 'FIXTURE_GEN/sample1-source-unproved' });
    }
  });
});
