import type { ProductionDocumentProjection } from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  DOCUMENT_CHANGED_SINCE_VERSION,
  DOCUMENT_LENS_LABEL,
  DOCUMENT_MATERIALS_EMPTY,
  DOCUMENT_MATERIALS_HEADING,
  DOCUMENT_VERSION_CURRENT_MARK,
  DOCUMENT_VERSIONS_HEADING,
  DOCUMENT_VERSIONS_TRUNCATED,
  documentVersionLine,
} from './production-document-labels.js';

/** The Production Document a surface shows (Issue #415): its house type and the document as 交付物 read it. */
export interface ProductionDocumentContext {
  typeId: string;
  typeLabel: string;
  document: ProductionDocumentProjection;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The right-hand 工作流程 column of a Production Document's surface (DELIV-002), as far as S66a reaches: `版本与交付`
 * lists the document's versions newest first — the one its working text stands on marked `当前` — and
 * `这份文档的材料` states that none is attached yet. The seven phases, `下一项需要处理` and the gates join it with the
 * Deliverable Workflow Lens (S66c, S66d), and the Delivery Records with 交付 (S66b).
 */
export function renderDocumentLens(context: ProductionDocumentContext): { element: HTMLElement } {
  const aside = el('aside', 'document-lens');
  aside.setAttribute('aria-label', DOCUMENT_LENS_LABEL);
  aside.dataset['documentId'] = context.document.documentId;
  const versions = el('section', 'document-lens-section document-versions');
  const versionsHeading = el('h3', undefined, DOCUMENT_VERSIONS_HEADING);
  versionsHeading.id = `document-versions-${context.document.documentId}`;
  versions.setAttribute('aria-labelledby', versionsHeading.id);
  versions.append(versionsHeading);
  const list = el('ol', 'document-version-list');
  context.document.versions.forEach((version, index) => {
    const item = el('li');
    item.dataset['revisionId'] = version.revisionId;
    item.dataset['versionOrdinal'] = String(version.ordinal);
    item.append(el('span', 'document-version-line', documentVersionLine(version.label, localInstantLabel(version.createdAt))));
    if (index === 0 && !context.document.changedSinceVersion) {
      item.dataset['versionCurrent'] = 'true';
      item.append(el('span', 'document-version-current', DOCUMENT_VERSION_CURRENT_MARK));
    }
    list.append(item);
  });
  versions.append(list);
  if (context.document.versionsTruncated) versions.append(el('p', 'field-note', DOCUMENT_VERSIONS_TRUNCATED));
  if (context.document.changedSinceVersion) versions.append(el('p', 'field-note document-changed', DOCUMENT_CHANGED_SINCE_VERSION));
  const materials = el('section', 'document-lens-section document-materials');
  materials.append(el('h3', undefined, DOCUMENT_MATERIALS_HEADING), el('p', 'field-note', DOCUMENT_MATERIALS_EMPTY));
  aside.append(el('p', 'section-label', DOCUMENT_LENS_LABEL), versions, materials);
  return { element: aside };
}
