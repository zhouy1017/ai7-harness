// The Agent 工作区's words (Issue #90, wave 13 slice 13a; UI ADR 0015; V2-UX-AGENT-001 to 004, COPY-007): what the screen says
// about where it is, what it may do, the one journey it offers and what each action leaves behind. The safety state itself
// is the capability declaration's own line, read from the service, never written here.

import { technicalWords } from './technical-layer.js';

// Ordinary mode reads AI 协作 and 修改建议 (Issue #1431 item 32): the proposal-set lifecycle is developer wording.
export const AGENT_WORKSPACE_WORDS = Object.freeze({
  get heading() { return technicalWords('Agent 工作区', 'AI 协作'); },
  get lede() { return technicalWords('就所选稿件范围提出修改。提议先列在这里；提交后成为修改建议，是否采纳和应用由你在每张修改建议卡上决定。',
    '选择稿件范围并写下修改要求，AI 生成的修改建议会直接放到稿件上，由你逐条决定。'); },
  safety: '修改方式',
  back: '返回',
  pick: '选择文字或点选整段',
  pickNote: '可跨段落选择文字；只点一下某段则选中整段。',
  previousPage: '上一页',
  nextPage: '下一页',
  noSelection: '尚未选择文字。',
  selected: '所选文字',
  instruction: '修改要求',
  get instructionNote() { return technicalWords('可参考本书，新提议会替换尚未提交的上一组。', '可参考本书。'); },
  get propose() { return technicalWords('提出变更集', '生成修改建议'); },
  get proposal() { return technicalWords('提议 · 尚未成为修改建议', '修改建议'); },
  original: '原文',
  proposed: '建议改为',
  rationale: '理由',
  position: (from: number, to: number) => technicalWords(`第 ${from + 1}–${to} 字`, ''),
  dropped: '没有提供的提议',
  droppedLine: (ordinal: number, reason: string) => `第 ${ordinal} 项：${reason}`,
  get promote() { return technicalWords('提交并在稿件中查看', '放到稿件上查看'); },
  discard: '放弃这组提议',
  get discarded() { return technicalWords('已放弃这组提议；没有新建修改建议，这轮提问的记录仍保留。', '已放弃这组修改。'); },
  openMarks: '在稿件中查看',
  get opened() { return technicalWords('Agent 工作区已打开', 'AI 协作已打开'); },
  get unavailable() { return technicalWords('无法打开当前图书的 Agent 工作区', '暂时无法为这本书打开 AI 协作'); },
  get failed() { return technicalWords('无法读取 Agent 工作区。', '暂时无法打开 AI 协作。'); },
  proposeFailed: '这轮提议没有开始。',
  promoteFailed: '没有新建修改建议。',
  discardFailed: '没有放弃这组提议。',
  manuscriptFailed: '无法读取本书的主稿件。',
  noManuscript: '这本书还没有主稿件；导入稿件后才能选择范围。',
  get overviewEntry() { return technicalWords('打开 Agent 工作区', '打开 AI 协作'); },
  get overviewNote() { return technicalWords('在 Agent 工作区里，可以就所选稿件范围提出修改，提交为修改建议后再逐条决定。', '选择稿件范围，让 AI 给出修改建议，再逐条决定。'); },
});
