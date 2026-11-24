import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelServiceSupportedEfforts } from '../../src/shared/protocol.js';
import { MODEL_DEFAULT_EFFORT, effortChoices, paintEffortChoices } from '../../src/renderer/model-effort.js';
import { effortValueLabel } from '../../src/renderer/model-effort-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

// 思考强度's list, built from the model service's own per-model projection (0.8.0 stage one). Every projection is synthetic.
const discovered = { kind: 'discovered', observedAt: '2026-11-24T08:00:00.000Z' } as const;
const documented = { kind: 'documented', source: 'https://vendor.example/thinking', readOn: '2026-11-14' } as const;
const supported = (levels: readonly string[], completeness: 'complete' | 'partial' = 'complete', provenance: ModelServiceSupportedEfforts['provenance'] = discovered): ModelServiceSupportedEfforts =>
  ({ status: 'supported', levels, completeness, provenance });
const unsupported: ModelServiceSupportedEfforts = { status: 'unsupported', levels: [], completeness: 'complete', provenance: documented };
const labels = (choices: ReturnType<typeof effortChoices>) => choices.options.map((option) => option.label);
const values = (choices: ReturnType<typeof effortChoices>) => choices.options.map((option) => option.value);

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { setTechnicalLayerVisible(false); restore(); });

describe('the 思考强度 list of one model', () => {
  it('puts 模型默认 first and then only the model\'s own levels, least to most, in ordinary words', () => {
    const choices = effortChoices(supported(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']), undefined);
    expect(values(choices)).toEqual([MODEL_DEFAULT_EFFORT, 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(labels(choices)).toEqual(['模型默认', '不启用思考', '最少', '低', '中', '高', '更高', '最高']);
    expect(choices).toMatchObject({ selected: 'off', stale: false, state: 'levels', note: '', detail: '' });
    // The order is the service's: a shorter list is not padded from any general table.
    expect(labels(effortChoices(supported(['low', 'high', 'max']), 'high'))).toEqual(['模型默认', '低', '高', '最高']);
    expect(effortChoices(supported(['low', 'high', 'max']), 'high')).toMatchObject({ selected: 'high', stale: false });
  });

  it('offers only 模型默认, with the reason, when nothing is known or nothing can be set', () => {
    expect(effortChoices(undefined, undefined)).toMatchObject({ state: 'unknown', selected: 'off', stale: false, note: '还没有查到这个模型的可选强度。' });
    expect(labels(effortChoices(undefined, 'off'))).toEqual(['模型默认']);
    expect(effortChoices(unsupported, undefined)).toMatchObject({ state: 'unsupported', selected: 'off', stale: false, note: '这个模型不能单独设置思考强度。' });
    expect(values(effortChoices(unsupported, undefined))).toEqual(['off']);
  });

  it('keeps a saved level the model does not offer, last and chosen, and asks for a new choice', () => {
    const stale = effortChoices(supported(['low', 'high']), 'xhigh');
    expect(values(stale)).toEqual(['off', 'low', 'high', 'xhigh']);
    expect(labels(stale).at(-1)).toBe('更高（现在不可用）');
    expect(stale).toMatchObject({ selected: 'xhigh', stale: true, note: '之前选的强度现在不可用，请重新选择。' });
    // A model with no evidence, or one that takes none, also keeps the saved level in view instead of dropping it.
    expect(effortChoices(undefined, 'high')).toMatchObject({ selected: 'high', stale: true, note: '之前选的强度现在不可用，请重新选择。' });
    expect(values(effortChoices(unsupported, 'high'))).toEqual(['off', 'high']);
    // A name with no ordinary word of its own is not shown to the editor.
    expect(labels(effortChoices(supported(['low']), 'vendor-future-level')).at(-1)).toBe('之前选的强度（现在不可用）');
  });

  it('shows a documented numeric budget without a unit word in ordinary mode', () => {
    expect(labels(effortChoices(supported(['128', '8192']), '8192'))).toEqual(['模型默认', '思考上限 128', '思考上限 8192']);
    expect(effortValueLabel('8192')).toBe('思考上限 8192');
    setTechnicalLayerVisible(true);
    expect(labels(effortChoices(supported(['8192']), undefined))).toEqual(['模型默认', '思考上限 8192 词元']);
  });

  it('adds the service\'s names, the route, the source and its date in developer mode only', () => {
    expect(effortChoices(supported(['low', 'high'], 'partial', documented), 'high', 'deepseek-open-platform').detail).toBe('');
    setTechnicalLayerVisible(true);
    expect(labels(effortChoices(supported(['none', 'xhigh']), undefined))).toEqual(['模型默认', '不启用思考（none）', '更高（xhigh）']);
    expect(effortChoices(supported(['low', 'high'], 'partial', documented), 'high', 'deepseek-open-platform').detail)
      .toBe('路线 deepseek-open-platform · low / high · 来自服务文档 https://vendor.example/thinking，2026-11-14 读到；列表可能不完整');
    expect(effortChoices(supported(['low']), undefined, 'opencode-go').detail).toBe('路线 opencode-go · low · 来自账号的模型列表，2026-11-24T08:00:00.000Z 查到');
    expect(effortChoices(undefined, undefined, 'opencode-go').detail).toBe('路线 opencode-go · 没有可选强度的记录');
    expect(effortChoices(supported(['low']), 'vendor-future-level').options.at(-1)!.label).toBe('vendor-future-level（现在不可用）');
    expect(effortValueLabel('off')).toBe('模型默认');
    expect(effortValueLabel('high')).toBe('高（high）');
  });

  it('paints the list, what is chosen and the note', () => {
    const select = document.createElement('select'), note = document.createElement('p');
    paintEffortChoices(select, note, effortChoices(supported(['low', 'high']), 'max'));
    const options = (select as unknown as MiniElement).querySelectorAll('option');
    expect(options.map((option) => [option.value, option.textContent])).toEqual([['off', '模型默认'], ['low', '低'], ['high', '高'], ['max', '最高（现在不可用）']]);
    expect(select.value).toBe('max');
    expect(select.dataset['effortState']).toBe('stale');
    expect(note.hidden).toBe(false);
    expect((note as unknown as MiniElement).querySelector('[data-effort-note="stale"]')!.textContent).toBe('之前选的强度现在不可用，请重新选择。');
    paintEffortChoices(select, note, effortChoices(supported(['low', 'high']), 'low'));
    expect((select as unknown as MiniElement).querySelectorAll('option')).toHaveLength(3);
    expect(select.dataset['effortState']).toBe('levels');
    expect(note.hidden).toBe(true);
    expect(note.textContent).toBe('');
  });
});
