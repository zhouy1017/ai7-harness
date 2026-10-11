import type { ExemplarBookProjection, ExemplarProjection, RendererApi, ImportedExemplarPreview } from '../shared/protocol.js';

interface Surface {
  api: RendererApi;
  refresh(): Promise<void>;
  status(message: string, state?: 'busy' | 'error'): void;
  error(error: unknown, fallback: string): string;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
}

/** Import is an editor action in the KB, with an attributed earlier Book, never a Book project. */
export function exemplarImportButton(surface: Surface, book: ExemplarBookProjection | null = null): HTMLElement {
  const root = node('div');
  root.className = 'exemplar-import';
  const open = node('button', book === null ? '导入以前图书的范例' : '导入新版本 / 添一种文档');
  open.type = 'button';
  open.dataset['exemplarAction'] = 'import';
  root.append(open);
  open.addEventListener('click', () => {
    open.disabled = true;
    const form = node('form');
    form.className = 'exemplar-import-form';
    const fields = (caption: string, value: string, maximum: number): HTMLInputElement => {
      const label = node('label', caption);
      const input = node('input');
      input.value = value;
      input.maxLength = maximum;
      input.required = true;
      input.disabled = book !== null;
      label.append(input);
      form.append(label);
      return input;
    };
    const title = fields('图书名称', book?.bookTitle ?? '', 180);
    const authors = fields('作者（多人用顿号分开）', book?.authors.join('、') ?? '', 1000);
    const editors = fields('责编（多人用顿号分开）', book?.editors.join('、') ?? '', 1000);
    const typeLabel = node('label', '文档类型');
    const type = node('select');
    type.required = true;
    type.disabled = true;
    // No deliverable type is preselected (Issue #778): until the editor chooses one, the prompt is the only option and
    // 导入范例 stays disabled.
    const unchosen = node('option', '请选择文档类型');
    unchosen.value = '';
    type.replaceChildren(unchosen);
    type.addEventListener('change', () => { submit.disabled = preview === null || type.value === ''; });
    typeLabel.append(type);
    const choose = node('button', '选择文件');
    choose.type = 'button';
    const previewLine = node('p');
    const excerpt = node('pre');
    excerpt.className = 'exemplar-import-excerpt';
    const note = node('p', '导入后学习准入为「仅本社」，可以更改。范例只参照，不复制。');
    const submit = node('button', '导入范例');
    submit.type = 'submit';
    submit.disabled = true;
    const cancel = node('button', '取消');
    cancel.type = 'button';
    form.append(typeLabel, choose, previewLine, excerpt, note, submit, cancel);
    let preview: ImportedExemplarPreview | null = null;
    cancel.addEventListener('click', () => { form.remove(); open.disabled = false; open.focus(); });
    choose.addEventListener('click', async () => {
      choose.disabled = true;
      submit.disabled = true;
      surface.status('正在读取范例文件…', 'busy');
      try {
        preview = await surface.api.previewImportedExemplar();
        if (preview === null) { surface.status('已取消选择'); return; }
        type.replaceChildren(unchosen, ...preview.types.map((entry) => {
          const option = node('option', entry.label);
          option.value = entry.typeId;
          return option;
        }));
        type.value = '';
        type.disabled = false;
        previewLine.textContent = `${preview.displayName} · ${preview.format}`;
        excerpt.textContent = preview.excerpt;
        submit.disabled = true;
        surface.status('范例文件已读取，请填写图书信息、选择文档类型后导入');
      } catch (error) { surface.status(surface.error(error, '无法读取范例文件。'), 'error'); }
      finally { choose.disabled = false; }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (preview === null || submit.disabled) return;
      submit.disabled = true;
      choose.disabled = true;
      cancel.disabled = true;
      surface.status('正在导入范例…', 'busy');
      const names = (value: string): string[] => value.split(/[、,，]/u).map((name) => name.trim()).filter(Boolean);
      try {
        await surface.api.importEarlierExemplar({
          previewId: preview.previewId, bookId: book?.bookId ?? null, bookTitle: title.value,
          authors: names(authors.value), editors: names(editors.value), typeId: type.value,
          expectedVersion: book?.exemplars.find((entry) => entry.typeId === type.value)?.version ?? 0,
        });
        await surface.refresh();
        surface.status('范例已导入');
      } catch (error) {
        surface.status(surface.error(error, '无法导入范例。请重新打开范例列表后再试。'), 'error');
        submit.disabled = false;
        choose.disabled = false;
        cancel.disabled = false;
      }
    });
    root.append(form);
    title.focus();
  });
  return root;
}

/** Every decision pins the exact imported version and the decision count the editor saw. */
export function exemplarEligibility(surface: Surface, exemplar: ExemplarProjection): HTMLElement {
  const root = node('span');
  if (exemplar.imported === undefined) return root;
  const label = node('label', '学习准入');
  const select = node('select');
  for (const [choice, caption] of [['house', '仅本社'], ['excluded', '明确排除'], ['deferred', '稍后决定']] as const) {
    const option = node('option', caption);
    option.value = choice;
    select.append(option);
  }
  select.value = exemplar.eligibility === 'house-only' ? 'house' : exemplar.eligibility;
  label.append(select);
  const save = node('button', '记录学习准入');
  save.type = 'button';
  save.addEventListener('click', async () => {
    save.disabled = true;
    select.disabled = true;
    try {
      await surface.api.decideImportedExemplar({ revisionId: exemplar.revisionId, revisionDigest: exemplar.revisionDigest,
        expectedDecisions: exemplar.imported!.decisions, choice: select.value as 'house' | 'excluded' | 'deferred' });
      await surface.refresh();
      surface.status('学习准入已记录');
    } catch (error) {
      surface.status(surface.error(error, '无法记录学习准入。请重新打开范例列表后再试。'), 'error');
      save.disabled = false;
      select.disabled = false;
    }
  });
  root.append(label, save);
  return root;
}
