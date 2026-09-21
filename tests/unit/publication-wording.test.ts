import { describe, expect, it } from 'vitest';
import {
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  PUBLICATION_ACTUALS_PROMPT_LABEL,
  PUBLICATION_ACTUALS_PROMPT_STATE,
  PUBLICATION_CHANGE_NOTICE,
  PUBLICATION_EVENT_KINDS,
  PUBLICATION_FORBIDDEN_WORDS,
  PUBLICATION_NEEDS_MANUSCRIPT,
  PUBLICATION_NEEDS_MILESTONE,
  PUBLICATION_VERSION_LABEL,
  PUBLICATION_VERSION_STATEMENT,
  milestoneChangedSinceLabel,
  publicationDesignatedLabel,
  publicationText,
  publicationUnchangedLabel,
} from '../../src/shared/protocol.js';

// The words of ⑥ 发稿 (Issue #414): what the service says a Milestone Version and a Publication Version
// are, so the surface shows exactly what the records mean (V2-UX-MILE-007, PUB-004, PUB-006, PUB-009).

describe('the words of 发稿', () => {
  it('state the fixed sentence, the marks and the notices exactly as the specification words them', () => {
    expect(PUBLICATION_VERSION_STATEMENT).toBe('仅表示此版本可用于上述发稿范围；AI7 不会发布或发送');
    expect(PUBLICATION_VERSION_LABEL).toBe('发稿版本');
    expect(PUBLICATION_CHANGE_NOTICE).toBe('自发稿版本后有修改');
    expect(PUBLICATION_NEEDS_MILESTONE).toBe('先保存里程碑版本');
    expect(PUBLICATION_ACTUALS_PROMPT_LABEL).toBe('录入定价与首印');
    expect(PUBLICATION_ACTUALS_PROMPT_STATE).toBe('随评估功能提供');
    expect(PUBLICATION_EVENT_KINDS).toEqual(['actuals-prompt', 'exemplar-archive']);
  });

  it('name the milestone the manuscript changed after, and the exact version and scope of a designation', () => {
    expect(milestoneChangedSinceLabel('二审稿')).toBe('自「二审稿」后有修改');
    expect(publicationDesignatedLabel('二审稿', 'r3', '纸质版首印')).toBe('已设为发稿版本 · 「二审稿」 · r3 · 纸质版首印');
    expect(publicationUnchangedLabel('二审稿', 'r3', '纸质版首印')).toBe('已是当前发稿版本 · 「二审稿」 · r3 · 纸质版首印');
  });

  it('never word a Publication Version as published, sent, delivered or received', () => {
    expect(PUBLICATION_FORBIDDEN_WORDS).toEqual(['已发布', '已发送', '已交付', '已确认送达']);
    const said = [
      PUBLICATION_VERSION_STATEMENT, PUBLICATION_VERSION_LABEL, PUBLICATION_CHANGE_NOTICE, PUBLICATION_NEEDS_MILESTONE,
      PUBLICATION_NEEDS_MANUSCRIPT, PUBLICATION_ACTUALS_PROMPT_LABEL, PUBLICATION_ACTUALS_PROMPT_STATE,
      milestoneChangedSinceLabel('二审稿'), publicationDesignatedLabel('二审稿', 'r3', '纸质版首印'),
      publicationUnchangedLabel('二审稿', 'r3', '纸质版首印'),
    ].join('\n');
    for (const word of PUBLICATION_FORBIDDEN_WORDS) expect(said.includes(word)).toBe(false);
  });

  it('record 发稿范围 and 依据 normalized and trimmed, counting code points as SQLite counts them', () => {
    expect(publicationText('  纸质版首印\n', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('纸质版首印');
    expect(publicationText('Café', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('Café');
    expect(publicationText('范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS));
    expect(publicationText('范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBeNull();
    // A character outside the Basic Multilingual Plane is one character, though two code units.
    expect(publicationText('𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS));
    expect(publicationText('𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBeNull();
    expect(publicationText('据'.repeat(MAX_PUBLICATION_BASIS_CHARACTERS), MAX_PUBLICATION_BASIS_CHARACTERS)).toHaveLength(MAX_PUBLICATION_BASIS_CHARACTERS);
    for (const value of ['', '   ', '\n\t', '\uD800', 42, null, undefined]) {
      expect(publicationText(value, MAX_PUBLICATION_BASIS_CHARACTERS)).toBeNull();
    }
  });
});
