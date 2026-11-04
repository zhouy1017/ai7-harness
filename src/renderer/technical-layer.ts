import type { DistributionChannel, TrustedOperationalScope } from '../shared/protocol.js';

/** Presentation only: never changes a service record, model binding or exported document. */
export let technicalLayerVisible = false;
export let technicalLayerReady = false;
const PREFERENCE = 'ai7.technicalLayerVisible';

export function initializeTechnicalLayer(channel: DistributionChannel, storage: Pick<Storage, 'getItem'>, scope: TrustedOperationalScope | null = 'development-ci'): void {
  resetTechnicalLayer();
  const saved = storage.getItem(PREFERENCE);
  setTechnicalLayerVisible(saved === null ? channel === 'source-checkout' && (scope === 'development-ci' || scope === 'developer-live') : saved === 'true');
  technicalLayerReady = true;
}

export function resetTechnicalLayer(): void {
  setTechnicalLayerVisible(false);
  technicalLayerReady = false;
}

export function setTechnicalLayerVisible(visible: boolean): void {
  technicalLayerVisible = visible;
  if (typeof document !== 'undefined' && document.documentElement !== undefined) document.documentElement.dataset['technicalLayerVisible'] = String(visible);
}

export function saveTechnicalLayerVisible(visible: boolean, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(PREFERENCE, String(visible));
  setTechnicalLayerVisible(visible);
}

/** Explicit renderer-composed metadata fragment; never parse or rewrite editor/source text. */
export function technicalWords(fragment: string, ordinary = ''): string {
  return technicalLayerVisible ? fragment : ordinary;
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

/** Account discoveries sometimes use the raw ID as their label; ordinary settings show readable words. */
export function modelLabelWords(model: { modelId: string; modelLabel: string }): string {
  if (technicalLayerVisible) return model.modelLabel;
  const label = model.modelLabel === model.modelId ? model.modelId.split(/[-_/:]+/u)
    .map((word) => /^(gpt|glm)$/iu.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : model.modelLabel;
  return label;
}
