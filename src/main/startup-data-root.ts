import { isAbsolute, resolve } from 'node:path';

export type StartupLocationChoice = { kind: 'default' } | { kind: 'folder'; path: string } | { kind: 'cancel' };
export type StartupDataRootDecision = { kind: 'ready'; dataRoot: string } | { kind: 'choose'; defaultRoot: string } | { kind: 'quit' };

/** No filesystem or Electron here: precedence and cancellation are testable before any product root exists. */
export function chooseStartupDataRoot(
  args: { dataRoot?: string; choice?: StartupLocationChoice },
  storedChoice: string | null,
  defaults: { dataRoot: string },
): StartupDataRootDecision {
  const ready = (path: string): StartupDataRootDecision => {
    if (!isAbsolute(path)) throw new Error('AI7_STARTUP_CHOICE_INVALID');
    return { kind: 'ready', dataRoot: resolve(path) };
  };
  if (args.dataRoot !== undefined) return ready(args.dataRoot);
  if (storedChoice !== null) return ready(storedChoice);
  if (args.choice?.kind === 'cancel') return { kind: 'quit' };
  if (args.choice?.kind === 'folder') return ready(args.choice.path);
  if (args.choice?.kind === 'default') return ready(defaults.dataRoot);
  if (!isAbsolute(defaults.dataRoot)) throw new Error('AI7_STARTUP_CHOICE_INVALID');
  return { kind: 'choose', defaultRoot: resolve(defaults.dataRoot) };
}
