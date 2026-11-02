import type { DOMOutputSpec, Node as ProseMirrorNode } from 'prosemirror-model';
import type { ManuscriptBlockProjection, ManuscriptSourceDisplay } from '../shared/protocol/manuscript-notes.js';
import type { RendererApi } from '../shared/protocol.js';

export const SOURCE_OBJECT_LABEL = '只读 · 导出时从原文件完整恢复';

export function sourceNodeKind(block: ManuscriptBlockProjection): string {
  return block.sourceDisplay?.table ? 'table' : block.sourceDisplay?.images.length ? 'image' : block.kind;
}

function imageDom(image: ManuscriptSourceDisplay['images'][number]): DOMOutputSpec {
  // Only locally decoded, passive raster images may become a renderer URL. SVG/HTML and external relationships stay with the source.
  const safe = image.dataUrl !== null && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl);
  return ['figure', { class: 'manuscript-source-image', contenteditable: 'false' },
    safe ? ['img', { src: image.dataUrl!, alt: image.label, draggable: 'false' }] : image.sourceImage
      ? ['img', { alt: image.label, 'data-source-image': String(image.sourceImage.ordinal), 'data-source-version': image.sourceImage.sourceVersionId, draggable: 'false' }]
      : ['p', {}, '此图片格式无法预览；原图随导出保留。'],
    ['figcaption', {}, SOURCE_OBJECT_LABEL]];
}

/** Large raster media arrives in bounded IPC frames and becomes a local blob, outside the manuscript window's text budget. */
export function observeSourceImages(host: HTMLElement, read: RendererApi['readManuscriptImageChunk'],
  binding: () => { manuscriptId: string; branchId: string }): () => void {
  const started = new WeakSet<HTMLImageElement>();
  const urls = new Set<string>();
  let stopped = false;
  const load = async (img: HTMLImageElement): Promise<void> => {
    const { manuscriptId, branchId } = binding();
    const pin = { manuscriptId, branchId, sourceVersionId: img.dataset['sourceVersion']!, ordinal: Number(img.dataset['sourceImage']) };
    const parts: ArrayBuffer[] = [];
    let offset = 0;
    let mime = '';
    try {
      do {
        const chunk = await read({ ...pin, offset });
        if (stopped || !host.contains(img)) return;
        if (!/^image\/(?:png|jpeg|gif|webp)$/.test(chunk.mime)) return;
        mime = chunk.mime;
        const bytes = Uint8Array.from(atob(chunk.base64), (char) => char.charCodeAt(0));
        if (bytes.length === 0 || chunk.totalBytes > 64 * 1024 * 1024) return;
        parts.push(bytes.buffer);
        offset += bytes.length;
        if (offset >= chunk.totalBytes) break;
      } while (!stopped);
      const url = URL.createObjectURL(new Blob(parts, { type: mime }));
      urls.add(url);
      const release = (): void => { URL.revokeObjectURL(url); urls.delete(url); };
      img.onload = release;
      img.onerror = release;
      img.src = url;
    } catch {
      img.alt = '图片暂时无法预览；原图随导出保留。';
    }
  };
  const scan = (): void => {
    for (const img of host.querySelectorAll<HTMLImageElement>('img[data-source-image]')) {
      if (started.has(img)) continue;
      started.add(img);
      void load(img);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(host, { childList: true, subtree: true });
  scan();
  return () => { stopped = true; observer.disconnect(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
}

/** Existing paragraph identities stay in the document; table cell text is hidden behind one read-only table preview. */
export function sourceBlockDom(node: ProseMirrorNode): DOMOutputSpec {
  const display = node.attrs['sourceDisplay'] as ManuscriptSourceDisplay;
  const table = display.table;
  const kind = String(node.attrs['sourceKind']);
  const tag = kind === 'title' ? 'h1' : kind === 'heading' ? `h${Math.min(6, Number(node.attrs['level']) + 1)}` : 'div';
  return ['div', { 'data-block-id': String(node.attrs['blockId']), 'data-block-kind': table ? 'table' : 'image',
    class: table?.continuation && display.images.length === 0 ? 'manuscript-table-continuation' : 'manuscript-source-block', ...(table ? { contenteditable: 'false' } : {}) },
    ...display.images.filter((image) => image.before).map(imageDom),
    [tag, { class: table ? 'manuscript-table-source-text' : 'manuscript-image-paragraph' }, 0],
    ...((node.attrs['noteLinks'] as ManuscriptBlockProjection['noteLinks']) ?? []).map((link): DOMOutputSpec =>
      ['sup', { contenteditable: 'false', 'data-note-reference': link.blockId, role: 'link', tabindex: '0',
        'aria-label': `跳转到${link.part === 'footnote' ? '脚注' : '尾注'} ${link.ordinal}` }, String(link.ordinal)]),
    ...(table && !table.continuation ? [
      ['div', { class: 'manuscript-source-label', contenteditable: 'false' }, `表格 · ${SOURCE_OBJECT_LABEL}`] as DOMOutputSpec,
      ['table', { class: 'manuscript-source-table', contenteditable: 'false' }, ['tbody', {},
        ...table.rows.map((row): DOMOutputSpec => ['tr', {}, ...row.map((cell): DOMOutputSpec => ['td', {}, cell])])]] as DOMOutputSpec,
      ...(table.truncated ? [['p', { class: 'field-note', contenteditable: 'false' }, '当前显示表格预览；完整结构和内容随 DOCX 导出保留。'] as DOMOutputSpec] : []),
    ] : []),
    ...display.images.filter((image) => !image.before).map(imageDom)];
}
