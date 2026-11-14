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

/** Closed IPC shape; readiness and vendor acceptance remain the service/provider's decisions. */
export function validRuntimeExecutionConfig(value: unknown): value is RuntimeExecutionConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  const text = (value: unknown, max: number): boolean => typeof value === 'string' && value.length > 0 && value.length <= max && value.isWellFormed();
  return Object.keys(config).every(key => ['modelConnectionId', 'modelId', 'reasoningEffort'].includes(key)) &&
    (config.modelConnectionId === undefined || text(config.modelConnectionId, 128)) &&
    (config.modelId === undefined || text(config.modelId, 256)) &&
    (config.reasoningEffort === undefined || validReasoningEffort(config.reasoningEffort));
}
