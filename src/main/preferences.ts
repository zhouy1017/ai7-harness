import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PREFERENCE_KEYS } from '../shared/preferences.js';

/** Temporary minimal owner for parallel slice 11b; 11a's owner wins at restack. */
export class Preferences {
  readonly path: string;
  #writes: Promise<unknown> = Promise.resolve();
  constructor(userData: string) { this.path = join(userData, 'preferences.json'); }

  async get(): Promise<Record<string, unknown>> {
    let stored: unknown;
    try { stored = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const values: Record<string, unknown> = {};
    const envelope = stored as { version?: unknown; values?: Record<string, unknown> } | null;
    for (const [key, spec] of Object.entries(PREFERENCE_KEYS)) {
      const value = envelope?.version === 1 ? envelope.values?.[key] : undefined;
      values[key] = spec.validate(value) ? value : spec.default;
    }
    return values;
  }

  save(input: { key: string; value: unknown }): Promise<Record<string, unknown>> {
    const operation = this.#writes.then(async () => {
      if (!input || typeof input !== 'object' || Object.keys(input).sort().join(',') !== 'key,value' ||
          !Object.hasOwn(PREFERENCE_KEYS, input.key)) throw new Error('PREFERENCE_INVALID');
      const spec = PREFERENCE_KEYS[input.key as keyof typeof PREFERENCE_KEYS];
      if (!spec.validate(input.value)) throw new Error('PREFERENCE_INVALID');
      const values = { ...await this.get(), [input.key]: input.value };
      await writeFile(`${this.path}.tmp`, JSON.stringify({ version: 1, values }), { encoding: 'utf8', mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
      return values;
    });
    this.#writes = operation.catch(() => undefined);
    return operation;
  }
}
