import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { Schema, type DOMOutputSpec, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_EDIT_CODE_UNITS,
  MAX_EDIT_GRAPHEMES,
  MAX_WINDOW_BLOCKS,
  type JournalAcknowledgement,
  type JournalEditInput,
  type ManuscriptBlockProjection,
  type ManuscriptWindowProjection,
  type RendererApi,
} from '../shared/protocol.js';

interface EditorUiState {
  dirty: boolean;
  interrupted: boolean;
  retryRequired: boolean;
  saving: boolean;
  journalSequence: number;
  workingDigest: string;
  composing: boolean;
  operationLocked: boolean;
}

export interface BoundedEditor {
  focus(): void;
  flush(): Promise<void>;
  captureContinuity(): EditorContinuity;
  captureNavigationContinuity(): EditorContinuity;
  loadWindow(windowProjection: ManuscriptWindowProjection, continuity?: EditorContinuity): boolean;
  loadNavigationWindow(windowProjection: ManuscriptWindowProjection, continuity: EditorContinuity): boolean;
  selectRange(blockId: string, fromGrapheme: number, toGrapheme: number): boolean;
  currentWindow(): ManuscriptWindowProjection;
  isComposing(): boolean;
  setOperationLocked(locked: boolean): void;
  interrupt(): void;
  destroy(): void;
}

export interface EditorPoint {
  blockId: string;
  grapheme: number;
}

export interface EditorContinuity {
  anchor: EditorPoint;
  head: EditorPoint;
  direction: 'forward' | 'backward';
  scrollAnchor: { blockId: string; offset: number };
  focused: boolean;
}

interface MountOptions {
  host: HTMLElement;
  scrollContainer: HTMLElement;
  platform: RendererApi['platform'];
  initialWindow: ManuscriptWindowProjection;
  flushJournalEdit: RendererApi['flushJournalEdit'];
  onStateChange(state: EditorUiState): void;
  onAnnouncement(message: string, tone: 'busy' | 'success' | 'error'): void;
  onCommand(command: 'search' | 'replace' | 'undo' | 'redo' | 'previous-window' | 'next-window'): void;
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
const CARET_NAVIGATION_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'home', 'end']);

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
  const changedBase = base.length - suffix - prefix;
  const changedNext = next.slice(prefix, next.length - suffix);
  let insertCodeUnits = 0;
  let insertCount = 0;
  while (
    insertCount < changedNext.length &&
    insertCount < MAX_EDIT_GRAPHEMES &&
    insertCodeUnits + changedNext[insertCount]!.length <= MAX_EDIT_CODE_UNITS
  ) {
    insertCodeUnits += changedNext[insertCount]!.length;
    insertCount += 1;
  }
  const removed = Math.min(changedBase, MAX_EDIT_GRAPHEMES);
  requireEditor(removed > 0 || insertCount > 0, '本次修改无法形成安全的增量写入。');
  return {
    fromGrapheme: prefix,
    toGrapheme: prefix + removed,
    insertText: changedNext.slice(0, insertCount).join(''),
  };
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

function findBlockPosition(document: ProseMirrorNode, blockId: string): { node: ProseMirrorNode; position: number } | undefined {
  let found: { node: ProseMirrorNode; position: number } | undefined;
  document.descendants((node, position) => {
    if (node.attrs['blockId'] === blockId) {
      found = { node, position };
      return false;
    }
    return found === undefined;
  });
  return found;
}

function pointAtPosition(document: ProseMirrorNode, position: number): EditorPoint {
  let fallback: EditorPoint | undefined;
  let found: EditorPoint | undefined;
  document.forEach((node, offset) => {
    const blockId = String(node.attrs['blockId']);
    const segments = graphemes(node.textContent);
    const contentStart = offset + 1;
    const contentEnd = contentStart + node.textContent.length;
    fallback = { blockId, grapheme: segments.length };
    if (found || position < contentStart || position > contentEnd) return;
    const codeUnits = Math.max(0, Math.min(node.textContent.length, position - contentStart));
    let consumed = 0;
    let grapheme = 0;
    while (grapheme < segments.length && consumed + segments[grapheme]!.length <= codeUnits) {
      consumed += segments[grapheme]!.length;
      grapheme += 1;
    }
    found = { blockId, grapheme };
  });
  requireEditor(found ?? fallback, '稿件选择位置无法解析。');
  return found ?? fallback!;
}

function positionAtPoint(document: ProseMirrorNode, point: EditorPoint): number | undefined {
  const found = findBlockPosition(document, point.blockId);
  if (!found) return undefined;
  const parts = graphemes(found.node.textContent);
  if (!Number.isSafeInteger(point.grapheme) || point.grapheme < 0 || point.grapheme > parts.length) return undefined;
  return found.position + 1 + parts.slice(0, point.grapheme).join('').length;
}

export function mountBoundedEditor(options: MountOptions): BoundedEditor {
  let windowProjection = options.initialWindow;
  let baselines = baselineMap(windowProjection);
  let saving = false;
  let retryRequired = false;
  let retryPrepared: { input: JournalEditInput } | undefined;
  let flushPromise: Promise<void> | undefined;
  let autoFlushTimer: number | undefined;
  let compositionWaiters: Array<() => void> = [];
  let destroyed = false;
  let interrupted = false;
  let composing = false;
  let operationLocked = false;
  let deferredNavigationContinuity: EditorContinuity | undefined;

  const isEditable = (): boolean =>
    !retryRequired && !interrupted && !operationLocked && deferredNavigationContinuity === undefined;

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
      } else if (node.textContent !== baseline.text) {
        try {
          deriveEdit(baseline.text, node.textContent);
        } catch {
          valid = false;
        }
      }
    });
    if (!valid) return false;
    return isEditable();
  };

  const transactionFilter = new Plugin({ filterTransaction: candidateIsBounded });
  const makeState = (blocks: ReadonlyArray<ManuscriptBlockProjection> = windowProjection.blocks): EditorState =>
    EditorState.create({
      schema: ai7Schema,
      doc: createDocument(blocks),
      plugins: [transactionFilter, keymap(baseKeymap)],
    });

  let view: EditorView;

  const applyEditableState = (): void => {
    view.setProps({ editable: isEditable });
    view.dom.setAttribute('aria-readonly', isEditable() ? 'false' : 'true');
    view.dom.dataset['operationLocked'] = operationLocked ? 'true' : 'false';
    if (deferredNavigationContinuity) view.dom.setAttribute('tabindex', '0');
    else view.dom.removeAttribute('tabindex');
  };

  const captureRenderedContinuity = (): EditorContinuity => {
    const selection = view.state.selection;
    const containerRect = options.scrollContainer.getBoundingClientRect();
    const rendered = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-block-id]'));
    const visible = rendered.find((candidate) => candidate.getBoundingClientRect().bottom >= containerRect.top) ?? rendered[0];
    requireEditor(visible, '稿件滚动锚点无法解析。');
    const anchor = pointAtPosition(view.state.doc, selection.anchor);
    const head = pointAtPosition(view.state.doc, selection.head);
    return {
      anchor,
      head,
      direction: selection.anchor <= selection.head ? 'forward' : 'backward',
      scrollAnchor: {
        blockId: visible.dataset['blockId']!,
        offset: visible.getBoundingClientRect().top - containerRect.top,
      },
      focused: view.hasFocus(),
    };
  };

  const restoreContinuity = (
    state: EditorState,
    continuity: EditorContinuity | undefined,
    focusBlockId: string | null,
    focusGrapheme: number | null,
    deferMissing: boolean,
  ): void => {
    let nextState = state;
    let selectionRestored = false;
    if (continuity) {
      const anchor = positionAtPoint(state.doc, continuity.anchor);
      const head = positionAtPoint(state.doc, continuity.head);
      const scrollAnchor = findBlockPosition(state.doc, continuity.scrollAnchor.blockId);
      if (anchor !== undefined && head !== undefined && scrollAnchor !== undefined) {
        nextState = state.apply(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)));
        selectionRestored = true;
        deferredNavigationContinuity = undefined;
      } else if (deferMissing) {
        deferredNavigationContinuity = continuity;
      } else {
        deferredNavigationContinuity = undefined;
      }
    } else {
      deferredNavigationContinuity = undefined;
    }
    if (!selectionRestored && focusBlockId !== null) {
      requireEditor(focusGrapheme !== null, '稿件焦点缺少精确字素位置。');
      const target = positionAtPoint(state.doc, { blockId: focusBlockId, grapheme: focusGrapheme });
      requireEditor(target !== undefined, '稿件焦点无法精确解析。');
      nextState = state.apply(state.tr.setSelection(TextSelection.create(state.doc, target)));
    }
    view.updateState(nextState);
    applyEditableState();
    requestAnimationFrame(() => {
      const scrollId = selectionRestored ? continuity?.scrollAnchor.blockId : focusBlockId;
      const target = scrollId ? view.dom.querySelector<HTMLElement>(`[data-block-id="${scrollId}"]`) : undefined;
      if (target && continuity && selectionRestored) {
        const containerTop = options.scrollContainer.getBoundingClientRect().top;
        options.scrollContainer.scrollTop += target.getBoundingClientRect().top - containerTop - continuity.scrollAnchor.offset;
      } else if (target) {
        target.scrollIntoView({ block: 'center' });
      }
      if (continuity?.focused || (!continuity && focusBlockId !== null)) {
        if (deferredNavigationContinuity) view.dom.focus({ preventScroll: true });
        else view.focus();
      }
    });
  };

  const waitForComposition = async (): Promise<void> => {
    if (!composing && !view.composing) return;
    await new Promise<void>((resolve) => compositionWaiters.push(resolve));
  };

  const announceState = (): void =>
    options.onStateChange({
      dirty: changedBlocks(view.state.doc).length > 0,
      interrupted,
      retryRequired,
      saving,
      journalSequence: windowProjection.journalSequence,
      workingDigest: windowProjection.workingDigest,
      composing,
      operationLocked,
    });

  const flush = (): Promise<void> => {
    if (destroyed || interrupted) return Promise.resolve();
    if (autoFlushTimer !== undefined) {
      window.clearTimeout(autoFlushTimer);
      autoFlushTimer = undefined;
    }
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      let lastCompletion: JournalAcknowledgement['completionLabel'] | undefined;
      while (!destroyed && !interrupted) {
        if (composing || view.composing) break;
        const changed = changedBlocks(view.state.doc);
        if (changed.length === 0) break;
        const blockId = retryPrepared?.input.blockId ?? changed[0]!;
        const baseline = baselines.get(blockId);
        const current = findBlock(view.state.doc, blockId);
        requireEditor(baseline && current, '待保存内容块不存在。');
        const prepared = retryPrepared ?? (() => {
          const edit = deriveEdit(baseline.text, current.textContent);
          return {
            input: {
              clientEditId: crypto.randomUUID(),
              manuscriptId: windowProjection.manuscriptId,
              branchId: windowProjection.branchId,
              baseRevisionId: windowProjection.revisionId,
              blockId: baseline.blockId,
              windowStartBlockId: windowProjection.blocks[0]!.blockId,
              baseBlockDigest: baseline.digest,
              expectedJournalSequence: windowProjection.journalSequence,
              ...edit,
            },
          };
        })();
        saving = true;
        announceState();
        options.onAnnouncement('正在自动写入修订日志；可继续编辑当前窗口。', 'busy');
        try {
          const ack = await options.flushJournalEdit(prepared.input);
          requireEditor(
            ack.clientEditId === prepared.input.clientEditId &&
              ack.branchId === windowProjection.branchId &&
              ack.baseRevisionId === windowProjection.revisionId &&
              ack.blockId === baseline.blockId &&
              ack.sequence === windowProjection.journalSequence + 1 &&
              ack.resultingBlockDigest === ack.window.blocks.find((block) => block.blockId === baseline.blockId)?.digest &&
              ack.resultingWorkingDigest === ack.window.workingDigest &&
              ack.window.journalSequence === ack.sequence &&
              ack.window.blocks[0]?.blockId === prepared.input.windowStartBlockId,
            '修订日志确认与当前编辑不匹配。',
          );
          await waitForComposition();
          const continuity = captureRenderedContinuity();
          const localText = new Map<string, string>();
          view.state.doc.forEach((node) => localText.set(String(node.attrs['blockId']), node.textContent));
          windowProjection = ack.window;
          baselines = baselineMap(windowProjection);
          const visibleBlocks = windowProjection.blocks.map((block) => ({ ...block, text: localText.get(block.blockId) ?? block.text }));
          restoreContinuity(makeState(visibleBlocks), continuity, null, null, false);
          retryPrepared = undefined;
          retryRequired = false;
          applyEditableState();
          lastCompletion = ack.completionLabel;
          announceState();
        } catch (error) {
          retryPrepared = prepared;
          retryRequired = true;
          applyEditableState();
          options.onAnnouncement(
            interrupted
              ? '本地业务服务已中断；未保存文字仍保留在编辑区，但尚未获得持久写入确认。'
              : error instanceof Error
                ? `本地写入中断；未确认修改仍保留。${error.message}`
                : '本地写入中断；未确认修改仍保留，请重试。',
            'error',
          );
          break;
        }
      }
      saving = false;
      announceState();
      if (lastCompletion && !retryRequired && changedBlocks(view.state.doc).length === 0) {
        options.onAnnouncement(lastCompletion, 'success');
      }
    })().catch((error: unknown) => {
      saving = false;
      retryRequired = true;
      applyEditableState();
      announceState();
      options.onAnnouncement(
        error instanceof Error
          ? `本地写入中断；未确认修改仍保留。${error.message}`
          : '本地写入中断；未确认修改仍保留，请重试。',
        'error',
      );
    }).finally(() => {
      flushPromise = undefined;
    });
    return flushPromise;
  };

  const scheduleAutomaticFlush = (): void => {
    if (autoFlushTimer !== undefined) window.clearTimeout(autoFlushTimer);
    autoFlushTimer = window.setTimeout(() => {
      autoFlushTimer = undefined;
      void flush();
    }, 500);
  };

  view = new EditorView(options.host, {
    state: makeState(),
    editable: isEditable,
    dispatchTransaction(transaction) {
      const nextState = view.state.apply(transaction);
      if (nextState === view.state) return;
      view.updateState(nextState);
      announceState();
      if (transaction.docChanged) scheduleAutomaticFlush();
    },
    handleDOMEvents: {
      keydown(currentView, event) {
        const modifier =
          options.platform === 'darwin'
            ? event.metaKey && !event.ctrlKey
            : event.ctrlKey && !event.metaKey;
        const key = event.key.toLocaleLowerCase('en-US');
        if ((currentView.composing || event.isComposing) && (modifier || key === 'pageup' || key === 'pagedown')) {
          event.preventDefault();
          options.onAnnouncement('输入法组合尚未结束，命令已暂缓。', 'busy');
          announceState();
          return true;
        }
        if (modifier && !event.altKey && key === 's' && !event.shiftKey) {
          event.preventDefault();
          void flush();
          return true;
        }
        if (modifier && !event.altKey && key === 'z') {
          event.preventDefault();
          options.onCommand(event.shiftKey ? 'redo' : 'undo');
          return true;
        }
        if (modifier && !event.altKey && key === 'f') {
          event.preventDefault();
          options.onCommand('search');
          return true;
        }
        if (modifier && !event.altKey && key === 'h') {
          event.preventDefault();
          options.onCommand('replace');
          return true;
        }
        if (!modifier && !event.altKey && !event.shiftKey && (key === 'pageup' || key === 'pagedown')) {
          event.preventDefault();
          options.onCommand(key === 'pageup' ? 'previous-window' : 'next-window');
          return true;
        }
        if (deferredNavigationContinuity && !event.altKey && CARET_NAVIGATION_KEYS.has(key)) {
          deferredNavigationContinuity = undefined;
          applyEditableState();
          announceState();
          return false;
        }
        return false;
      },
      mousedown(currentView, event) {
        if (!deferredNavigationContinuity) return false;
        const hit = currentView.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!hit) {
          event.preventDefault();
          return true;
        }
        deferredNavigationContinuity = undefined;
        applyEditableState();
        currentView.dispatch(
          currentView.state.tr.setSelection(TextSelection.near(currentView.state.doc.resolve(hit.pos))).scrollIntoView(),
        );
        currentView.focus();
        announceState();
        event.preventDefault();
        return true;
      },
      compositionstart() {
        composing = true;
        queueMicrotask(announceState);
        return false;
      },
      compositionend() {
        composing = false;
        const waiting = compositionWaiters;
        compositionWaiters = [];
        for (const resolve of waiting) resolve();
        scheduleAutomaticFlush();
        queueMicrotask(announceState);
        return false;
      },
    },
  });
  view.dom.setAttribute('role', 'textbox');
  view.dom.setAttribute('aria-label', '稿件编辑区');
  view.dom.setAttribute('aria-multiline', 'true');
  view.dom.setAttribute('data-testid', 'manuscript-editor');
  applyEditableState();
  announceState();

  return {
    focus: () => view.focus(),
    flush,
    captureContinuity: () => deferredNavigationContinuity ?? captureRenderedContinuity(),
    captureNavigationContinuity: () => deferredNavigationContinuity ?? captureRenderedContinuity(),
    loadWindow: (nextWindow, continuity) => {
      if (destroyed || interrupted || saving || retryRequired || changedBlocks(view.state.doc).length > 0 || composing) return false;
      windowProjection = nextWindow;
      baselines = baselineMap(nextWindow);
      retryPrepared = undefined;
      restoreContinuity(
        makeState(),
        continuity,
        nextWindow.focusBlockId,
        nextWindow.focusGrapheme,
        continuity !== undefined,
      );
      announceState();
      return true;
    },
    loadNavigationWindow: (nextWindow, continuity) => {
      if (destroyed || interrupted || saving || retryRequired || changedBlocks(view.state.doc).length > 0 || composing) return false;
      windowProjection = nextWindow;
      baselines = baselineMap(nextWindow);
      retryPrepared = undefined;
      restoreContinuity(makeState(), continuity, nextWindow.focusBlockId, nextWindow.focusGrapheme, true);
      announceState();
      return true;
    },
    selectRange: (blockId, fromGrapheme, toGrapheme) => {
      if (destroyed || interrupted || saving || retryRequired || changedBlocks(view.state.doc).length > 0 || composing) return false;
      const found = findBlockPosition(view.state.doc, blockId);
      if (!found) return false;
      const text = graphemes(found.node.textContent);
      if (
        !Number.isSafeInteger(fromGrapheme) ||
        !Number.isSafeInteger(toGrapheme) ||
        fromGrapheme < 0 ||
        toGrapheme <= fromGrapheme ||
        toGrapheme > text.length
      ) return false;
      deferredNavigationContinuity = undefined;
      applyEditableState();
      const from = found.position + 1 + text.slice(0, fromGrapheme).join('').length;
      const to = found.position + 1 + text.slice(0, toGrapheme).join('').length;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView());
      view.focus();
      return true;
    },
    currentWindow: () => windowProjection,
    isComposing: () => composing,
    setOperationLocked: (locked) => {
      if (locked) {
        requireEditor(!saving && !retryRequired && !composing && changedBlocks(view.state.doc).length === 0, '无法在未确认本地编辑时锁定稿件。');
      }
      operationLocked = locked;
      applyEditableState();
      announceState();
    },
    interrupt: () => {
      interrupted = true;
      saving = false;
      const waiting = compositionWaiters;
      compositionWaiters = [];
      for (const resolve of waiting) resolve();
      applyEditableState();
      announceState();
      options.onAnnouncement('本地业务服务已中断；未保存文字仍保留在编辑区，但尚未获得持久写入确认。', 'error');
    },
    destroy: () => {
      destroyed = true;
      if (autoFlushTimer !== undefined) window.clearTimeout(autoFlushTimer);
      const waiting = compositionWaiters;
      compositionWaiters = [];
      for (const resolve of waiting) resolve();
      view.destroy();
    },
  };
}
