import { technicalDisclosure, technicalLayerVisible, technicalWords } from './technical-layer.js';
import type { ModelConnectionTestStatus } from '../shared/protocol.js';

/** Editor-facing guidance; exact codes remain in the existing technical disclosure. */
export function modelConnectionTestFeedback(test: ModelConnectionTestStatus | null, channelLabel: string, modelLabel: string): {
  message: string; tone?: 'success' | 'error';
} {
  const target = `${channelLabel} / ${modelLabel}`;
  if (test?.outcome === 'passed') return { message: `连接测试通过 · ${target}`, tone: 'success' };
  if (test?.outcome === 'cancelled') return { message: `连接测试已取消 · ${target}` };
  if (test === null || test.outcome === 'outcome-unknown') {
    return { message: `结果待确认 · ${target}；没有收到完整测试结果，不会自动重试。`, tone: 'error' };
  }
  const guidance: Readonly<Record<string, string>> = {
    INVALID_CREDENTIAL: technicalWords('凭据被拒绝，请检查 API key。', '密钥无效，请重新填写。'),
    MODEL_SERVICE_UNREACHABLE: '模型服务不可达，请检查网络或网络代理。',
    AI7_PROXY_UNREACHABLE: '代理不可达，请检查网络或网络代理。',
    TRANSPORT_FAILED: '连接未完成，请检查网络或网络代理。',
    // The current service also uses INVALID_RESPONSE for a model-not-found HTTP response.
    INVALID_RESPONSE: technicalWords('模型服务未返回有效结果，请检查模型 ID 是否正确及渠道是否支持该模型。', '所选模型不可用，请重新选择。'),
  };
  return { message: `连接测试未通过 · ${guidance[test.code ?? ''] ?? technicalWords('请检查渠道设置与模型 ID，并查看测试详情。', '请检查渠道设置与所选模型。')} · ${target}`, tone: 'error' };
}

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
  if (test == null || !technicalLayerVisible) return [];
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
  return [technicalDisclosure(details)];
}

export const MODEL_CONNECTION_TEST_NOTE = '测试只发送固定公开合成消息，不含图书文字；仅核验缓冲文本，不核验工具或流式。';
