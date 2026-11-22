import type { RendererApi } from '../shared/protocol.js';

/**
 * Put plain text on the clipboard (Issue #951, 复制受影响内容): the document's copy command over a detached field, else the
 * window's own copy through main. The page holds no clipboard permission, so `navigator.clipboard` is not used.
 */
export async function copyPlainText(api: Pick<RendererApi, 'runEditorClipboardCommand'>, text: string): Promise<void> {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.className = 'clipboard-carrier';
  field.setAttribute('aria-hidden', 'true');
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    if (!document.execCommand('copy')) await api.runEditorClipboardCommand({ command: 'copy' });
  } finally {
    field.remove();
    returnFocus?.focus({ preventScroll: true });
  }
}
