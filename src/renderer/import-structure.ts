import type {
  ImportHeadingRule,
  ImportSplitParagraphProjection,
  ImportStructureChoice,
  ImportStructureProjection,
  LongParagraphMethod,
} from '../shared/protocol.js';

/**
 * 结构候选与长段落 in the import fidelity review (Issue #1205; ADR 0096 §2). On the target screen the editor confirms candidate
 * headings — every checkbox unchecked, each level preset to the rules' suggestion — and makes the one choice for the paragraphs cut
 * at the block bound; the review then states what it was formed with. Every split paragraph reads 「第N段 来自原文第K段（共M段）」.
 */
export const STRUCTURE_HEADING_TITLE = '结构候选（未预选）';
export const STRUCTURE_HEADING_NOTE = '文件没有使用标题样式。以下行按文字规则识别：勾选后作为标题导入，不勾选则保持为段落。';
export const LONG_PARAGRAPH_LEGEND = '超出段落上限的段落（请选择一种方式）';
export const SOFT_BREAK_NOTE = '以下段落超出段落上限，已在文件中的软换行处分段：';
export const STRUCTURE_CHOICE_REQUIRED = '请为超出段落上限的段落选择「按句子分段」或「按长度分为多段」。';
const RULE_LABELS: Readonly<Record<ImportHeadingRule, string>> = { numbered: '编号行', contents: '目录条目', 'short-line': '独立短行' };
const METHOD_LABELS: Readonly<Record<LongParagraphMethod, { label: string; hint: string }>> = {
  sentences: { label: '按句子分段', hint: '在句末标点处分为若干段，每段不超过段落上限。' },
  blocks: { label: '按长度分为多段', hint: '按段落上限依次切分，切分处可能在句中。' },
};

export function lineageLine(paragraph: ImportSplitParagraphProjection): string {
  return `第${paragraph.firstPosition}段 来自原文第${paragraph.sourceOrdinal}段（共${paragraph.pieceCount}段）`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface StructureReviewView {
  readonly elements: ReadonlyArray<HTMLElement>;
  /** The choice as the editor has left it; undefined when the draft lists nothing. */
  choice(): ImportStructureChoice | undefined;
  /** False while the long-paragraph choice the draft asks for is unmade. */
  allowed(): boolean;
}

export function renderStructureReview(structure: ImportStructureProjection | undefined,
  stated?: ImportStructureChoice): StructureReviewView {
  if (structure === undefined) return { elements: [], choice: () => undefined, allowed: () => true };
  const section = el('section', 'review-section import-structure');
  section.dataset['importStructure'] = stated === undefined ? 'offered' : 'stated';
  const confirmed = new Map(stated?.headings.map((heading) => [heading.position, heading.level]) ?? []);
  const rows: Array<{ checkbox: HTMLInputElement; level: HTMLSelectElement; position: number }> = [];
  if (structure.headings.length > 0) {
    section.append(el('h3', undefined, STRUCTURE_HEADING_TITLE), el('p', 'field-note', STRUCTURE_HEADING_NOTE));
    const list = el('ul', 'structure-candidates');
    for (const candidate of structure.headings) {
      const item = el('li', 'choice');
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.dataset['structureCandidate'] = String(candidate.position);
      checkbox.checked = confirmed.has(candidate.position);
      checkbox.disabled = stated !== undefined;
      const level = el('select');
      level.dataset['structureLevel'] = String(candidate.position);
      level.setAttribute('aria-label', `第${candidate.position}段的标题级别`);
      for (let value = 1; value <= 6; value += 1) level.append(new Option(`${value} 级`, String(value)));
      level.value = String(confirmed.get(candidate.position) ?? candidate.suggestedLevel);
      level.disabled = stated !== undefined;
      const copy = el('span');
      copy.append(el('strong', undefined, candidate.excerpt), el('small', undefined, `第${candidate.position}段 · ${RULE_LABELS[candidate.rule]}`));
      item.append(checkbox, copy, level);
      list.append(item);
      rows.push({ checkbox, level, position: candidate.position });
    }
    section.append(list);
    if (structure.headingsTruncated) section.append(el('p', 'field-note', `只列出前 ${structure.headings.length} 个候选。`));
  }
  if (structure.softBreakSplits.length > 0) {
    const splits = el('div', 'structure-splits');
    splits.dataset['softBreakSplits'] = String(structure.softBreakSplits.length);
    splits.append(el('p', 'field-note', SOFT_BREAK_NOTE), ...structure.softBreakSplits.map((paragraph) => el('p', 'structure-lineage', lineageLine(paragraph))));
    section.append(splits);
  }
  let method: LongParagraphMethod | null = stated?.longParagraphs ?? null;
  if (structure.longParagraphs.length > 0) {
    const fieldset = el('fieldset', 'long-paragraph-choice');
    fieldset.setAttribute('role', 'radiogroup');
    fieldset.append(el('legend', undefined, LONG_PARAGRAPH_LEGEND));
    for (const paragraph of structure.longParagraphs) {
      const line = stated === undefined
        ? `原文第${paragraph.sourceOrdinal}段：按句子分段为 ${paragraph.choice!.sentences} 段，按长度分为 ${paragraph.choice!.blocks} 段。${paragraph.excerpt}`
        : lineageLine(paragraph);
      fieldset.append(el('p', 'structure-lineage', line));
    }
    for (const option of ['sentences', 'blocks'] as const) {
      const label = el('label', 'choice');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'long-paragraph-method';
      radio.dataset['longParagraphChoice'] = option;
      radio.checked = method === option;
      radio.disabled = stated !== undefined;
      radio.addEventListener('change', () => { if (radio.checked) method = option; });
      const copy = el('span');
      copy.append(el('strong', undefined, METHOD_LABELS[option].label), el('small', undefined, METHOD_LABELS[option].hint));
      label.append(radio, copy);
      fieldset.append(label);
    }
    section.append(fieldset);
  }
  return {
    elements: [section],
    choice: () => ({
      headings: rows.filter((row) => row.checkbox.checked).map((row) => ({ position: row.position, level: Number(row.level.value) })),
      longParagraphs: method,
    }),
    allowed: () => structure.longParagraphs.length === 0 || method !== null,
  };
}
