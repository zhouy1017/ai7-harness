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

/** How long the lens waits after the last edit or mark change before it reads the document again, as the rail does. */
const DOCUMENT_READ_DELAY_MS = 1_200;

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
 * rather than when the document is next opened. What the workflow waits on — 有修改尚未保存为版本, N 条修改建议待处理 —
 * is the service's reading of the document as it stands, so an edit, or a mark change (`refresh`), can change it with no
 * phase moving: the lens then reads the document again once the editor rests, never per keystroke, and paints what the
 * service answers. Only the newest read paints, and one that fails leaves the lens as it last read; the next edit or mark
 * change reads again.
 */
export function renderDocumentLens(
  context: ProductionDocumentContext,
  workflowActions: DocumentWorkflowActions | null = null,
): { element: HTMLElement; update(workingDigest: string): void; refresh(): void } {
  const aside = el('aside', 'document-lens');
  aside.setAttribute('aria-label', DOCUMENT_LENS_LABEL);
  aside.dataset['documentId'] = context.document.documentId;
  const workflow = renderDocumentWorkflow(context.document.workflow, workflowActions);
  const versions = el('section', 'document-lens-section document-versions');
  const materials = el('section', 'document-lens-section document-materials');
  materials.append(el('h3', undefined, DOCUMENT_MATERIALS_HEADING), el('p', 'field-note', DOCUMENT_MATERIALS_EMPTY));
  aside.append(el('p', 'section-label', DOCUMENT_LENS_LABEL), workflow.element, versions, materials);
  // The document as the service last answered, and the working digest the window holds now.
  let shown = context.document;
  let workingDigest = shown.workingDigest;
  let painted: { document: ProductionDocumentProjection; workingDigest: string } | null = null;
  const paint = (): void => {
    if (painted !== null && painted.document === shown && painted.workingDigest === workingDigest) return;
    painted = { document: shown, workingDigest };
    const standing = documentStanding(shown, workingDigest);
    const versionsHeading = el('h3', undefined, DOCUMENT_VERSIONS_HEADING);
    versionsHeading.id = `document-versions-${shown.documentId}`;
    versions.setAttribute('aria-labelledby', versionsHeading.id);
    const list = el('ol', 'document-version-list');
    for (const version of shown.versions) {
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
    if (shown.versionsTruncated) versions.append(el('p', 'field-note', DOCUMENT_VERSIONS_TRUNCATED));
    if (standing.changedSinceVersion) versions.append(el('p', 'field-note document-changed', DOCUMENT_CHANGED_SINCE_VERSION));
    if (shown.deliveries.length > 0) {
      versions.append(el('h4', undefined, DOCUMENT_DELIVERIES_HEADING));
      const deliveries = el('ol', 'document-lens-deliveries');
      for (const delivery of shown.deliveries) {
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
  let readTimer: number | undefined;
  let reads = 0;
  const refresh = (): void => {
    if (workflowActions === null) return;
    const actions = workflowActions;
    if (readTimer !== undefined) window.clearTimeout(readTimer);
    readTimer = window.setTimeout(() => {
      readTimer = undefined;
      if (!aside.isConnected) return;
      const read = ++reads;
      void actions.read().then((fresh) => {
        if (read !== reads || fresh === null || fresh.documentId !== shown.documentId || !aside.isConnected) return;
        shown = fresh;
        workflow.paint(fresh.workflow);
        paint();
      }, () => undefined);
    }, DOCUMENT_READ_DELAY_MS);
  };
  paint();
  return {
    element: aside,
    update(next) {
      if (next === workingDigest) return;
      workingDigest = next;
      paint();
      refresh();
    },
    refresh,
  };
}
