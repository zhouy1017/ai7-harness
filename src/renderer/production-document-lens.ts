import type { ProductionDocumentProjection } from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  DOCUMENT_CHANGED_SINCE_DELIVERY,
  DOCUMENT_CHANGED_SINCE_VERSION,
  DOCUMENT_DELIVERIES_HEADING,
  DOCUMENT_LENS_LABEL,
  DOCUMENT_MATERIALS_EMPTY,
  DOCUMENT_MATERIALS_HEADING,
  DOCUMENT_VERSION_CURRENT_MARK,
  DOCUMENT_VERSIONS_HEADING,
  DOCUMENT_VERSIONS_TRUNCATED,
  documentDeliveryExportLine,
  documentDeliveryLine,
  documentVersionLine,
} from './production-document-labels.js';
import { renderDocumentWorkflow, type DocumentWorkflowActions } from './production-document-workflow.js';

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
 * Where a document's text stands against its versions and deliveries, read against the working digest the window holds
 * now (Issue #415 follow-up): the version it stands on, if any, and whether it moved past the latest version or away from
 * every delivered one. The document as 交付物 read it answers exactly while the text is still what it read; after an
 * edit, the digests say it.
 */
export function documentStanding(document: ProductionDocumentProjection, workingDigest: string): {
  current: ProductionDocumentProjection['versions'][number] | null;
  changedSinceVersion: boolean;
  changedSinceDelivery: boolean;
} {
  const current = document.versions.find((version) => version.revisionDigest === workingDigest) ?? null;
  if (workingDigest === document.workingDigest) {
    return { current, changedSinceVersion: document.changedSinceVersion, changedSinceDelivery: document.changedSinceDelivery };
  }
  const delivered = new Set(document.deliveries.map((delivery) => delivery.revisionId));
  return {
    current,
    changedSinceVersion: workingDigest !== document.versions[0]?.revisionDigest,
    changedSinceDelivery: document.deliveries.length > 0 &&
      !document.versions.some((version) => delivered.has(version.revisionId) && version.revisionDigest === workingDigest),
  };
}

/**
 * The right-hand 工作流程 column of a Production Document's surface (DELIV-002). Since S66c the Deliverable Workflow opens
 * it (`renderDocumentWorkflow`): the profile the document follows, `下一项需要处理` and the seven phases with their moves.
 * `版本与交付` then lists the document's versions newest first — the one its working text stands on marked `当前` — and
 * `这份文档的材料` states that none is attached yet. Since S66b the Delivery Records follow the versions, newest first,
 * each with what its export came to, and `交付后有修改` once an edit left every version delivered. The gates join it with
 * S66d.
 *
 * `update` paints it again for the working digest the window holds now, so an edit moves `当前` and the notes as it happens
 * rather than when the document is next opened.
 */
export function renderDocumentLens(
  context: ProductionDocumentContext,
  workflowActions: DocumentWorkflowActions | null = null,
): { element: HTMLElement; update(workingDigest: string): void } {
  const aside = el('aside', 'document-lens');
  aside.setAttribute('aria-label', DOCUMENT_LENS_LABEL);
  aside.dataset['documentId'] = context.document.documentId;
  const workflow = renderDocumentWorkflow(context.document.workflow, workflowActions);
  const versions = el('section', 'document-lens-section document-versions');
  const materials = el('section', 'document-lens-section document-materials');
  materials.append(el('h3', undefined, DOCUMENT_MATERIALS_HEADING), el('p', 'field-note', DOCUMENT_MATERIALS_EMPTY));
  aside.append(el('p', 'section-label', DOCUMENT_LENS_LABEL), workflow.element, versions, materials);
  let painted: string | null = null;
  const paint = (workingDigest: string): void => {
    if (painted === workingDigest) return;
    painted = workingDigest;
    const standing = documentStanding(context.document, workingDigest);
    const versionsHeading = el('h3', undefined, DOCUMENT_VERSIONS_HEADING);
    versionsHeading.id = `document-versions-${context.document.documentId}`;
    versions.setAttribute('aria-labelledby', versionsHeading.id);
    const list = el('ol', 'document-version-list');
    for (const version of context.document.versions) {
      const item = el('li');
      item.dataset['revisionId'] = version.revisionId;
      item.dataset['versionOrdinal'] = String(version.ordinal);
      item.append(el('span', 'document-version-line', documentVersionLine(version.label, localInstantLabel(version.createdAt))));
      if (version === standing.current) {
        item.dataset['versionCurrent'] = 'true';
        item.append(el('span', 'document-version-current', DOCUMENT_VERSION_CURRENT_MARK));
      }
      list.append(item);
    }
    versions.replaceChildren(versionsHeading, list);
    if (context.document.versionsTruncated) versions.append(el('p', 'field-note', DOCUMENT_VERSIONS_TRUNCATED));
    if (standing.changedSinceVersion) versions.append(el('p', 'field-note document-changed', DOCUMENT_CHANGED_SINCE_VERSION));
    if (context.document.deliveries.length > 0) {
      versions.append(el('h4', undefined, DOCUMENT_DELIVERIES_HEADING));
      const deliveries = el('ol', 'document-lens-deliveries');
      for (const delivery of context.document.deliveries) {
        const item = el('li');
        item.dataset['deliveryId'] = delivery.deliveryId;
        item.append(
          el('span', 'document-delivery-record', documentDeliveryLine(delivery, localInstantLabel(delivery.recordedAt))),
          el('span', 'field-note document-delivery-export', documentDeliveryExportLine(delivery)),
        );
        deliveries.append(item);
      }
      versions.append(deliveries);
      if (standing.changedSinceDelivery) versions.append(el('p', 'attention-note document-changed-since-delivery', DOCUMENT_CHANGED_SINCE_DELIVERY));
    }
  };
  paint(context.document.workingDigest);
  return { element: aside, update: paint };
}
