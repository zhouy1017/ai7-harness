import type { FrozenBaselineSynopsisContext } from './protocol/baseline-synopsis.js';
import { reviewSynthesisOrdinalRanges } from './review-synthesis-wording.js';

/** Same 会发送 sentence in a read-only preview and its frozen plan; absence changes no words. */
export function baselineSynopsisSent(context?: FrozenBaselineSynopsisContext): string {
  if (context === undefined) return '';
  const missing = context.missingUnitOrdinals.length === 0 ? '' : `；缺少第 ${reviewSynthesisOrdinalRanges(context.missingUnitOrdinals)} 范围`;
  const omitted = context.omittedUnitOrdinals.length === 0 ? '' : `；容量所限省略第 ${reviewSynthesisOrdinalRanges(context.omittedUnitOrdinals)} 范围`;
  return `；只在全书综合时另参考本次稿件版本的基线分章概述（最多 200 条，每条最多 400 字；必要时均匀节选后省略末尾范围，缺失、节选和省略会注明${missing}${omitted}），不增加稿件正文`;
}

export function baselineSynopsisTechnical(context?: FrozenBaselineSynopsisContext): Array<{ key: string; label: string; value: string }> {
  return context === undefined ? [] : [{ key: 'baseline-synopsis-capacity', label: '基线分章概述容量',
    value: `supplement=${context.maximumSupplementBytes} UTF-8 bytes; remaining-message=${context.maximumMessageBytes === null ? 'unregistered' : context.maximumMessageBytes}` }];
}
