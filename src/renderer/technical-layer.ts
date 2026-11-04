import type { DistributionChannel, TrustedOperationalScope } from '../shared/protocol.js';

/** Presentation only: never changes a service record, model binding or exported document. */
export let technicalLayerVisible = true;
const PREFERENCE = 'ai7.technicalLayerVisible';

export function initializeTechnicalLayer(channel: DistributionChannel, storage: Pick<Storage, 'getItem'>, scope: TrustedOperationalScope | null = 'development-ci'): void {
  const saved = storage.getItem(PREFERENCE);
  setTechnicalLayerVisible(saved === null ? channel === 'source-checkout' && (scope === 'development-ci' || scope === 'developer-live') : saved === 'true');
}

export function setTechnicalLayerVisible(visible: boolean): void {
  technicalLayerVisible = visible;
  if (typeof document !== 'undefined' && document.documentElement !== undefined) document.documentElement.dataset['technicalLayerVisible'] = String(visible);
}

export function saveTechnicalLayerVisible(visible: boolean, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(PREFERENCE, String(visible));
  setTechnicalLayerVisible(visible);
}

/** Only UI metadata passes here; manuscript text, findings, file names and user inputs do not. */
export function metadataWords(text: string): string {
  if (technicalLayerVisible) return text;
  return text
    .replace(/（第\s*\d+\s*版）/gu, '')
    .replace(/第\s*\d+\s*版/gu, '版本')
    .replace(/版本\s*\d+(?:\.\d+)*(?:[-+][A-Za-z0-9.-]+)?/gu, '版本')
    .replace(/\b(?:Revision\s+\d+|r\d+)\b/giu, '修订版')
    .replace(/修订版\s+修订版/gu, '修订版')
    .replace(/(?:修订日志序号|预计修订日志序号)\s*\d+/gu, '修订日志')
    .replace(/\bv\d{1,3}\b/gu, '')
    .replace(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/gu, '')
    .replace(/ordinary-production|developer-live|development-ci/gu, '')
    .replace(/\b(?:gpt|claude|deepseek|gemini)-[\w.-]+/giu, (model) => model.split('-').join(' '))
    .replace(/\b[0-9a-f]{8,}(?:-[0-9a-f-]+)?\b/giu, '')
    .replace(/主分支/gu, '稿件')
    .replace(/\d+\.\d+%/gu, (percent) => `${Math.round(Number(percent.slice(0, -1)))}%`)
    .replace(/(?:来源|暂存来源|保留)?字节数[：:]?\s*\d+/gu, '')
    .replace(/\s*·\s*·\s*/gu, ' · ').replace(/^[\s·]+|[\s·]+$/gu, '');
}

/** Empty when disabled, so even textContent and accessibility traversal see no technical payload. */
export function technicalDisclosure<T extends HTMLElement>(node: T): T {
  node.dataset['technicalLayer'] = 'true';
  if (!technicalLayerVisible) node.replaceChildren();
  return node;
}

/** One page control governs disclosures while their content keeps its owning card and lifecycle. */
export function collectTechnicalDisclosures(root: HTMLElement): void {
  const sections = Array.from(root.querySelectorAll<HTMLDetailsElement>('[data-technical-layer="true"]'));
  let collection = root.querySelector<HTMLDetailsElement>('[data-technical-collection]');
  if (!technicalLayerVisible) {
    for (const section of sections) section.remove();
    collection?.remove();
    return;
  }
  if (sections.length === 0) { collection?.remove(); return; }
  if (sections.length === 1 && collection === null) return;
  if (collection === null) {
    collection = document.createElement('details');
    collection.className = 'technical-details technical-layer-control';
    collection.dataset['technicalCollection'] = 'true';
    const summary = document.createElement('summary');
    summary.textContent = '查看技术详情';
    collection.append(summary);
    collection.addEventListener('toggle', () => collectTechnicalDisclosures(root));
    root.append(collection);
  }
  for (const section of sections) {
    const summary = section.querySelector('summary');
    if (summary !== null && !summary.hidden) {
      summary.textContent = '记录信息';
      summary.hidden = true;
    }
    section.open = true;
    section.hidden = !collection.open;
  }
}

/** Existing technical-identity spans also occur beside ordinary dates, outside disclosures. */
export function identityWords(text: string, className?: string): string {
  return !technicalLayerVisible && className?.split(/\s+/u).includes('technical-identity') ? '' : text;
}
