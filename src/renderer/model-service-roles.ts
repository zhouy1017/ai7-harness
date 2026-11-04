import type { ModelConnectionTestStatus } from '../shared/protocol.js';

/**
 * What a route's last text connection test came to, as 设置 › 模型服务 says it on the route and on the Main role: the model by its
 * label; the model id, the failure code and the instant stay one disclosure away (ADR 0096 §3).
 */
export function modelConnectionTestLabel(test: ModelConnectionTestStatus | null | undefined, modelLabel?: string): string {
  if (test == null) return '尚未测试；保存凭据不等于连接成功';
  const model = modelLabel === undefined ? '' : ` · ${modelLabel}`;
  if (test.outcome === 'passed') return `文本连接测试通过${model}`;
  return `文本连接测试${test.outcome === 'outcome-unknown' ? '结果待确认；不会自动重试' : test.outcome === 'cancelled' ? '已取消' : '未通过'}${model}`;
}

/** The test's exact facts behind 查看技术详情, or nothing before a test. */
export function modelConnectionTestDisclosure(test: ModelConnectionTestStatus | null | undefined): HTMLElement[] {
  if (test == null) return [];
  const details = document.createElement('details');
  details.className = 'technical-details';
  const summary = document.createElement('summary');
  summary.textContent = '查看技术详情';
  const list = document.createElement('dl');
  for (const [term, value] of [['测试模型', test.modelId], ['结果代码', test.code ?? '无'], ['测试时间', test.testedAt]] as const) {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.className = 'technical-identity'; dd.textContent = value;
    list.append(dt, dd);
  }
  details.append(summary, list);
  return [details];
}

export const MODEL_CONNECTION_TEST_NOTE = '测试只发送固定公开合成消息，不含图书文字；仅核验缓冲文本，不核验工具或流式。';
