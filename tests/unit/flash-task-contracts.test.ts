import { describe, expect, it } from 'vitest';
import { guidelineClauses, queryExpansion, retrievalRerank, standardsTable } from '../../src/service/fast-role/flash-task-contract.js';
import { FLASH_TASK_REGISTRY } from '../../src/service/fast-role/flash-task-registry.js';
import { UnderlyingFlashService } from '../../src/service/fast-role/fast-role-execution.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';

describe('underlying Flash contracts', () => {
  it('binds every kind to its own prompt digest and bounded one-shot request', () => {
    const contracts = Object.values(FLASH_TASK_REGISTRY);
    expect(new Set(contracts.map(task => task.promptContractDigest)).size).toBe(contracts.length);
    for (const [kind, contract] of Object.entries(FLASH_TASK_REGISTRY)) {
      expect(contract.kindId).toBe(kind);
      expect(contract.role).toBe('underlying-flash');
      expect(contract.budget.maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it('preserves the local query and pinned ordering offline and rejects foreign or duplicate results', async () => {
    const service = new UnderlyingFlashService({ fixture: null, live: null, requestGovernor: new ModelRequestGovernor() });
    const source = { query: '书目', candidates: [{ id: 'c1', preview: '书目说明' }, { id: 'c2', preview: '目录' }] };
    expect(await service.execute(queryExpansion, source.query, 'query')).toMatchObject({ state: 'fallback', value: ['书目'] });
    expect(await service.execute(retrievalRerank, source, 'rank')).toMatchObject({ state: 'fallback', value: ['c1','c2'] });
    expect(retrievalRerank.validateAndTrace('["c2"]', source)).toEqual(['c2']);
    expect(retrievalRerank.validateAndTrace('["c2","c2"]', source)).toBeNull();
    expect(retrievalRerank.validateAndTrace('["other"]', source)).toBeNull();
    expect(queryExpansion.validateAndTrace('["书单","目录","书目索引"]', source.query)).toHaveLength(3);
    expect(queryExpansion.validateAndTrace('["书单"]', source.query)).toBeNull();
    service.dispose();
  });

  it('holds invented forms at the cited paragraph and preserves all guideline words in source order', () => {
    const source = ['甲：乙、丙', '丁'];
    const row = { paragraph: 1, recommended: '甲', discouraged: ['乙','丙'] };
    expect(standardsTable.validateAndTrace(JSON.stringify([row, { ...row, paragraph: 2 }]), source)).toMatchObject([
      { ...row, status: '待确认' }, { recommended: '', discouraged: [], status: '未识别' }]);
    expect(guidelineClauses.validateAndTrace(JSON.stringify(source), source)).toEqual(source);
    expect(guidelineClauses.validateAndTrace('["丁"]', source)).toBeNull();
    expect(guidelineClauses.validateAndTrace('["甲：乙、丙","添加"]', source)).toBeNull();
  });
});
