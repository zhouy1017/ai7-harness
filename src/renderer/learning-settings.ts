import type { LearningAskFrequency, PreferencesRendererApi } from '../shared/preferences.js';

/** A persisted frequency only; this slice starts no proactive questions. */
export function mountLearningAskFrequency(root: HTMLElement, api: PreferencesRendererApi): void {
  const section = document.createElement('section'); section.dataset['learningSettings'] = '';
  const label = document.createElement('label'); label.textContent = '学习代理主动询问原因';
  const select = document.createElement('select'); select.dataset['learningAskFrequency'] = ''; select.disabled = true;
  for (const [value, text] of [['often', '经常'], ['occasionally', '偶尔'], ['off', '关闭']] as const) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
  }
  const note = document.createElement('p'); note.textContent = '设置以后可出现的轻问频率；当前版本尚不会主动询问。';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  label.append(select); section.append(label, note, status);
  (root.querySelector('[data-settings-group="editorial"]') ?? root).append(section);
  let previous: LearningAskFrequency = 'occasionally';
  void api.getPreferences().then((page) => { previous = page.values['learning.askFrequency']; select.value = previous; select.disabled = false; })
    .catch(() => { status.textContent = '无法读取学习询问设置。'; });
  select.addEventListener('change', () => {
    select.disabled = true;
    void api.savePreference({ key: 'learning.askFrequency', value: select.value as LearningAskFrequency })
      .then((page) => { previous = page.values['learning.askFrequency']; status.textContent = '学习询问设置已保存。'; })
      .catch(() => { status.textContent = '无法保存学习询问设置。'; })
      .finally(() => { select.value = previous; select.disabled = false; });
  });
}
