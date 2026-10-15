import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseModelFixture } from '../../src/service/provider/model-fixture.js';
import { providerEvidenceGeneration } from '../../src/service/provider/provider-result-cache.js';
import { clarificationPromptContractDigest } from '../../src/service/provider/clarification-contract.js';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

// ---- The fixture loader and the v14 model-question synthesis (Issue #812, the named one-line exception) ------------------------
//
// Under a v14 rule a book-level synthesis runs under its base contract inside a Task whose contract is that base wrapped with the
// model-question instruction. The loader admits exactly that pairing for a synthesis capture; any other difference, and the same
// pairing on a unit, still refuses with its existing words.
describe('the fixture loader', () => {
  it('admits a synthesis captured under its base contract inside the wrapped Task, and nothing looser', async () => {
    const recorded = JSON.parse(await readFile(join(ROOT, 'tests', 'fixtures', 'model', 'sample1-recorded-v41-evaluation-initial.json'), 'utf8')) as { entries: Array<{ capture: Record<string, unknown> }> };
    const withTask = (entry: { capture: Record<string, unknown> }, task: string) => {
      const capture = entry.capture as { route: string; endpoint: string; requestShape: string; model: string; promptContractDigest: string };
      const namespace = { route: capture.route, endpoint: capture.endpoint, requestShape: capture.requestShape, model: capture.model };
      return { ...entry, capture: { ...entry.capture, taskPromptContractDigest: task, generation: providerEvidenceGeneration(namespace, capture.promptContractDigest, task) } };
    };
    const synthesis = recorded.entries.find((entry) => entry.capture.subject === 'task-synthesis')!;
    const unit = recorded.entries.find((entry) => entry.capture.subject === 'evaluation-unit')!;
    const base = synthesis.capture.promptContractDigest as string;
    expect(() => parseModelFixture({ ...recorded, entries: [synthesis] })).not.toThrow();
    expect(() => parseModelFixture({ ...recorded, entries: [withTask(synthesis, clarificationPromptContractDigest(base))] })).not.toThrow();
    expect(() => parseModelFixture({ ...recorded, entries: [withTask(synthesis, 'ab'.repeat(32))] })).toThrow('夹具条目的任务与阶段契约不一致。');
    const unitBase = unit.capture.promptContractDigest as string;
    expect(() => parseModelFixture({ ...recorded, entries: [withTask(unit, clarificationPromptContractDigest(unitBase))] })).toThrow('夹具条目的任务与阶段契约不一致。');
  });
});
