import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, crossUnitRequestDigest } from '../../src/service/analysis/cross-unit-contract.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT, ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, assuranceSamplingRequestDigest, parseAssuranceSamplingResult } from '../../src/service/analysis/assurance-sampling-contract.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import { factualReviewRequestDigest } from '../../src/service/analysis/factual-review-contract.js';
import { initialEvaluationRequestDigest, initialEvaluationSynthesisRequestDigest } from '../../src/service/evaluation/initial-evaluation-contract.js';
import { readersReportRequestDigest, readersReportSynthesisRequestDigest } from '../../src/service/evaluation/readers-report-contract.js';
import { evaluationRewriteRequestDigest, evaluationRewriteSynthesisRequestDigest } from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import { writingRequestDigest, writingSynthesisRequestDigest } from '../../src/service/writing/writing-contract.js';
import { reviewCategoryRequestDigest } from '../../src/service/review/review-category-contract.js';
import { DIALOGUE_PROMPT_CONTRACT_DIGEST, dialogueRequestDigest } from '../../src/service/dialogue/contract.js';
import { Ai7LocalDeterministicAdapter } from '../../src/service/provider/local-deterministic-adapter.js';
import { loadModelFixture, parseModelFixture } from '../../src/service/provider/model-fixture.js';

// The protected cache is never consulted. These files contain synthetic request/response stand-ins only.
// @ts-expect-error Plain Node ESM tool has no TypeScript declarations.
const tool = await import('../../tools/generate-model-fixture.mjs') as {
  generateModelFixture(request: { selector: string; cacheRoot: string; identity: string; description: string; out: string }): Promise<Record<string, unknown>>;
  namespacedCacheKey(namespace: Record<string, string>, digest: string): string;
  evidenceGeneration(namespace: Record<string, string>, contract: string, taskContract?: string): string;
  parseCachedRequest(body: string, contract: string): { requestDigest: string; subject: string };
};
const MODEL = 'deepseek-v4-flash';
const ITEM = 'S40/fixture/1';
const D = 'a'.repeat(64);
const B = `blk_${'1'.repeat(24)}`;
const FRESH = `blk_${'2'.repeat(24)}`;
const NAMESPACE = { route: 'opencode-go', endpoint: 'https://synthetic.invalid/v1/chat/completions', requestShape: 'openai-chat-completions', model: MODEL };
const AT = '2026-10-12T00:00:00.000Z';
const TEXT = '纯粹合成的段落用于验证数据不会进入夹具。';
const blocks = `\n以下为本单元的内容块：\n[${B}] (paragraph) ${TEXT}`;
const body = (message: string): string => canonicalJson({ model: MODEL, messages: [{ role: 'user', content: message }] });

describe('converted capture proof and replay', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'ai7-capture-proof-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function synthetic(message: string | ReadonlyArray<{ role: string; content: string }>, contract = BASELINE_PROMPT_CONTRACT_DIGEST, content = '{"note":"独立合成响应。"}') {
    const requestBody = typeof message === 'string' ? body(message) : canonicalJson({ model: MODEL, messages: message });
    const lastUser = typeof message === 'string' ? message : message.filter((turn) => turn.role === 'user').at(-1)!.content;
    const requestDigest = sha256Hex(requestBody);
    const cacheKey = tool.namespacedCacheKey(NAMESPACE, requestDigest);
    const response = { choices: [{ message: { content } }], usage: { prompt_tokens: 20, completion_tokens: 5 } };
    const usage = { inputTokens: 20, outputTokens: 5 };
    const validation = { family: 'capture-proof', case: 'synthetic', step: 'contract' };
    const taskPromptContractDigest = lastUser.startsWith('AI7 编辑对话') ? contract : BASELINE_PROMPT_CONTRACT_DIGEST;
    const generation = tool.evidenceGeneration(NAMESPACE, contract, taskPromptContractDigest);
    const entry = { ...NAMESPACE, itemId: ITEM, requestBody, requestDigest, cacheKey, generation, evidencePosition: 0, promptContractDigest: contract,
      taskPromptContractDigest, validation, transmittedAt: AT, status: 200, response, usage, responseDigest: sha256Hex(JSON.stringify(response)) };
    const line = { ...NAMESPACE, itemId: ITEM, requestDigest, cacheKey, generation, evidencePosition: 0, promptContractDigest: contract, taskPromptContractDigest,
      validation: { ...validation, decision: 'first-capture', evidence: [], delta: null }, outcome: 'transmitted', status: 200, usage, recordedAt: AT };
    await mkdir(join(root, 'entries'), { recursive: true });
    const path = join(root, 'entries', `${cacheKey}.json`);
    await writeFile(path, JSON.stringify(entry));
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify(line)}\n`);
    return { entry, line, path };
  }

  const generate = () => tool.generateModelFixture({ selector: ITEM, cacheRoot: root, identity: 'converted', description: '合成证据', out: join(root, 'out.json') });

  async function replay(message: string, contract: string): Promise<StreamChunk[]> {
    await writeFile(join(root, 'converted.json'), JSON.stringify(await generate()));
    const fixture = await loadModelFixture(root, 'converted');
    const adapter = new Ai7LocalDeterministicAdapter(fixture, contract, {
      QUOTA_EXCEEDED_CODE: 'QUOTA', INVALID_CREDENTIAL_CODE: 'AUTH', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT',
    });
    const options: GenerateOptions = { provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture',
      messages: [{ id: 'synthetic' as never, role: 'user', content: [{ type: 'text', text: message }], source: { kind: 'user' } }] };
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream(options)) chunks.push(chunk);
    return chunks;
  }

  it('admits an SSE namespace only for dialogue on opencode-go; every other subject keeps the JSON shape', async () => {
    await synthetic(`AI7 编辑对话 · 提问 · 问题摘要 ${D}\n【所选文字】\n合成选区。\n【问题】\n合成问题。`, DIALOGUE_PROMPT_CONTRACT_DIGEST, '合成回答。');
    const document = await generate();
    const entry = (document.entries as Array<{ capture: Record<string, unknown> }>)[0]!;
    const capture = entry.capture;
    const shape = (route: string): void => {
      capture.requestShape = 'editorial-dialogue-sse'; capture.route = route;
      const namespace = { route, endpoint: String(capture.endpoint), requestShape: 'editorial-dialogue-sse', model: String(capture.model) };
      capture.cacheKey = tool.namespacedCacheKey(namespace, String(capture.providerRequestDigest));
      capture.generation = tool.evidenceGeneration(namespace, String(capture.promptContractDigest), String(capture.taskPromptContractDigest));
    };
    shape('opencode-go');
    expect(parseModelFixture(document).entries[0]!.capture?.requestShape).toBe('editorial-dialogue-sse');
    for (const subject of ['unit', 'reduction', 'sampling', 'reflection', 'factual-unit', 'review-unit', 'evaluation-unit', 'readers-unit', 'rewrite-unit', 'writing-unit', 'task-synthesis']) {
      capture.subject = subject;
      expect(() => parseModelFixture(document)).toThrow('夹具条目的捕获路由或形态无效。');
    }
    capture.subject = 'dialogue'; shape('another-route');
    expect(() => parseModelFixture(document)).toThrow('夹具条目的捕获路由或形态无效。');
  });

  it.each([
    ['unit', `分析单元 1/1 · 单元摘要 ${D}`, (c: string) => unitRequestDigest(c, 1, D)],
    ['factual-unit', `事实核查单元 1/1 · 单元摘要 ${D}`, (c: string) => factualReviewRequestDigest(c, 1, D)],
    ['review-unit', `审阅单元 1/1 · 类别 language · 单元摘要 ${D}`, (c: string) => reviewCategoryRequestDigest(c, 'language', 1, D)],
    ['evaluation-unit', `评估单元 1/1 · 单元摘要 ${D}`, (c: string) => initialEvaluationRequestDigest(c, 1, D)],
    ['readers-unit', `审稿意见单元 1/1 · 单元摘要 ${D}`, (c: string) => readersReportRequestDigest(c, 1, D)],
    ['rewrite-unit', `评语重写单元 1/1 · 单元摘要 ${D}`, (c: string) => evaluationRewriteRequestDigest(c, 1, D)],
    ['writing-unit', `写作单元 1/1 · 单元摘要 ${D}`, (c: string) => writingRequestDigest(c, 1, D)],
  ] as const)('converts and replays %s using its owning digest formula', async (subject, header, digest) => {
    const message = `${header}${blocks}`;
    await synthetic(message, BASELINE_PROMPT_CONTRACT_DIGEST, `{"blockId":"${B}","note":"独立响应。"}`);
    const fixture = parseModelFixture(await generate());
    expect(fixture.entries[0]).toMatchObject({ requestDigest: digest(BASELINE_PROMPT_CONTRACT_DIGEST), capture: { subject } });
    const chunks = await replay(message.replace(B, FRESH), BASELINE_PROMPT_CONTRACT_DIGEST);
    expect(chunks.find((chunk) => chunk.type === 'text-delta')).toMatchObject({ text: `{"blockId":"${FRESH}","note":"独立响应。"}` });
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
  });

  it.each([
    [`评估综合 1/1 · 依据摘要 ${D}`, initialEvaluationSynthesisRequestDigest],
    [`审稿意见综合 1/1 · 段落摘要 ${D}`, readersReportSynthesisRequestDigest],
    [`评语重写综合 1/1 · 依据摘要 ${D}`, evaluationRewriteSynthesisRequestDigest],
    [`写作综合 1/1 · 段落摘要 ${D}`, writingSynthesisRequestDigest],
  ] as const)('converts an already supported synthesis: %s', async (header, digest) => {
    await synthetic(header);
    expect(parseModelFixture(await generate()).entries[0]).toMatchObject({ unitOrdinal: 0, requestDigest: digest(BASELINE_PROMPT_CONTRACT_DIGEST, D) });
    expect((await replay(header, BASELINE_PROMPT_CONTRACT_DIGEST)).at(-1)).toMatchObject({ reason: { kind: 'stop' } });
  });

  it('round-trips sampling through the adapter and actual response contract after finding identities change', async () => {
    const message = `保证抽样 1/1 · 单元摘要 ${D} · 抽样摘要 ${D}\n${ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction}${blocks}\n以下为需要复核的发现：\n- [old_finding]（主要）合成发现。`;
    const content = '{"schema":"ai7.analysis.assurance-sampling-result/1","dispositions":[{"ref":"old_finding","disposition":"成立","reason":"独立理由。"}]}';
    await synthetic(message, ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, content);
    const fixture = parseModelFixture(await generate());
    expect(fixture.entries[0]?.requestDigest).toBe(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 1, D, D));
    const chunks = await replay(message.replace('old_finding', 'new_finding'), BASELINE_PROMPT_CONTRACT_DIGEST);
    const delta = chunks.find((chunk) => chunk.type === 'text-delta');
    expect(delta).toMatchObject({ text: content.replace('old_finding', 'new_finding') });
    if (delta?.type === 'text-delta') expect(parseAssuranceSamplingResult(delta.text, { refs: ['new_finding'] }).ok).toBe(true);
  });

  it('preserves sampling reasons while remapping carried block citations and finding references', async () => {
    const overlap = `blk_${'3'.repeat(24)}`;
    const freshOverlap = `blk_${'4'.repeat(24)}`;
    const message = `保证抽样 1/1 · 单元摘要 ${D} · 抽样摘要 ${D}\n${ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction}\n${ASSURANCE_SAMPLING_PROMPT_CONTRACT.overlapHeader}\n[${overlap}] (paragraph) 合成重叠段落。${blocks}\n以下为需要复核的发现：\n- [0]（主要）合成发现。`;
    const content = JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: [
      { ref: '0', disposition: '需降级', reason: `合成理由：${B} 与 ${overlap}，数字 0 保留。` },
    ] });
    await synthetic(message, ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, content);
    const fixture = parseModelFixture(await generate());
    expect(fixture.entries[0]?.capture?.identityMap).toEqual([
      { placeholder: '{{ref:1}}', identity: '0' },
      { placeholder: '{{sample-block:1}}', identity: overlap },
      { placeholder: '{{sample-block:2}}', identity: B },
    ]);
    const changed = message.replace(B, FRESH).replace(overlap, freshOverlap).replace('[0]', '[new_ref]');
    const delta = (await replay(changed, BASELINE_PROMPT_CONTRACT_DIGEST)).find((chunk) => chunk.type === 'text-delta');
    expect(delta).toMatchObject({ text: content.replace('"ref":"0"', '"ref":"new_ref"').replace(B, FRESH).replace(overlap, freshOverlap) });
    if (delta?.type === 'text-delta') expect(parseAssuranceSamplingResult(delta.text, { refs: ['new_ref'] }).ok).toBe(true);
    await synthetic(message, ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, content.replace(B, FRESH));
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
  });

  it('still refuses sampling echoes from source blocks, findings and other carried turns after recognizing the public instruction', async () => {
    const finding = '这是需要保留在受保护扫描内的合成发现。';
    const earlier = '这是之前模型回答里的一段受保护合成文字。';
    const appended = '这是消息末尾追加的一段受保护合成文字。';
    const message = `保证抽样 1/1 · 单元摘要 ${D} · 抽样摘要 ${D}\n${ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction}${blocks}\n以下为需要复核的发现：\n- [0]（主要）${finding}\n${appended}`;
    for (const reason of [TEXT, finding, appended, earlier]) {
      await synthetic([{ role: 'assistant', content: earlier }, { role: 'user', content: message }],
        ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, JSON.stringify({
          schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: [{ ref: '0', disposition: '成立', reason }],
        }));
      await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    }
    // An identical earlier turn is still carried evidence, not the selected message's validated public segment.
    await synthetic([{ role: 'assistant', content: message }, { role: 'user', content: message }],
      ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, '{"schema":"ai7.analysis.assurance-sampling-result/1","dispositions":[]}');
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
  });

  it('replays reduction and reflection from their own contract keys', async () => {
    const reduction = `跨单元归纳 2/2 · 单元集摘要 ${D}\n各单元引用的内容块标识（按首次引用顺序）：\n单元 1：${B}`;
    await synthetic(reduction, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, `{"blockId":"${B}"}`);
    expect(parseModelFixture(await generate()).entries[0]?.requestDigest).toBe(crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, D));
    expect((await replay(reduction.replace(B, FRESH), BASELINE_PROMPT_CONTRACT_DIGEST)).find((chunk) => chunk.type === 'text-delta')).toMatchObject({ text: `{"blockId":"${FRESH}"}` });
    const reflection = `运行反思 run_synthetic · 账目摘要 ${D}\n{"units":1}`;
    await synthetic(reflection, RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST);
    expect(parseModelFixture(await generate()).entries[0]?.requestDigest).toBe(runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, D));
    expect((await replay(reflection, BASELINE_PROMPT_CONTRACT_DIGEST)).at(-1)).toMatchObject({ reason: { kind: 'stop' } });
  });

  it('converts an admitted dialogue header to answer chunks without carrying selected words', async () => {
    const message = `AI7 编辑对话 · 提问 · 问题摘要 ${D}\n【所选文字】\n${TEXT}\n【问题】\n合成问题？`;
    await synthetic(message, DIALOGUE_PROMPT_CONTRACT_DIGEST, '独立的合成回答。');
    expect(parseModelFixture(await generate()).entries[0]).toMatchObject({ requestDigest: dialogueRequestDigest(DIALOGUE_PROMPT_CONTRACT_DIGEST, 'ask', D), response: { kind: 'answer-chunks' } });
    expect((await replay(message, DIALOGUE_PROMPT_CONTRACT_DIGEST)).at(-1)).toMatchObject({ reason: { kind: 'stop' } });
  });

  it('refuses a converted suboperation bound to another enclosing task contract', async () => {
    const message = `运行反思 run_synthetic · 账目摘要 ${D}`;
    await synthetic(message, RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST);
    const chunks = await replay(message, 'f'.repeat(64));
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } });
  });

  it('refuses absent task provenance and a stage mislabeled as the unit contract', async () => {
    const { line } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    await writeFile(join(root, 'ledger.jsonl'), JSON.stringify({ ...line, taskPromptContractDigest: undefined }) + '\n');
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/capture-unproven' });
    await synthetic(`运行反思 run_synthetic · 账目摘要 ${D}`, BASELINE_PROMPT_CONTRACT_DIGEST);
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/contract-mismatch' });
  });

  it('refuses unmapped placeholders and echoes hidden in response keys or earlier user turns', async () => {
    const message = `分析单元 1/1 · 单元摘要 ${D}${blocks}`;
    await synthetic(message, BASELINE_PROMPT_CONTRACT_DIGEST, '{"blockId":"{{block:9}}"}');
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
    await synthetic(message, BASELINE_PROMPT_CONTRACT_DIGEST, JSON.stringify({ [TEXT]: '占位' }));
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    const derivative = '先前传入的合成文字同样不能作为夹具输出复制。';
    await synthetic(`评估综合 1/1 · 依据摘要 ${D}\n${derivative}`, BASELINE_PROMPT_CONTRACT_DIGEST, JSON.stringify({ note: derivative }));
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
  });

  it.each(['response', 'request', 'generation', 'item', 'contract'] as const)('refuses a damaged %s capture before producing a fixture', async (damage) => {
    const { entry, path } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    const damaged = { ...entry, ...(damage === 'response' ? { response: {} } : damage === 'request' ? { requestBody: '{}' }
      : damage === 'generation' ? { generation: 'f'.repeat(64) } : damage === 'item' ? { itemId: 'S40/fixture/9' } : { promptContractDigest: 'f'.repeat(64) }) };
    await writeFile(path, JSON.stringify(damaged));
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/entry-invalid' });
  });

  it('refuses an unproven replay and an invalidation appended after capture despite earlier timestamps', async () => {
    const { line } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify({ ...line, outcome: 'replayed', validation: { evidence: ['S40/fixture/9'] } })}\n`);
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/capture-unproven' });
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify(line)}\n${JSON.stringify({ kind: 'invalidation', target: { family: 'capture-proof', case: 'synthetic' }, reason: 'retired', recordedAt: '2020-01-01T00:00:00Z' })}\n`);
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/item-retired' });
  });

  it('retires a capture by the ledger position its call observed before it was claimed', async () => {
    const { line } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    const invalidation = { kind: 'invalidation', target: { family: 'capture-proof', case: 'synthetic' }, reason: 'sample-edited', recordedAt: AT };
    // Invalidated while in flight: the capture line lands after the invalidation, yet its call had observed an empty ledger.
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify(invalidation)}\n${JSON.stringify(line)}\n`);
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/item-retired' });
    // Claimed after the invalidation: a later generation of the evidence, which converts.
    const { entry, path } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    await writeFile(path, JSON.stringify({ ...entry, evidencePosition: 1 }));
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify(invalidation)}\n${JSON.stringify({ ...line, evidencePosition: 1 })}\n`);
    expect(parseModelFixture(await generate()).entries[0]?.capture?.itemId).toBe(ITEM);
    // A position past the line itself is a damaged ledger.
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify({ ...line, evidencePosition: 1 })}\n`);
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/ledger-unreadable' });
  });

  it('finds a capture a later capture of the same exact request moved aside', async () => {
    const { entry, line, path } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    const later = 'S40/fixture/2';
    await writeFile(path.replace(/\.json$/u, '.superseded-1-synthetic.json'), JSON.stringify(entry));
    await writeFile(path, JSON.stringify({ ...entry, itemId: later, evidencePosition: 1 }));
    await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify(line)}\n${JSON.stringify({ ...line, itemId: later, evidencePosition: 1 })}\n`);
    expect(parseModelFixture(await generate()).entries[0]?.capture).toMatchObject({ itemId: ITEM, selectedItemId: ITEM });
    const current = await tool.generateModelFixture({ selector: later, cacheRoot: root, identity: 'converted', description: '合成证据', out: join(root, 'out.json') });
    expect(parseModelFixture(current).entries[0]?.capture).toMatchObject({ itemId: later });
  });

  it.each(['position', 'entry usage', 'ledger usage', 'status'] as const)('refuses a capture whose %s disagrees between ledger and cache', async (damage) => {
    const { entry, line, path } = await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    if (damage === 'position') await writeFile(path, JSON.stringify({ ...entry, evidencePosition: 3 }));
    if (damage === 'entry usage') await writeFile(path, JSON.stringify({ ...entry, usage: { inputTokens: 1, outputTokens: 1 } }));
    if (damage === 'ledger usage') await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify({ ...line, usage: null })}\n`);
    if (damage === 'status') await writeFile(join(root, 'ledger.jsonl'), `${JSON.stringify({ ...line, outcome: 'failed', status: 500 })}\n`);
    await expect(generate()).rejects.toMatchObject({ code: damage === 'status' ? 'FIXTURE_GEN/capture-unproven' : 'FIXTURE_GEN/entry-invalid' });
  });

  it('refuses a placeholder the model wrote itself and an echo of an earlier model turn', async () => {
    const message = `分析单元 1/1 · 单元摘要 ${D}${blocks}`;
    await synthetic(message, BASELINE_PROMPT_CONTRACT_DIGEST, '{"blockId":"{{block:1}}"}');
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
    const earlier = '先前一轮模型给出的合成结论不能复制进夹具。';
    await synthetic([{ role: 'user', content: message }, { role: 'assistant', content: earlier }, { role: 'user', content: message }],
      BASELINE_PROMPT_CONTRACT_DIGEST, JSON.stringify({ note: earlier }));
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
  });

  it('refuses carried derivative echoes and serialized fixtures damaged after conversion', async () => {
    const derivative = '合成的先前结果段落绝不能被当作原始证据复制。';
    await synthetic(`跨单元归纳 2/2 · 单元集摘要 ${D}\n${derivative}`, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, JSON.stringify({ note: derivative }));
    await expect(generate()).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    await synthetic(`分析单元 1/1 · 单元摘要 ${D}${blocks}`);
    await writeFile(join(root, 'converted.json'), JSON.stringify(await generate()));
    const bytes = await readFile(join(root, 'converted.json'), 'utf8');
    const damaged = JSON.parse(bytes) as { entries: Array<{ response: { text: string } }> };
    damaged.entries[0]!.response.text = '{"changed":true}';
    expect(() => parseModelFixture(damaged)).toThrow(/捕获摘要/u);
  });
});
