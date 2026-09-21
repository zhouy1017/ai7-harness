import { describe, expect, it } from 'vitest';
import {
  DELIVERABLES_DESTINATION_ACTIONS,
  DELIVERABLES_ENTRY_LABEL,
  DELIVERABLES_LEDE,
  DELIVERABLES_PUBLICATION_HEADING,
  DELIVERABLES_SECTION_LABEL,
  DELIVERABLES_STATUS_LINES,
  DELIVERABLES_TECHNICAL_TERMS,
  DELIVERABLES_UNAVAILABLE,
  MILESTONE_CURRENT_RELATION,
  MILESTONE_FORM_WORDS,
  MILESTONE_LIST_EMPTY,
  MILESTONE_LIST_HEADING,
  MILESTONE_PURPOSE_NOTE,
  PUBLICATION_ACTION_LABELS,
  PUBLICATION_ACTOR,
  PUBLICATION_BASIS_HINT,
  PUBLICATION_BASIS_LABEL,
  PUBLICATION_CURRENT_MARK,
  PUBLICATION_FORM_HEADING,
  PUBLICATION_HISTORY_EMPTY,
  PUBLICATION_HISTORY_HEADING,
  PUBLICATION_MILESTONE_LEGEND,
  PUBLICATION_SCOPE_HINT,
  PUBLICATION_SCOPE_LABEL,
  PUBLICATION_SUMMARY_TERMS,
  PUBLICATION_SUMMARY_TIME,
  PUBLICATION_SUMMARY_UNCHOSEN,
  deliverablesManuscriptLine,
  deliverablesOverviewLine,
  milestoneFormBlockers,
  milestoneLabelText,
  milestoneMetaLine,
  milestoneNoteLine,
  milestoneRelationLine,
  milestoneSaveReason,
  milestonesTruncatedLine,
  publicationActualsPromptLine,
  publicationBasisLine,
  publicationChangeNoticeDetail,
  publicationCharacterCount,
  publicationCountLine,
  publicationDesignateBlockers,
  publicationDesignateReason,
  publicationEventsLine,
  publicationFieldProblem,
  publicationMilestoneOptionLine,
  publicationRecordedLine,
  publicationScopeLine,
  publicationStateOf,
  publicationSummaryManuscript,
  publicationSummaryMilestone,
  publicationTextState,
  publicationVersionHeading,
  publicationsTruncatedLine,
} from '../../src/renderer/deliverables-labels.js';
import {
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  MILESTONE_PURPOSE_KINDS,
  PUBLICATION_ACTUALS_PROMPT_LABEL,
  PUBLICATION_ACTUALS_PROMPT_STATE,
  PUBLICATION_CHANGE_NOTICE,
  PUBLICATION_FORBIDDEN_WORDS,
  PUBLICATION_NEEDS_MILESTONE,
  PUBLICATION_VERSION_LABEL,
  PUBLICATION_VERSION_STATEMENT,
  milestoneChangedSinceLabel,
  publicationText,
  type DeliverablesProjection,
  type MilestoneListItemProjection,
  type PublicationVersionProjection,
} from '../../src/shared/protocol.js';

// Unit suite for the words of ⑥ 交付物 and the milestone form (Issue #414; editor-surfaces §9, V2-UX-MILE-003,
// MILE-008, PUB-002 to PUB-009). Every string is compared byte for byte, so a wording change is a decision
// made here and never a drift noticed in a Journey. Instants arrive formatted, so nothing here depends on
// the host's time zone.

const SAVED_AT = '2026/09/22 10:00:00';
const identity = '00000000-0000-4000-8000-000000000000';

function milestone(overrides: Partial<MilestoneListItemProjection> = {}): MilestoneListItemProjection {
  return {
    milestoneId: identity,
    label: '一审稿',
    purposeKind: 'stage-archive',
    purposeLabel: '阶段留档',
    revisionId: identity,
    revisionLabel: 'r1',
    actor: '本机编辑',
    createdAt: '2026-09-22T02:00:00.000Z',
    note: null,
    changedSince: false,
    changedSinceLabel: null,
    designation: null,
    technical: { signoffRecordId: identity },
    ...overrides,
  };
}

function designation(overrides: Partial<PublicationVersionProjection> = {}): PublicationVersionProjection {
  return {
    publicationVersionId: identity,
    ordinal: 1,
    current: true,
    milestoneId: identity,
    milestoneLabel: '二审稿',
    revisionId: identity,
    revisionLabel: 'r2',
    scope: '纸质版首印',
    basis: '三审通过，社里同意付印。',
    actor: '本机编辑',
    createdAt: '2026-09-22T03:00:00.000Z',
    technical: {
      revisionDigest: 'a'.repeat(64),
      digest: 'b'.repeat(64),
      permissionId: identity,
      events: [{ eventId: 'e1', kind: 'actuals-prompt' }, { eventId: 'e2', kind: 'exemplar-archive' }],
    },
    ...overrides,
  };
}

const manuscript = { manuscriptId: identity, branchId: identity, revisionId: identity, revisionLabel: 'r3', journalSequence: 4, workingDigest: 'c'.repeat(64) };

function deliverables(publication: Partial<DeliverablesProjection['publication']>, withManuscript = true): DeliverablesProjection {
  return {
    bookId: identity,
    bookTitle: '发稿组稿',
    manuscript: withManuscript ? manuscript : null,
    publication: {
      milestones: [],
      milestonesTruncated: false,
      designations: [],
      designationsTruncated: false,
      changeNotice: null,
      designate: { available: false, unavailableReason: PUBLICATION_NEEDS_MILESTONE },
      statement: PUBLICATION_VERSION_STATEMENT,
      actualsPrompt: null,
      ...publication,
    },
  };
}

describe('the words of 交付物', () => {
  it('name the destination, its block, its lists and its actions as the specification words them', () => {
    expect(DELIVERABLES_SECTION_LABEL).toBe('工作 · 交付物');
    expect(DELIVERABLES_ENTRY_LABEL).toBe('交付物');
    expect(DELIVERABLES_PUBLICATION_HEADING).toBe('发稿 · 稿件');
    expect(DELIVERABLES_DESTINATION_ACTIONS).toEqual(['打开稿件', '工作概览']);
    expect(MILESTONE_LIST_HEADING).toBe('里程碑版本');
    expect(PUBLICATION_HISTORY_HEADING).toBe('设为发稿版本的记录');
    expect(PUBLICATION_ACTION_LABELS).toEqual({ designate: '设为发稿版本…', confirm: '设为发稿版本', cancel: '取消', open: '打开交付物' });
    expect(PUBLICATION_FORM_HEADING).toBe('设为发稿版本');
    expect(PUBLICATION_MILESTONE_LEGEND).toBe('选择里程碑版本');
    expect([PUBLICATION_SCOPE_LABEL, PUBLICATION_BASIS_LABEL]).toEqual(['发稿范围', '依据']);
    expect(PUBLICATION_SUMMARY_TERMS).toEqual(['图书', '稿件', '里程碑版本', '与当前稿件', '操作人', '时间']);
    expect(PUBLICATION_SUMMARY_UNCHOSEN).toBe('先选择一个里程碑版本');
    expect(PUBLICATION_SUMMARY_TIME).toBe('确认时记录');
    expect(PUBLICATION_ACTOR).toBe('本机编辑');
    expect(PUBLICATION_CURRENT_MARK).toBe('当前发稿版本');
    expect(MILESTONE_CURRENT_RELATION).toBe('与当前稿件一致');
  });

  it('list a milestone by label, purpose, exact version, actor, time and note, and its relation to the manuscript', () => {
    expect(milestoneLabelText('一审稿')).toBe('「一审稿」');
    expect(milestoneMetaLine(milestone(), SAVED_AT)).toBe('用途：阶段留档 · 修订版 r1 · 本机编辑 · 2026/09/22 10:00:00');
    // 自行输入 reads as the editor's own words.
    expect(milestoneMetaLine(milestone({ purposeKind: 'custom', purposeLabel: '送审前自查', revisionLabel: 'r2' }), SAVED_AT))
      .toBe('用途：送审前自查 · 修订版 r2 · 本机编辑 · 2026/09/22 10:00:00');
    expect(milestoneNoteLine('一审完成后留档')).toBe('说明：一审完成后留档');
    expect(milestoneRelationLine(milestone())).toBe('与当前稿件一致');
    expect(milestoneRelationLine(milestone({ changedSince: true, changedSinceLabel: milestoneChangedSinceLabel('一审稿') }))).toBe('自「一审稿」后有修改');
    expect(milestonesTruncatedLine(100)).toBe('这里列出最近的 100 个里程碑版本；更早的仍然保留，也仍可设为发稿版本。');
  });

  it('record each designation with its exact milestone, version, scope, basis, actor and time', () => {
    expect(publicationVersionHeading(designation())).toBe('第 1 次设为发稿版本 · 「二审稿」 · r2');
    expect(publicationScopeLine('纸质版首印')).toBe('发稿范围：纸质版首印');
    expect(publicationBasisLine('三审通过，社里同意付印。')).toBe('依据：三审通过，社里同意付印。');
    expect(publicationRecordedLine('本机编辑', SAVED_AT)).toBe('本机编辑 · 2026/09/22 10:00:00');
    expect(publicationsTruncatedLine(30)).toBe('这里列出最近的 30 次；更早的记录仍然保留。');
    expect(publicationEventsLine(designation().technical.events)).toBe('actuals-prompt · e1；exemplar-archive · e2');
  });

  it('state the change notice with its exact relationship, and the pending actuals line with no action', () => {
    expect(publicationChangeNoticeDetail({ label: PUBLICATION_CHANGE_NOTICE, publicationVersionId: identity, revisionLabel: 'r2' }))
      .toBe('发稿版本定在 r2，稿件此后有修改。这一版保持不变；需要时先保存新的里程碑版本，再另设发稿版本。');
    expect(publicationActualsPromptLine({ label: PUBLICATION_ACTUALS_PROMPT_LABEL, stateLabel: PUBLICATION_ACTUALS_PROMPT_STATE }))
      .toBe('录入定价与首印 · 随评估功能提供');
  });

  it('read the manuscript and the chosen milestone into the form summary before commitment', () => {
    expect(deliverablesManuscriptLine(null)).toBe('这本书还没有稿件；导入稿件后才能保存里程碑版本。');
    expect(deliverablesManuscriptLine(manuscript)).toBe('当前稿件：修订版 r3 · 修订日志序号 4');
    expect(publicationSummaryManuscript(manuscript)).toBe('主稿件 · 当前修订版 r3 · 修订日志序号 4');
    expect(publicationSummaryMilestone(milestone(), SAVED_AT)).toBe('「一审稿」 · r1 · 2026/09/22 10:00:00 保存');
    expect(publicationMilestoneOptionLine(milestone(), SAVED_AT)).toBe('用途：阶段留档 · 修订版 r1 · 2026/09/22 10:00:00 保存');
  });
});

describe('发稿范围 and 依据 in the form', () => {
  it('judge a field exactly as the service records it, counting characters and never UTF-16 units', () => {
    const samples = [
      '', '   ', '\n\t', '纸质版首印', '  纸质版首印\n', 'Café', 'Café',
      '范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), '范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1),
      '𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), '𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1),
      ` ${'范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS)} `, '\uD800', `据${'\uDC00'}`,
    ];
    for (const maximum of [MAX_PUBLICATION_SCOPE_CHARACTERS, MAX_PUBLICATION_BASIS_CHARACTERS]) {
      for (const sample of samples) {
        expect(publicationTextState(sample, maximum) === 'ready').toBe(publicationText(sample, maximum) !== null);
      }
    }
    // Eighty characters outside the Basic Multilingual Plane are 160 UTF-16 units and still within the bound.
    expect(publicationCharacterCount('𠀀'.repeat(80))).toBe(80);
    expect(publicationTextState('𠀀'.repeat(80), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('ready');
    expect(publicationTextState('', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('empty');
    expect(publicationTextState(' \n ', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('empty');
    expect(publicationTextState('范'.repeat(81), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('too-long');
    expect(publicationTextState('\uD800', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('ill-formed');
  });

  it('count what is written, and name a problem only when a field cannot be recorded', () => {
    expect(publicationCountLine('  纸质版首印 ', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('5 / 80 个字符');
    expect(publicationCountLine('', MAX_PUBLICATION_BASIS_CHARACTERS)).toBe('0 / 500 个字符');
    expect(publicationFieldProblem('发稿范围', '', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBeNull();
    expect(publicationFieldProblem('发稿范围', '纸质版首印', MAX_PUBLICATION_SCOPE_CHARACTERS)).toBeNull();
    expect(publicationFieldProblem('发稿范围', '范'.repeat(81), MAX_PUBLICATION_SCOPE_CHARACTERS)).toBe('发稿范围最多 80 个字符，现在 81 个。');
    expect(publicationFieldProblem('依据', '据'.repeat(501), MAX_PUBLICATION_BASIS_CHARACTERS)).toBe('依据最多 500 个字符，现在 501 个。');
    expect(publicationFieldProblem('依据', '\uD800', MAX_PUBLICATION_BASIS_CHARACTERS)).toBe('依据含有无法保存的字符。');
  });

  it('keep 设为发稿版本 unavailable until a milestone is chosen and both fields can be recorded, and say why', () => {
    expect(publicationDesignateBlockers({ milestoneChosen: false, scope: '', basis: '' })).toEqual(['选择一个里程碑版本', '填写发稿范围', '填写依据']);
    expect(publicationDesignateReason(publicationDesignateBlockers({ milestoneChosen: false, scope: '', basis: '' })))
      .toBe('还需要选择一个里程碑版本、填写发稿范围、填写依据。');
    expect(publicationDesignateBlockers({ milestoneChosen: true, scope: '范'.repeat(81), basis: '依据' })).toEqual(['把发稿范围缩短到 80 个字符以内']);
    expect(publicationDesignateBlockers({ milestoneChosen: true, scope: '纸质版首印', basis: '\uD800' })).toEqual(['去掉依据中无法保存的字符']);
    expect(publicationDesignateBlockers({ milestoneChosen: true, scope: '𠀀'.repeat(80), basis: '三审通过' })).toEqual([]);
    expect(publicationDesignateReason([])).toBeNull();
  });
});

describe('where 发稿 stands, in the block and on 工作概览', () => {
  it('name the four states and read them as one line with no percentage', () => {
    const none = deliverables({}, false);
    const empty = deliverables({});
    const listed = deliverables({ milestones: [milestone(), milestone()], designate: { available: true, unavailableReason: null } });
    const designated = deliverables({
      milestones: [milestone({ designation: { publicationVersionId: identity, label: PUBLICATION_VERSION_LABEL } }), milestone()],
      designations: [designation({ ordinal: 2 }), designation({ ordinal: 1, current: false, milestoneLabel: '一审稿', revisionLabel: 'r1' })],
      designate: { available: true, unavailableReason: null },
    });
    const changed = { ...designated, publication: { ...designated.publication, changeNotice: { label: PUBLICATION_CHANGE_NOTICE, publicationVersionId: identity, revisionLabel: 'r2' } } };
    const truncated = { ...listed, publication: { ...listed.publication, milestonesTruncated: true } };
    expect([none, empty, listed, designated].map(publicationStateOf)).toEqual(['no-manuscript', 'no-milestone', 'undesignated', 'designated']);
    expect(deliverablesOverviewLine(none)).toBe('发稿 · 这本书还没有稿件');
    expect(deliverablesOverviewLine(empty)).toBe('发稿 · 还没有里程碑版本 · 还没有设为发稿版本');
    expect(deliverablesOverviewLine(listed)).toBe('发稿 · 里程碑版本 2 个 · 还没有设为发稿版本');
    expect(deliverablesOverviewLine(truncated)).toBe('发稿 · 里程碑版本 2 个以上 · 还没有设为发稿版本');
    expect(deliverablesOverviewLine(designated)).toBe('发稿 · 里程碑版本 2 个 · 发稿版本「二审稿」 · r2 · 纸质版首印');
    expect(deliverablesOverviewLine(changed)).toBe('发稿 · 里程碑版本 2 个 · 发稿版本「二审稿」 · r2 · 纸质版首印 · 自发稿版本后有修改');
    expect(deliverablesOverviewLine(changed)).not.toMatch(/%/);
  });
});

describe('the milestone form', () => {
  it('ask for 标签, 用途 and an optional 说明, and submit as 保存里程碑版本', () => {
    expect(MILESTONE_FORM_WORDS).toEqual({
      summary: '保存为里程碑版本',
      label: '标签',
      purpose: '用途',
      customPurpose: '自行输入的用途',
      note: '说明（可选）',
      save: '保存里程碑版本',
    });
    expect(MILESTONE_PURPOSE_NOTE).toBe('用途只说明这一版接下来打算做什么；选「交付候选」不会导出，也不会设为发稿版本。');
  });

  it('keep 保存里程碑版本 unavailable until a label and a purpose are given, and say why', () => {
    expect(milestoneFormBlockers({ label: '', purposeKind: null, customWords: '' })).toEqual(['填写标签', '选择用途']);
    expect(milestoneFormBlockers({ label: '一审稿', purposeKind: null, customWords: '' })).toEqual(['选择用途']);
    expect(milestoneFormBlockers({ label: '  ', purposeKind: 'stage-archive', customWords: '' })).toEqual(['填写标签']);
    expect(milestoneFormBlockers({ label: '一审稿', purposeKind: 'custom', customWords: ' ' })).toEqual(['写下自行输入的用途']);
    for (const kind of MILESTONE_PURPOSE_KINDS.filter((candidate) => candidate !== 'custom')) {
      expect(milestoneFormBlockers({ label: '一审稿', purposeKind: kind, customWords: '' })).toEqual([]);
    }
    expect(milestoneFormBlockers({ label: '一审稿', purposeKind: 'custom', customWords: '送审前自查' })).toEqual([]);
    expect(milestoneSaveReason(['填写标签', '选择用途'])).toBe('还需要填写标签、选择用途，才能保存里程碑版本。');
    expect(milestoneSaveReason([])).toBeNull();
  });
});

describe('what 交付物 never says', () => {
  it('words no Publication Version as published, sent, delivered or received (V2-UX-PUB-009)', () => {
    const said = [
      DELIVERABLES_SECTION_LABEL, DELIVERABLES_ENTRY_LABEL, DELIVERABLES_LEDE, DELIVERABLES_PUBLICATION_HEADING, DELIVERABLES_UNAVAILABLE,
      ...DELIVERABLES_DESTINATION_ACTIONS, MILESTONE_LIST_HEADING, MILESTONE_LIST_EMPTY, PUBLICATION_HISTORY_HEADING, PUBLICATION_HISTORY_EMPTY,
      PUBLICATION_CURRENT_MARK, ...Object.values(PUBLICATION_ACTION_LABELS), PUBLICATION_FORM_HEADING, PUBLICATION_MILESTONE_LEGEND,
      PUBLICATION_SCOPE_LABEL, PUBLICATION_BASIS_LABEL, PUBLICATION_SCOPE_HINT, PUBLICATION_BASIS_HINT, ...PUBLICATION_SUMMARY_TERMS,
      PUBLICATION_SUMMARY_UNCHOSEN, PUBLICATION_SUMMARY_TIME, ...Object.values(DELIVERABLES_TECHNICAL_TERMS), ...Object.values(DELIVERABLES_STATUS_LINES),
      ...Object.values(MILESTONE_FORM_WORDS), MILESTONE_PURPOSE_NOTE,
      milestoneMetaLine(milestone(), SAVED_AT), publicationVersionHeading(designation()),
      publicationChangeNoticeDetail({ label: PUBLICATION_CHANGE_NOTICE, publicationVersionId: identity, revisionLabel: 'r2' }),
      deliverablesOverviewLine(deliverables({ designations: [designation()], milestones: [milestone()] })),
      publicationDesignateReason(publicationDesignateBlockers({ milestoneChosen: false, scope: '', basis: '' })) ?? '',
      milestoneSaveReason(['填写标签', '选择用途']) ?? '',
    ].join('\n');
    for (const word of PUBLICATION_FORBIDDEN_WORDS) expect(said.includes(word)).toBe(false);
    // The internal Public Release Permission and the Signoff Record are never named in ordinary words.
    expect(said.includes('签发')).toBe(false);
  });
});
