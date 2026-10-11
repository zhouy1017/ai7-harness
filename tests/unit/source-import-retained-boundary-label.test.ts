import { describe, expect, it } from 'vitest';
import {
  acceptedSourceImportRetainedBoundaryLabels,
  sourceImportRetainedBoundaryLabel,
  type SourceFormat,
} from '../../src/shared/protocol.js';

// The label a Source Import Record keeps for its retained file (Issue #583). Owner decision 2026-10-11: a converted
// source names its original format and says it was converted; the receipt shows the same format name beside it.

const DOCX_LABEL = '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份';
const ORIGINAL_LABEL = '保留完整所选原始文件及其精确身份；未进行本地解析';
const CONVERTED_FORMATS = ['TXT', 'MD', 'DOC'] as const;
const OTHER_FORMATS: ReadonlyArray<SourceFormat> = ['PDF', 'ODT', 'RTF', 'UNKNOWN'];

describe('the label of a retained source file', () => {
  it.each(CONVERTED_FORMATS)('names %s and says the file was converted', (format) => {
    expect(sourceImportRetainedBoundaryLabel(format, true))
      .toBe(`保留完整所选 ${format} 文件及本地转换出的完整内容与结构身份（已转换）`);
  });

  it('keeps the DOCX label for a DOCX the product parsed itself', () => {
    expect(sourceImportRetainedBoundaryLabel('DOCX', true)).toBe(DOCX_LABEL);
  });

  it.each([...CONVERTED_FORMATS, 'DOCX', ...OTHER_FORMATS] as const)('claims no parse for an unparsed %s', (format) => {
    expect(sourceImportRetainedBoundaryLabel(format, false)).toBe(ORIGINAL_LABEL);
  });

  it.each(CONVERTED_FORMATS)('accepts the new label and the one written before it on a stored %s record', (format) => {
    expect(acceptedSourceImportRetainedBoundaryLabels(format, true))
      .toEqual([sourceImportRetainedBoundaryLabel(format, true), DOCX_LABEL]);
  });

  it('accepts only the DOCX label on a DOCX record', () => {
    expect(acceptedSourceImportRetainedBoundaryLabels('DOCX', true)).toEqual([DOCX_LABEL]);
  });

  it.each([...CONVERTED_FORMATS, 'DOCX', ...OTHER_FORMATS] as const)('accepts only the original label on an unparsed %s record', (format) => {
    expect(acceptedSourceImportRetainedBoundaryLabels(format, false)).toEqual([ORIGINAL_LABEL]);
  });
});
