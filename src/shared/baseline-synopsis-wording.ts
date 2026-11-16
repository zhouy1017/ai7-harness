import type { FrozenBaselineSynopsisContext } from './protocol/baseline-synopsis.js';
import { reviewSynthesisOrdinalRanges } from './review-synthesis-wording.js';

/** Same 会发送 sentence in a read-only preview and its frozen plan; absence changes no words. */
export function baselineSynopsisSent(context?: FrozenBaselineSynopsisContext, unavailable?: 'damaged-baseline'): string {
  if (unavailable !== undefined) return '；已有基线分析的分章概述记录无法读取，本次不参考这些概述，仍按原有资料继续';
  if (context === undefined) return '';
  const missing = context.missingUnitOrdinals.length === 0 ? '' : `；缺少第 ${reviewSynthesisOrdinalRanges(context.missingUnitOrdinals)} 范围`;
  const omitted = context.omittedUnitOrdinals.length === 0 ? '' : `；容量所限省略第 ${reviewSynthesisOrdinalRanges(context.omittedUnitOrdinals)} 范围`;
  return `；全书综合的请求有余量时，才附送本次稿件版本的基线分章概述（最多 200 条，每条最多 400 字；发送时可能进一步均匀节选、略去末尾范围或全部不附送；附送的资料会注明实际缺失、节选和省略${missing}${omitted}），不增加稿件正文`;
}

export function baselineSynopsisTechnical(context?: FrozenBaselineSynopsisContext, unavailable?: 'damaged-baseline'): Array<{ key: string; label: string; value: string }> {
  if (unavailable !== undefined) return [{ key: 'baseline-synopsis-unavailable', label: '基线分章概述未附送', value: unavailable }];
  return context === undefined ? [] : [{ key: 'baseline-synopsis-capacity', label: '基线分章概述容量',
    value: `supplement=${context.maximumSupplementBytes} UTF-8 bytes; remaining-message=${context.maximumMessageBytes === null ? 'unregistered' : context.maximumMessageBytes}` }];
}
