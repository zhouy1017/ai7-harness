import { MODEL_SERVICE_ROUTE_BINDINGS, type ProcessingIndicatorProjection } from '../shared/protocol.js';
import type { GlobalAttentionReader } from './global-attention.js';

/**
 * The context header's live processing indicator (ADR 0096 §3; Issue #1177), in place of the static 「本地处理 · 未联网」: what
 * the execution state says now — 本地处理 when nothing is sent, 正在发送至〈渠道〉 while a request is in the transport, 等待网络
 * during a Connectivity Wait for the network. It names the channel by its route, never a model or a credential.
 */
export function processingIndicatorLabel(processing: ProcessingIndicatorProjection): string {
  if (processing.state === 'sending') {
    return `正在发送至${processing.channels.map((route) => MODEL_SERVICE_ROUTE_BINDINGS[route].providerLabel).join('、')}`;
  }
  return processing.state === 'waiting-network' ? '等待网络' : '本地处理';
}

/**
 * Paints the indicator from 待我处理's one window-wide reader, at its cadence. Until a read answers, and while reads fail, the
 * indicator says nothing: it never claims a state it cannot vouch for.
 */
export function mountProcessingIndicator(node: HTMLElement, reader: GlobalAttentionReader): void {
  reader.subscribe((reading) => {
    if (reading.kind !== 'projection') {
      node.hidden = true;
      return;
    }
    const label = processingIndicatorLabel(reading.projection.processing);
    node.dataset['processingState'] = reading.projection.processing.state;
    node.setAttribute('aria-label', `处理方式：${label}`);
    node.textContent = label;
    node.hidden = false;
  });
}
