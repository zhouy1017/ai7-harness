import { describe, expect, it } from 'vitest';
import {
  MAX_MILESTONE_PURPOSE_CODE_UNITS,
  MILESTONE_PURPOSE_KINDS,
  MILESTONE_PURPOSE_LABELS,
  milestonePurposeKindOf,
  resolveMilestonePurpose,
} from '../../src/shared/protocol.js';

// The purpose of a Milestone Version (Issue #414; IA › Milestone Versions, V2-UX-MILE-003): the four
// frozen purposes and 自行输入, stored as words and read back by kind.

describe('the milestone purposes', () => {
  it('are the four frozen purposes of the information architecture and 自行输入, in that order', () => {
    expect(MILESTONE_PURPOSE_KINDS).toEqual(['stage-archive', 'review-candidate', 'delivery-candidate', 'other', 'custom']);
    expect(MILESTONE_PURPOSE_KINDS.map((kind) => MILESTONE_PURPOSE_LABELS[kind])).toEqual(['阶段留档', '送审候选', '交付候选', '其他', '自行输入']);
  });

  it('read a stored purpose back as its frozen kind by the exact label, and anything else as the editor\'s own words', () => {
    expect(milestonePurposeKindOf('阶段留档')).toBe('stage-archive');
    expect(milestonePurposeKindOf('送审候选')).toBe('review-candidate');
    expect(milestonePurposeKindOf('交付候选')).toBe('delivery-candidate');
    expect(milestonePurposeKindOf('其他')).toBe('other');
    // A row saved before the kinds existed holds free words; they are the editor's own purpose.
    expect(milestonePurposeKindOf('确认结构复核后的状态')).toBe('custom');
    expect(milestonePurposeKindOf('送审候选（二审）')).toBe('custom');
    // 自行输入 names the option, not a purpose: the words 自行输入 are the editor's own.
    expect(milestonePurposeKindOf('自行输入')).toBe('custom');
  });

  it('store a frozen purpose as its own label and refuse words beside it', () => {
    for (const kind of MILESTONE_PURPOSE_KINDS.filter((candidate) => candidate !== 'custom')) {
      expect(resolveMilestonePurpose(kind, null)).toEqual({ kind, purpose: MILESTONE_PURPOSE_LABELS[kind] });
      expect(resolveMilestonePurpose(kind, MILESTONE_PURPOSE_LABELS[kind])).toBeNull();
      expect(resolveMilestonePurpose(kind, '')).toBeNull();
    }
  });

  it('store 自行输入 as the words once normalized and trimmed, and words that are a frozen label as that purpose', () => {
    expect(resolveMilestonePurpose('custom', '  确认结构复核后的状态\n')).toEqual({ kind: 'custom', purpose: '确认结构复核后的状态' });
    expect(resolveMilestonePurpose('custom', ' 送审候选 ')).toEqual({ kind: 'review-candidate', purpose: '送审候选' });
    // NFC: a decomposed character is stored composed, so the same words always compare equal.
    expect(resolveMilestonePurpose('custom', 'Café 稿')).toEqual({ kind: 'custom', purpose: 'Café 稿' });
  });

  it('refuse 自行输入 without words, past its bound, or ill-formed, and any kind that is not a purpose', () => {
    expect(resolveMilestonePurpose('custom', null)).toBeNull();
    expect(resolveMilestonePurpose('custom', '')).toBeNull();
    expect(resolveMilestonePurpose('custom', ' \n\t ')).toBeNull();
    expect(resolveMilestonePurpose('custom', '\uD800')).toBeNull();
    expect(resolveMilestonePurpose('custom', 42)).toBeNull();
    expect(resolveMilestonePurpose('custom', '途'.repeat(MAX_MILESTONE_PURPOSE_CODE_UNITS))).toEqual({
      kind: 'custom',
      purpose: '途'.repeat(MAX_MILESTONE_PURPOSE_CODE_UNITS),
    });
    expect(resolveMilestonePurpose('custom', '途'.repeat(MAX_MILESTONE_PURPOSE_CODE_UNITS + 1))).toBeNull();
    for (const kind of ['final', '阶段留档', 'Custom', '', null, undefined, 3]) {
      expect(resolveMilestonePurpose(kind, null)).toBeNull();
      expect(resolveMilestonePurpose(kind, '确认结构复核后的状态')).toBeNull();
    }
  });
});
