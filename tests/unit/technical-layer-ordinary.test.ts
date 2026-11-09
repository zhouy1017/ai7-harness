import { afterEach, describe, expect, it } from 'vitest';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { SAVE_MENU_WORDS } from '../../src/renderer/save-menu-labels.js';
import { lastDurableLine } from '../../src/renderer/editor-protection-labels.js';
import { selectionMenuReason } from '../../src/renderer/editorial-mark-labels.js';
import { exportCardHeading, exportSavedRevisionLine } from '../../src/renderer/manuscript-export-labels.js';
import { WORD_IMPORT_MODE_NAMES, conversionNoteText } from '../../src/renderer/import-fidelity-labels.js';
import { AGENT_WORKSPACE_WORDS } from '../../src/renderer/agent-workspace-labels.js';
import { SHELL_AGENT_WORKSPACE_ROW } from '../../src/renderer/shell-labels.js';
import { analysisResultReadLine, taskComposerRevisionLine, taskResultRangeTitle } from '../../src/renderer/task-panel-labels.js';
import { taskBarAwaitingAnswerNote, taskBarContinuationNote, taskPlanSavedLine, unconfirmedLine } from '../../src/renderer/task-drawer-labels.js';
import { reviewAuthorizedLine, reviewCoverageLastReview, reviewPlanCategoriesLine, reviewRunMetaLine } from '../../src/renderer/review-labels.js';
import { evaluationAi7UnreadLine, readersReportBasisLine } from '../../src/renderer/evaluation-labels.js';
import { backgroundStartedLine } from '../../src/renderer/background-analysis-labels.js';
import { customTabCountsLine, customTabGapLine } from '../../src/renderer/custom-analysis-labels.js';
import { materialIndexCompletedReason } from '../../src/renderer/knowledge-base-labels.js';
import { taskResendSummary } from '../../src/renderer/analysis-paging-labels.js';
import { RUN_LIVENESS_STAGE_LABELS } from '../../src/renderer/plan-preview-labels.js';
import { publicationChangeNoticeDetail } from '../../src/renderer/deliverables-labels.js';
import { packageChangedLine } from '../../src/renderer/book-delivery-package-labels.js';
import { conflictPaneLabels } from '../../src/renderer/proposal-conflict-labels.js';

// Issue #1431: the mechanism words the earlier scans did not catch — revisions and journals, analysis units, structure sections,
// graphemes, reading ranges, pins, plan versions, run authorizations, Provider, baselines, atomicity, authority — stay out of
// ordinary mode, while the developer layer keeps each line's diagnostic. Synthetic values only.
const JARGON = /修订版|修订日志|日志序号|分析单元|结构段|字素|阅读范围|\bpin\b|计划版本|运行授权|Provider|基线|原子|权威|派生|\{"/u;
const at = '2026-11-09T00:00:00.000Z';

const LINES: ReadonlyArray<readonly [string, () => string, string]> = [
  ['save menu', () => [SAVE_MENU_WORDS.written, SAVE_MENU_WORDS.writing, SAVE_MENU_WORDS.unwritten, SAVE_MENU_WORDS.unconfirmed, SAVE_MENU_WORDS.confirming].join('|'), '修订日志'],
  ['last durable write', () => lastDurableLine(1234, at), '修订日志序号 1,234'],
  ['unsettled selection', () => selectionMenuReason('unsettled'), '修订日志'],
  ['export heading and saved revision', () => `${exportCardHeading(null, { kind: 'current' } as never)}|${exportSavedRevisionLine('r3')}`, '修订版 r3'],
  ['Word import mode and conversion', () => `${WORD_IMPORT_MODE_NAMES['accepted-baseline']}|${conversionNoteText({ converterIdentity: 'ai7-text-to-docx/1', sourceFormat: 'MD' })}`, 'ai7-text-to-docx/1'],
  ['AI collaboration words', () => [AGENT_WORKSPACE_WORDS.heading, AGENT_WORKSPACE_WORDS.lede, AGENT_WORKSPACE_WORDS.propose, AGENT_WORKSPACE_WORDS.proposal,
    AGENT_WORKSPACE_WORDS.position(0, 5), SHELL_AGENT_WORKSPACE_ROW.label].join('|'), '第 1–5 字'],
  ['task input and composer', () => `${taskPlanSavedLine('r3')}|${taskComposerRevisionLine('r2', 9, true)}`, '修订日志序号 9'],
  ['task result', () => `${analysisResultReadLine({ units: new Array(8).fill(null), manuscriptPin: { revisionLabel: 'r2' } } as never)}|${taskResultRangeTitle(3, null)}`, '8 个阅读范围'],
  ['continuation and waiting', () => `${taskBarContinuationNote(2, 8)}|${taskBarAwaitingAnswerNote(2, 8, 1)}|${unconfirmedLine({ unitOrdinal: 2, category: null })}`, '2 / 8 个阅读范围'],
  ['review lines', () => [reviewCoverageLastReview({ lastRunOrdinal: 2, lastReviewedRevisionLabel: 'r3' }), reviewPlanCategoriesLine(3),
    reviewRunMetaLine('全书', 'r3'), reviewAuthorizedLine('T')].join('|'), '读的是修订版 r3'],
  ['evaluation lines', () => `${evaluationAi7UnreadLine({ unitsTotal: 8, unreadUnits: [2, 3] })}|${readersReportBasisLine({ ordinal: 2, revisionLabel: 'r3' } as never)}`, '评估的是修订版 r3'],
  ['background and custom analysis', () => [backgroundStartedLine({ taskIntentId: 't', modeLabel: '同步到当前稿件', enrollmentOrdinal: 1, authorizedAt: 'A' }, (value) => value),
    customTabCountsLine({ units: 3, rows: 4, located: 4, unlocated: 0 }), customTabGapLine({ unitOrdinal: 2, reason: '没有读成' })].join('|'), '按第 1 版登记'],
  ['material, resend and run stage', () => `${materialIndexCompletedReason('complete')}|${taskResendSummary(3)}|${RUN_LIVENESS_STAGE_LABELS.units}`, '分段锚点'],
  ['publication, package and conflict', () => `${publicationChangeNoticeDetail({ revisionLabel: 'r3' } as never)}|${packageChangedLine('v2')}|${Object.values(conflictPaneLabels('suggestion')).join('|')}`, '当前权威稿件'],
];

describe('ordinary words and their developer diagnostics (Issue #1431)', () => {
  afterEach(() => setTechnicalLayerVisible(true));

  it.each(LINES)('keeps %s free of mechanism words in ordinary mode', (_name, line) => {
    setTechnicalLayerVisible(false);
    const words = line();
    expect(words).not.toMatch(JARGON);
    expect(words).not.toMatch(/\br\d+\b/u);
  });

  it.each(LINES)('keeps the diagnostic of %s in developer mode', (_name, line, diagnostic) => {
    setTechnicalLayerVisible(true);
    expect(line()).toContain(diagnostic);
  });
});
