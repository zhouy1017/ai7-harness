import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFidelityReport, type DocumentSignals } from '../../src/service/docx.js';
import {
  FIDELITY_DETAILS_SUMMARY,
  ROUND_TRIP_KEY,
  TEXT_BOX_CHOICE_LEGEND,
  TEXT_BOX_CHOICE_OPTIONS,
  commitNote,
  conversionNoteText,
  fidelityCountText,
  fidelityDisclosureSummary,
  fidelityOutcomeLabel,
  fidelityPillText,
  fidelityReviewHeading,
  fidelityRows,
  fidelityStatusShape,
  fidelitySummaryLine,
  needsDegradationDecision,
  offersTextBoxChoice,
  reimportFidelityHeading,
  roundTripCard,
  textBoxChoiceStatement,
} from '../../src/renderer/import-fidelity-labels.js';
import { SAMPLE1_V1_REPORT } from '../support/import-retention.js';

// Unit suite for the words of ④ 保真审阅 (Issue #410; ADR 0086). The reports are built by the service's own
// builder from counts, so the suite reads the rows the renderer is actually handed.

const NO_SIGNALS: DocumentSignals = {
  inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, textBoxes: 0, fields: 0,
};
const SAMPLE1_V2 = buildFidelityReport({ ...NO_SIGNALS, inlineStyles: 266, sections: 1 }, 0);
const WITH_BOX = buildFidelityReport({ ...NO_SIGNALS, textBoxes: 1 }, 0);
const WITH_FIELD = buildFidelityReport({ ...NO_SIGNALS, fields: 2 }, 0);

describe('the import fidelity review words', () => {
  it('gives every status its own shape beside its text', () => {
    expect(['preserved', 'retained', 'degraded', 'unsupported'].map((status) => fidelityStatusShape(status as never)))
      .toEqual(['✓', '◆', '△', '⊘']);
    const inline = SAMPLE1_V2.find((category) => category.key === 'inline-styles')!;
    expect(fidelityPillText(inline)).toBe('◆ 完整保留（随文件保留）');
    expect(fidelityCountText(266)).toBe(' · 266 项');
  });

  it('draws nine rows and closes them with the 预计往返 card', () => {
    expect(fidelityRows(SAMPLE1_V2)).toHaveLength(9);
    expect(fidelityRows(SAMPLE1_V2).some((category) => category.key === ROUND_TRIP_KEY)).toBe(false);
    expect(roundTripCard(SAMPLE1_V2)?.label).toBe('预计往返');
    expect(fidelityReviewHeading(SAMPLE1_V2)).toBe('导入保真审阅 · 9 类与预计往返');
    expect(reimportFidelityHeading(SAMPLE1_V2)).toBe('重新导入保真审阅 · 9 类与预计往返');
    expect(fidelityDisclosureSummary(SAMPLE1_V2)).toBe('查看导入保真审阅 · 9 类与预计往返');
    // A review recorded under parser /1 reads back with its own seven rows and its own card.
    expect(fidelityDisclosureSummary(SAMPLE1_V1_REPORT)).toBe('查看导入保真审阅 · 7 类与预计往返');
  });

  it('asks for the degradation decision only for a degraded or unsupported class that counts something', () => {
    expect(needsDegradationDecision(SAMPLE1_V2)).toBe(false);
    expect(needsDegradationDecision(WITH_BOX)).toBe(false);
    expect(needsDegradationDecision(WITH_FIELD)).toBe(true);
    expect(needsDegradationDecision(SAMPLE1_V1_REPORT)).toBe(true);
  });

  it('reads a review that needs no decision as one concise line', () => {
    expect(fidelitySummaryLine(SAMPLE1_V2)).toBe(
      '9 类内容都完整保留，不需要导入降级决定：行内样式 · 266 项、分节（含页面设置） · 1 项随文件保留，其余 7 类未检测到。',
    );
    expect(fidelitySummaryLine(buildFidelityReport(NO_SIGNALS, 0))).toBe('9 类内容都未检测到，稿件完整保留，不需要导入降级决定。');
    expect(FIDELITY_DETAILS_SUMMARY).toBe('展开各类明细');
  });

  it('reads a file\'s comments and tracked changes as marks it becomes, never as kept with the file (Issue #411)', () => {
    const converted = buildFidelityReport({ ...NO_SIGNALS, inlineStyles: 266, sections: 1, commentsRevisions: 8 }, 0);
    expect(fidelityPillText(converted[1]!)).toBe('✓ 完整保留');
    expect(needsDegradationDecision(converted)).toBe(false);
    expect(fidelitySummaryLine(converted)).toBe(
      '9 类内容都完整保留，不需要导入降级决定：行内样式 · 266 项、分节（含页面设置） · 1 项随文件保留；' +
      '批注与修订 · 8 项转为稿件上的批注与修改建议，其余 6 类未检测到。',
    );
    expect(fidelitySummaryLine(buildFidelityReport({ ...NO_SIGNALS, commentsRevisions: 3 }, 0)))
      .toBe('9 类内容都完整保留，不需要导入降级决定：批注与修订 · 3 项转为稿件上的批注与修改建议，其余 8 类未检测到。');
    // Formatting revisions alone become no mark, but the class was found: it stays with the file.
    const formattingOnly = buildFidelityReport({ ...NO_SIGNALS, commentsRevisionsPresent: true }, 0);
    expect(fidelitySummaryLine(formattingOnly)).toBe('9 类内容都完整保留，不需要导入降级决定：批注与修订随文件保留，其余 8 类未检测到。');
  });

  it('offers the text-box choice, 保留为文本框 first and preselected, only for a natively read file with a box', () => {
    expect(TEXT_BOX_CHOICE_LEGEND).toBe('文本框怎样进来');
    expect(TEXT_BOX_CHOICE_OPTIONS.map((option) => [option.disposition, option.label])).toEqual([
      ['retain', '保留为文本框（默认）'],
      ['merge', '并入正文'],
    ]);
    expect(offersTextBoxChoice(WITH_BOX, null)).toBe(true);
    expect(offersTextBoxChoice(SAMPLE1_V2, null)).toBe(false);
    const converted = buildFidelityReport(NO_SIGNALS, 0, {
      identity: 'ai7-doc-to-docx/1', sourceFormat: 'DOC',
      loss: { inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, headersFooters: 0, textBoxes: 1, fields: 0 },
    });
    expect(offersTextBoxChoice(converted, { converterIdentity: 'ai7-doc-to-docx/1', sourceFormat: 'DOC' })).toBe(false);
    expect(textBoxChoiceStatement('retain')).toBe('本次复核的选择：保留为文本框。');
    expect(textBoxChoiceStatement('merge')).toBe('本次复核的选择：并入正文。');
  });

  it('states true consequences around the review, and nothing about a round trip it does not make', () => {
    expect(commitNote(false)).toBe('本次导入不创建导入降级决定；原文件随来源版本完整保留，导入不修改它。');
    expect(commitNote(true)).toBe('已接受的完整降级集合、保真审阅、降级决定和稿件导入记录会原子关联；原文件随来源版本完整保留，导入不修改它。');
    expect(fidelityOutcomeLabel('clean-import-no-round-trip')).toBe('完整保留 · 原文件随来源版本保留');
    expect(fidelityOutcomeLabel('degraded-import-no-round-trip')).toBe('含已接受的降级 · 原文件随来源版本保留');
    expect(conversionNoteText({ converterIdentity: 'ai7-text-to-docx/1', sourceFormat: 'MD' }))
      .toBe('本稿件由 ai7-text-to-docx/1 从 MD 转换为 DOCX 工作表示后读取；下列损失由转换造成，原始文件原样保留。');
  });

  it('keeps the fidelity surface in its own module: index.ts only routes to it', () => {
    const index = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');
    expect(index).toContain("from './import-fidelity.js'");
    expect(index).not.toContain('function fidelityTable');
    expect(index).not.toContain('function statusIcon');
    expect(index).not.toContain('不提供 DOCX 往返保证');
    expect(index).not.toContain('8 类');
  });
});
