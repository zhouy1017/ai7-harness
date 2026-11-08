import type { MilestonePurposeKind } from '../shared/protocol.js';

/** Issue #1410 item 21: 保存里程碑版本 begins at 阶段留档, and an empty 标签 saves under a generated name. */
export const DEFAULT_MILESTONE_PURPOSE: MilestonePurposeKind = 'stage-archive';

/** 「阶段留档 · 2026-11-08 14:05」: the purpose's words and the local minute; the service still bounds the label to 80. */
export function defaultMilestoneLabel(purposeWords: string, at: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
  return `${purposeWords} · ${stamp}`.slice(0, 80);
}
