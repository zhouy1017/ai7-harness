import type { PreinstalledTableKey } from './standard-tables.js';

export function readSeedRows(key: PreinstalledTableKey): readonly (readonly string[])[];
