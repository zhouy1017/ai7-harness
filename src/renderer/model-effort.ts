import type { ModelServiceSupportedEfforts } from '../shared/protocol.js';
import { technicalWords } from './technical-layer.js';
import {
  EFFORT_STALE_NOTE, EFFORT_UNKNOWN_NOTE, EFFORT_UNSUPPORTED_NOTE, MODEL_DEFAULT_EFFORT_LABEL, effortLevelLabel, staleEffortLabel,
} from './model-effort-labels.js';

/** The value of 「模型默认」: the request carries no effort (`off`, as a role default and a task choice already say it). */
export const MODEL_DEFAULT_EFFORT = 'off';

export interface EffortOption { readonly value: string; readonly label: string; readonly stale: boolean }

export interface EffortChoices {
  /** 模型默认 first, then the model's own levels from least to most; a saved level it no longer offers comes last. */
  readonly options: readonly EffortOption[];
  /** Whether the model has levels of its own, none that can be set, or none that are known yet. */
  readonly state: 'levels' | 'unknown' | 'unsupported';
  /** What the list shows as chosen: the saved value, also when it is no longer offered. */
  readonly selected: string;
  /** The saved level is not one the model offers now: the editor chooses again, nothing is replaced for them. */
  readonly stale: boolean;
  /** Why only 模型默认 is offered, or that the saved level needs choosing again; empty when there is nothing to say. */
  readonly note: string;
  /** Developer mode: the service's level names, the route, where the list comes from and when. Empty in ordinary mode. */
  readonly detail: string;
}

/**
 * The 思考强度 list of one model, from what the model service says the model supports (never from the route's general
 * list, and never a typed value). Absent evidence and a model that takes no effort both offer 模型默认 only.
 */
export function effortChoices(supported: ModelServiceSupportedEfforts | undefined, saved: string | null | undefined, route?: string): EffortChoices {
  const levels = supported?.status === 'supported' ? supported.levels : [];
  const selected = saved === undefined || saved === null || saved === '' ? MODEL_DEFAULT_EFFORT : saved;
  const stale = selected !== MODEL_DEFAULT_EFFORT && !levels.includes(selected);
  const options: EffortOption[] = [
    { value: MODEL_DEFAULT_EFFORT, label: MODEL_DEFAULT_EFFORT_LABEL, stale: false },
    ...levels.map((level) => ({ value: level, label: effortLevelLabel(level), stale: false })),
    ...(stale ? [{ value: selected, label: staleEffortLabel(selected), stale: true }] : []),
  ];
  const reason = supported === undefined ? EFFORT_UNKNOWN_NOTE : supported.status === 'unsupported' ? EFFORT_UNSUPPORTED_NOTE : '';
  const provenance = supported === undefined ? '没有可选强度的记录'
    : `${supported.provenance.kind === 'discovered' ? `来自账号的模型列表，${supported.provenance.observedAt} 查到` : `来自服务文档 ${supported.provenance.source}，${supported.provenance.readOn} 读到`}${supported.status === 'supported' && supported.completeness === 'partial' ? '；列表可能不完整' : ''}`;
  return { options, selected, stale, state: supported === undefined ? 'unknown' : supported.status === 'unsupported' ? 'unsupported' : 'levels', note: stale ? EFFORT_STALE_NOTE : reason,
    detail: technicalWords(`${route === undefined ? '' : `路线 ${route} · `}${levels.length === 0 ? '' : `${levels.join(' / ')} · `}${provenance}`) };
}

/** Paints one list and its note from the choices; the caller keeps what the editor chose. */
export function paintEffortChoices(select: HTMLSelectElement, note: HTMLElement, choices: EffortChoices): void {
  select.replaceChildren(...choices.options.map((choice) => {
    const option = document.createElement('option');
    option.value = choice.value; option.textContent = choice.label;
    return option;
  }));
  select.value = choices.selected;
  select.dataset['effortState'] = choices.stale ? 'stale' : choices.state;
  const line = (text: string, kind: string): HTMLElement[] => {
    if (text === '') return [];
    const row = document.createElement('span'); row.textContent = text; row.dataset['effortNote'] = kind; return [row];
  };
  note.replaceChildren(...line(choices.note, choices.stale ? 'stale' : 'reason'), ...line(choices.detail, 'detail'));
  note.hidden = choices.note === '' && choices.detail === '';
}
