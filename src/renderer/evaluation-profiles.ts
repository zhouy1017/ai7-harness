import type { EvaluationProfileProjection, EvaluationProfilesProjection, RendererApi, SaveEvaluationProfileInput } from '../shared/protocol.js';
import { evaluationBandLine, evaluationItemLegend, evaluationProfilePill, evaluationProfileUse } from './evaluation-labels.js';

export const PROFILE_PROSPECTIVE = '新版本只用于之后准备的初评和新建的评估，已有记录保留当时的方案。';
export const PROFILE_CALIBRATION = '改名或修改说明保留该项的校准依据；移除的项不再用于新评估，新增的项等待自己的调分依据。项数变化时，原有项的校准偏移按新的满分折算。';
export const PROFILE_ITEM_COUNT = '评分项数需要能把 100 分平均分成整数：1、2、4、5 或 10 项。';
export function profileEditInput(profile: EvaluationProfileProjection): SaveEvaluationProfileInput {
  return { expectedSha256: profile.sha256, items: profile.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })), readiness: [...profile.readiness ?? []] };
}
export function profileFullMarks(count: number): number | null {
  return [1, 2, 4, 5, 10].includes(count) ? 100 / count : null;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, css?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (css !== undefined) node.className = css;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, action: () => void, name: string): HTMLButtonElement {
  const node = el('button', 'quiet', text);
  node.type = 'button';
  node.dataset['profileAction'] = name;
  node.addEventListener('click', action);
  return node;
}

/** House edits create versions; the draft stays on screen on a refusal, including a stale-window refusal. */
export function renderEvaluationProfiles(root: HTMLElement, projection: EvaluationProfilesProjection, options: {
  api: Pick<RendererApi, 'saveEvaluationProfile' | 'inspectEvaluationProfiles'>;
  status: (text: string, state?: 'busy' | 'error') => void;
  error: (error: unknown, fallback: string) => string;
}): void {
  root.replaceChildren();
  root.dataset['evaluationProfiles'] = String(projection.profiles.length);
  const active = projection.activeSha256 ?? projection.profiles[0]?.sha256;
  root.append(el('p', 'field-note', PROFILE_PROSPECTIVE));
  for (const profile of projection.profiles) {
    const card = el('article', 'evaluation-profile');
    card.dataset['profileId'] = profile.profileId;
    card.dataset['profileRecords'] = String(profile.records);
    card.dataset['profileVersion'] = profile.version;
    const current = profile.sha256 === active;
    const heading = el('div', 'guideline-heading');
    heading.append(el('h3', undefined, profile.title), el('span', 'status-pill evaluation-profile-pill', evaluationProfilePill(profile)));
    if (current) heading.append(el('span', 'status-pill', '当前使用'));
    const items = el('ul', 'evaluation-profile-items');
    for (const item of profile.items) {
      const li = el('li', undefined, evaluationItemLegend(item));
      if (item.description) li.append(el('p', 'field-note', item.description));
      items.append(li);
    }
    const bands = el('ul', 'evaluation-profile-bands');
    for (const band of profile.bands) bands.append(el('li', undefined, evaluationBandLine(band)));
    const readiness = el('ul', 'evaluation-profile-readiness');
    for (const item of profile.readiness ?? []) readiness.append(el('li', undefined, item));
    const details = el('details', 'technical-details');
    const facts = el('dl', 'evaluation-profile-facts');
    facts.append(el('dt', undefined, '评估方案摘要'), el('dd', 'technical-identity', profile.sha256));
    details.append(el('summary', undefined, '查看技术详情'), facts);
    card.append(heading, el('p', 'field-note evaluation-profile-use', evaluationProfileUse(profile)),
      el('h4', undefined, `评分项 · 总分 ${profile.total}`), items,
      el('h4', undefined, '档位'), bands,
      el('h4', undefined, '风险项（低 / 中 / 高，不计入总分）'), el('p', 'evaluation-profile-risks', profile.risks.map((risk) => risk.label).join('、')),
      el('h4', undefined, '结论'), el('p', 'evaluation-profile-conclusions', profile.conclusions.map((entry) => entry.label).join(' · ')),
      el('h4', undefined, '就绪清单'), readiness, ...(readiness.childElementCount === 0 ? [el('p', 'field-note', '尚未设置默认就绪清单。')] : []), details);
    if (current) {
      const start = button('新建版本', () => {
        start.disabled = true;
        const form = editForm(profile, async (input) => {
          const saved = await options.api.saveEvaluationProfile(input);
          if (root.isConnected) renderEvaluationProfiles(root, saved, options);
          options.status('评估方案新版本已保存');
        }, () => { form.remove(); start.disabled = false; start.focus(); }, options.error);
        card.append(form);
        form.querySelector('input')?.focus();
      }, 'new-version');
      card.append(start);
    }
    root.append(card);
  }
  const page = (before: number | null): void => {
    options.status('正在读取评估方案…', 'busy');
    void options.api.inspectEvaluationProfiles({ before }).then((next) => {
      if (root.isConnected) renderEvaluationProfiles(root, next, options);
      options.status('评估方案已打开');
    }).catch((error: unknown) => options.status(options.error(error, '无法读取评估方案。'), 'error'));
  };
  if (projection.nextBefore != null) root.append(button('更早版本', () => page(projection.nextBefore!), 'earlier'));
  if (!projection.profiles.some((profile) => profile.sha256 === active)) root.append(button('返回当前版本', () => page(null), 'current'));
}

function editForm(profile: EvaluationProfileProjection, save: (input: SaveEvaluationProfileInput) => Promise<void>, cancel: () => void,
  errorMessage: (error: unknown, fallback: string) => string): HTMLFormElement {
  const initial = profileEditInput(profile);
  const draft = initial.items.map((item) => ({ ...item }));
  const form = el('form', 'evaluation-profile-form');
  form.dataset['profileEdit'] = '';
  form.append(el('h4', undefined, '新建评估方案版本'), el('p', 'field-note', PROFILE_PROSPECTIVE), el('p', 'field-note', PROFILE_CALIBRATION));
  const fields = el('div', 'evaluation-profile-fields');
  const count = el('p', 'field-note');
  const refusal = el('p', 'attention-note');
  refusal.setAttribute('role', 'alert');
  const saveButton = button('保存为新版本', () => undefined, 'save');
  saveButton.type = 'submit';
  saveButton.className = 'primary';
  const paintItems = (): void => {
    fields.replaceChildren();
    const marks = profileFullMarks(draft.length);
    count.textContent = marks === null ? PROFILE_ITEM_COUNT : `${draft.length} 个评分项 · 每项满分 ${marks} · 总分 100`;
    saveButton.disabled = marks === null;
    draft.forEach((item, index) => {
      const row = el('fieldset', 'evaluation-profile-edit-item');
      row.append(el('legend', undefined, `评分项 ${index + 1}${marks === null ? '' : ` · 满分 ${marks}`}`));
      const name = el('input');
      name.value = item.label;
      name.dataset['profileField'] = 'label';
      name.required = true;
      name.addEventListener('input', () => { item.label = name.value; });
      const description = el('textarea');
      description.rows = 3;
      description.value = item.description;
      description.dataset['profileField'] = 'description';
      description.addEventListener('input', () => { item.description = description.value; });
      const nameLabel = el('label', undefined, '名称（最多 40 字）');
      nameLabel.append(name);
      const descriptionLabel = el('label', undefined, '说明（最多 500 字）');
      descriptionLabel.append(description);
      const remove = button('移除', () => { draft.splice(index, 1); paintItems(); }, 'remove-item');
      remove.disabled = draft.length === 1;
      row.append(nameLabel, descriptionLabel, remove);
      fields.append(row);
    });
  };
  const add = button('添加评分项', () => {
    if (draft.length >= 10) { refusal.textContent = '评分项最多 10 项。'; return; }
    draft.push({ itemId: null, label: '', description: '' });
    paintItems();
    fields.querySelectorAll('input').item(draft.length - 1)?.focus();
  }, 'add-item');
  const readinessLabel = el('label', undefined, '就绪清单（每行一项，最多 20 项，每项最多 200 字）');
  const readiness = el('textarea');
  readiness.dataset['profileField'] = 'readiness';
  readiness.rows = 5;
  readiness.value = initial.readiness.join('\n');
  readinessLabel.append(readiness);
  const actions = el('div', 'button-row');
  actions.append(saveButton, button('取消', cancel, 'cancel'));
  form.append(count, fields, add, readinessLabel, refusal, actions);
  paintItems();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (saveButton.disabled) return;
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input, button, textarea')];
    for (const control of controls) control.disabled = true;
    refusal.textContent = '';
    void save({ expectedSha256: initial.expectedSha256, items: draft.map((item) => ({ ...item })), readiness: readiness.value.split('\n').map((line) => line.trim()).filter(Boolean) })
      .catch((error: unknown) => { refusal.textContent = errorMessage(error, '无法保存评估方案。'); })
      .finally(() => { for (const control of controls) control.disabled = false; paintItems(); });
  });
  return form;
}
