import type { DevelopmentValidationIntent } from '../../shared/protocol.js';
import { recordingProviderFor } from '../recording-launch.js';

const ACTUAL_RECORDING_OBSERVER = Symbol.for('ai7.manual-recording.send-observer');

export type RecordingSendResult = 'answered' | 'refused' | 'protocol-error' | 'sent';

interface RecordingSendObserver {
  /** Return null to pause before claiming a new send. Each admitted slot must settle once. */
  enter(facts: { family: string; case: string; step: string; model: string; route: string; shape: string; effort: 'high' | 'other' | 'absent' }):
    Promise<((outcome: RecordingSendResult, code: string) => void) | null>;
  refuse(code: string): void;
}

/** An optional local runbook owns this in-process callback. No settings or service request can install it. */
export function recordingSendObserver(intent: DevelopmentValidationIntent): RecordingSendObserver | null {
  const local = (globalThis as typeof globalThis & { [ACTUAL_RECORDING_OBSERVER]?: RecordingSendObserver })[ACTUAL_RECORDING_OBSERVER];
  return local !== undefined && recordingProviderFor(intent) !== null ? local : null;
}

/** Only a closed classification of the encoded effort reaches the observer, never the request body. */
export function observedRecordingEffort(body: string): 'high' | 'other' | 'absent' {
  try {
    const parsed = JSON.parse(body) as { reasoning?: { effort?: unknown }; output_config?: { effort?: unknown }; reasoning_effort?: unknown;
      generationConfig?: { thinkingConfig?: { thinkingLevel?: unknown; thinkingBudget?: unknown } } };
    const settings = parsed.generationConfig?.thinkingConfig;
    const values = [parsed.reasoning?.effort, parsed.output_config?.effort, parsed.reasoning_effort, settings?.thinkingLevel, settings?.thinkingBudget]
      .filter(value => value !== undefined);
    return values.length === 0 ? 'absent' : values.length === 1 && values[0] === 'high' ? 'high' : 'other';
  } catch { return 'other'; }
}
