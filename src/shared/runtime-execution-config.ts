/** One execution choice shared by role defaults and dispatch overrides (#1453, #1455).
 * Missing fields inherit the role default; `off` explicitly omits the effort control on the wire.
 * Effort identifiers are vendor data, not a model/level admission list.
 */
export interface RuntimeExecutionConfig {
  readonly modelConnectionId?: string;
  readonly modelId?: string;
  readonly reasoningEffort?: string;
}

export function validReasoningEffort(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/u.test(value);
}

export function sentReasoningEffort(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === 'off' ? null : value;
}

export function resolveRuntimeExecutionConfig(defaults: RuntimeExecutionConfig, override: RuntimeExecutionConfig = {}): RuntimeExecutionConfig {
  return { ...defaults, ...Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)) };
}
