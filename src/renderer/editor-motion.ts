import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** Transient paint only: no journal or editorial mark is created by a jump or an Apply highlight. */
export const EDITOR_MOTION_META = 'ai7-editor-motion';
export interface EditorMotion {
  blockId: string;
  range?: { fromGrapheme: number; toGrapheme: number };
}

export function editorMotionPlugin(): Plugin<DecorationSet> {
  const plugin = new Plugin<DecorationSet>({
    state: {
      init: () => DecorationSet.empty,
      apply: (transaction, previous) => {
        const motion = transaction.getMeta(EDITOR_MOTION_META) as EditorMotion | null | undefined;
        if (motion === null) return DecorationSet.empty;
        if (motion === undefined) return previous.map(transaction.mapping, transaction.doc);
        const decorations: Decoration[] = [];
        transaction.doc.forEach((node, offset) => {
          if (node.attrs['blockId'] !== motion.blockId) return;
          if (motion.range === undefined) {
            decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'manuscript-jump-highlight' }));
          } else {
            const parts = Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(node.textContent), ({ segment }) => segment);
            const from = offset + 1 + parts.slice(0, motion.range.fromGrapheme).join('').length;
            const to = offset + 1 + parts.slice(0, motion.range.toGrapheme).join('').length;
            if (to > from) decorations.push(Decoration.inline(from, to, { class: 'manuscript-applied-highlight' }));
          }
        });
        return DecorationSet.create(transaction.doc, decorations);
      },
    },
    props: { decorations(state) { return this.getState(state); } },
    view: (view) => {
      let held = DecorationSet.empty;
      let timer: ReturnType<typeof setTimeout> | undefined;
      return {
        update: () => {
          const next = plugin.getState(view.state) ?? DecorationSet.empty;
          if (held === next) return;
          held = next;
          clearTimeout(timer);
          if (next !== DecorationSet.empty) timer = setTimeout(() => {
            view.dispatch(view.state.tr.setMeta(EDITOR_MOTION_META, null));
          }, 1_200);
        },
        destroy: () => clearTimeout(timer),
      };
    },
  });
  return plugin;
}
