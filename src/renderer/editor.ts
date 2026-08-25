import { baseKeymap } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Schema, type DOMOutputSpec, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_EDIT_CODE_UNITS,
  MAX_EDIT_GRAPHEMES,
  MAX_WINDOW_BLOCKS,
  type JournalEditInput,
  type ManuscriptBlockProjection,
  type ManuscriptWindowProjection,
  type RendererApi,
} from '../shared/protocol.js';

interface EditorUiState {
  dirty: boolean;
  saving: boolean;
  journalSequence: number;
}

export interface BoundedEditor {
  focus(): void;
  flush(): Promise<void>;
  destroy(): void;
}

interface MountOptions {
  host: HTMLElement;
  platform: RendererApi['platform'];
  initialWindow: ManuscriptWindowProjection;
  flushJournalEdit: RendererApi['flushJournalEdit'];
  onStateChange(state: EditorUiState): void;
  onAnnouncement(message: string, tone: 'busy' | 'success' | 'error'): void;
}

interface BaselineBlock {
  readonly blockId: string;
  readonly position: number;
  readonly kind: ManuscriptBlockProjection['kind'];
  readonly level: number | null;
  text: string;
  digest: string;
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

function blockDom(tag: string, node: ProseMirrorNode): DOMOutputSpec {
  return [tag, { 'data-block-id': String(node.attrs['blockId']) }, 0];
}

const blockAttrs = {
  blockId: { validate: 'string' },
  position: { validate: 'number' },
  digest: { validate: 'string' },
  level: { default: null, validate: 'number|null' },
};

const ai7Schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    title: {
      group: 'block',
      content: 'text*',
      marks: '',
      attrs: blockAttrs,
      defining: true,
      toDOM: (node) => blockDom('h1', node),
    },
    heading: {
      group: 'block',
      content: 'text*',
      marks: '',
      attrs: blockAttrs,
      defining: true,
      toDOM: (node) => blockDom(`h${Math.min(6, Math.max(2, Number(node.attrs['level']) + 1))}`, node),
    },
    paragraph: {
      group: 'block',
      content: 'text*',
      marks: '',
      attrs: blockAttrs,
      toDOM: (node) => blockDom('p', node),
    },
    text: { group: 'inline' },
  },
  marks: {},
});

function requireEditor(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateText(text: string): void {
  requireEditor(
    text.length <= MAX_BLOCK_CODE_UNITS && graphemes(text).length <= MAX_BLOCK_GRAPHEMES,
    '稿件内容块超出当前安全编辑范围。',
  );
}

function deriveEdit(baseText: string, nextText: string): Pick<JournalEditInput, 'fromGrapheme' | 'toGrapheme' | 'insertText'> {
  const base = graphemes(baseText);
  const next = graphemes(nextText);
  let prefix = 0;
  while (prefix < base.length && prefix < next.length && base[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < base.length - prefix &&
    suffix < next.length - prefix &&
    base[base.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const insertText = next.slice(prefix, next.length - suffix).join('');
  requireEditor(
    base.length - suffix - prefix <= MAX_EDIT_GRAPHEMES &&
      graphemes(insertText).length <= MAX_EDIT_GRAPHEMES &&
      insertText.length <= MAX_EDIT_CODE_UNITS,
    '本次修改超出单次保存范围，请缩小修改。',
  );
  return { fromGrapheme: prefix, toGrapheme: base.length - suffix, insertText };
}

function baselineMap(windowProjection: ManuscriptWindowProjection): Map<string, BaselineBlock> {
  requireEditor(
    windowProjection.blocks.length > 0 && windowProjection.blocks.length <= MAX_WINDOW_BLOCKS,
    '稿件窗口超出安全范围。',
  );
  const map = new Map<string, BaselineBlock>();
  let previousPosition = 0;
  for (const block of windowProjection.blocks) {
    requireEditor(
      /^blk_[0-9a-f]{24}$/.test(block.blockId) &&
        !map.has(block.blockId) &&
        block.position > previousPosition &&
        (block.kind === 'title' || block.kind === 'heading' || block.kind === 'paragraph'),
      '稿件窗口内容块绑定无效。',
    );
    validateText(block.text);
    previousPosition = block.position;
    map.set(block.blockId, { ...block });
  }
  return map;
}

function createDocument(blocks: ReadonlyArray<ManuscriptBlockProjection>): ProseMirrorNode {
  return ai7Schema.node(
    'doc',
    null,
    blocks.map((block) =>
      ai7Schema.node(
        block.kind,
        {
          blockId: block.blockId,
          position: block.position,
          digest: block.digest,
          level: block.level,
        },
        block.text.length > 0 ? ai7Schema.text(block.text) : undefined,
      ),
    ),
  );
}

function findBlock(document: ProseMirrorNode, blockId: string): ProseMirrorNode | undefined {
  let found: ProseMirrorNode | undefined;
  document.forEach((node) => {
    if (node.attrs['blockId'] === blockId) found = node;
  });
  return found;
}

export function mountBoundedEditor(options: MountOptions): BoundedEditor {
  let windowProjection = options.initialWindow;
  let baselines = baselineMap(windowProjection);
  let dirtyBlockId: string | undefined;
  let saving = false;
  let retryRequired = false;
  let prepared: { input: JournalEditInput; submittedText: string } | undefined;
  let destroyed = false;

  const changedBlocks = (document: ProseMirrorNode): string[] => {
    const changed: string[] = [];
    document.forEach((node) => {
      const blockId = String(node.attrs['blockId']);
      if (node.textContent !== baselines.get(blockId)?.text) changed.push(blockId);
    });
    return changed;
  };

  const candidateIsBounded = (transaction: Transaction): boolean => {
    if (!transaction.docChanged) return true;
    const candidate = transaction.doc;
    if (candidate.childCount !== baselines.size) return false;
    let valid = true;
    candidate.forEach((node, _offset, index) => {
      const blockId = String(node.attrs['blockId']);
      const baseline = baselines.get(blockId);
      const expected = windowProjection.blocks[index];
      if (
        !baseline ||
        !expected ||
        blockId !== expected.blockId ||
        node.type.name !== baseline.kind ||
        Number(node.attrs['position']) !== baseline.position ||
        node.attrs['level'] !== baseline.level ||
        String(node.attrs['digest']) !== baseline.digest ||
        node.textContent.length > MAX_BLOCK_CODE_UNITS ||
        graphemes(node.textContent).length > MAX_BLOCK_GRAPHEMES
      ) {
        valid = false;
      }
    });
    if (!valid) return false;
    const changed = changedBlocks(candidate);
    if (changed.length > 1 || (dirtyBlockId !== undefined && changed.some((id) => id !== dirtyBlockId))) return false;
    if (changed.length === 1) {
      const block = baselines.get(changed[0]!);
      const current = findBlock(candidate, changed[0]!);
      if (!block || !current) return false;
      try {
        deriveEdit(block.text, current.textContent);
      } catch {
        return false;
      }
    }
    return !saving && !retryRequired;
  };

  const transactionFilter = new Plugin({ filterTransaction: candidateIsBounded });
  const makeState = (): EditorState =>
    EditorState.create({
      schema: ai7Schema,
      doc: createDocument(windowProjection.blocks),
      plugins: [transactionFilter, history(), keymap(baseKeymap)],
    });

  let view: EditorView;

  const announceState = (): void =>
    options.onStateChange({ dirty: dirtyBlockId !== undefined, saving, journalSequence: windowProjection.journalSequence });

  const flush = async (): Promise<void> => {
    if (destroyed || saving || dirtyBlockId === undefined) return;
    const baseline = baselines.get(dirtyBlockId);
    const current = findBlock(view.state.doc, dirtyBlockId);
    requireEditor(baseline && current, '待保存内容块不存在。');
    if (!prepared || prepared.submittedText !== current.textContent) {
      requireEditor(!retryRequired, '请先重试上一项保存。');
      prepared = {
        input: {
          clientEditId: crypto.randomUUID(),
          manuscriptId: windowProjection.manuscriptId,
          branchId: windowProjection.branchId,
          baseRevisionId: windowProjection.revisionId,
          blockId: baseline.blockId,
          baseBlockDigest: baseline.digest,
          expectedJournalSequence: windowProjection.journalSequence,
          ...deriveEdit(baseline.text, current.textContent),
        },
        submittedText: current.textContent,
      };
    }
    saving = true;
    view.setProps({ editable: () => false });
    announceState();
    options.onAnnouncement('正在写入修订日志…', 'busy');
    try {
      const ack = await options.flushJournalEdit(prepared.input);
      requireEditor(
        ack.clientEditId === prepared.input.clientEditId &&
          ack.branchId === windowProjection.branchId &&
          ack.baseRevisionId === windowProjection.revisionId &&
          ack.blockId === baseline.blockId &&
          ack.sequence === windowProjection.journalSequence + 1,
        '修订日志确认与当前编辑不匹配。',
      );
      const updatedBlocks = windowProjection.blocks.map((block) =>
        block.blockId === baseline.blockId
          ? { ...block, text: prepared!.submittedText, digest: ack.resultingBlockDigest }
          : block,
      );
      windowProjection = { ...windowProjection, journalSequence: ack.sequence, blocks: updatedBlocks };
      baselines = baselineMap(windowProjection);
      dirtyBlockId = undefined;
      prepared = undefined;
      retryRequired = false;
      saving = false;
      view.updateState(makeState());
      view.setProps({ editable: () => true });
      announceState();
      options.onAnnouncement(ack.completionLabel, 'success');
    } catch (error) {
      saving = false;
      retryRequired = true;
      view.setProps({ editable: () => false });
      announceState();
      options.onAnnouncement(error instanceof Error ? error.message : '修订日志写入失败，请重试。', 'error');
    }
  };

  view = new EditorView(options.host, {
    state: makeState(),
    editable: () => !saving && !retryRequired,
    dispatchTransaction(transaction) {
      const nextState = view.state.apply(transaction);
      if (nextState === view.state) return;
      view.updateState(nextState);
      const changed = changedBlocks(nextState.doc);
      dirtyBlockId = changed[0];
      prepared = undefined;
      announceState();
    },
    handleDOMEvents: {
      keydown(currentView, event) {
        const modifier =
          options.platform === 'darwin'
            ? event.metaKey && !event.ctrlKey
            : event.ctrlKey && !event.metaKey;
        if (event.key.toLocaleLowerCase('en-US') !== 's' || !modifier || event.altKey || event.shiftKey) return false;
        event.preventDefault();
        if (currentView.composing || event.isComposing) {
          options.onAnnouncement('输入法组合尚未结束，完成输入后再保存。', 'busy');
          return true;
        }
        void flush();
        return true;
      },
    },
  });
  view.dom.setAttribute('role', 'textbox');
  view.dom.setAttribute('aria-label', '稿件编辑区');
  view.dom.setAttribute('aria-multiline', 'true');
  view.dom.setAttribute('data-testid', 'manuscript-editor');
  announceState();

  return {
    focus: () => view.focus(),
    flush,
    destroy: () => {
      destroyed = true;
      view.destroy();
    },
  };
}
