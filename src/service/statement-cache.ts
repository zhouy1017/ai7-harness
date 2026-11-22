import type { DatabaseSync, StatementSync } from 'node:sqlite';

/**
 * Prepared statements kept per connection (Issue #1654, the design's 2 s lock plan): every owner prepares its SQL where it
 * runs it, and an editor step's undo of a 2,000-place 全部替换 runs the same few dozen statements 2,000 times over. A statement
 * that `run`, `get` or `all` uses finishes before the call returns, so one prepared copy serves every caller; `iterate` keeps
 * its statement open while the caller walks it, so each iteration gets a statement of its own. A connection keeps at most
 * `LIMIT` statements and starts again when it reaches them (SQL built with a varying number of placeholders is the reason).
 * The proxy looks `run`, `get` and `all` up on the statement at each call, so a spy on `StatementSync.prototype` sees every
 * execution, cached or not.
 */
const LIMIT = 2048;
const cached = new WeakSet<DatabaseSync>();

export function cacheStatements(db: DatabaseSync): void {
  if (cached.has(db)) return;
  cached.add(db);
  const prepare = db.prepare.bind(db);
  let statements = new Map<string, StatementSync>();
  db.prepare = (sql: string): StatementSync => {
    let statement = statements.get(sql);
    if (statement === undefined) {
      if (statements.size >= LIMIT) statements = new Map();
      statement = prepare(sql);
      statements.set(sql, statement);
    }
    const shared = statement;
    return new Proxy(shared, {
      get(target, key) {
        if (key === 'iterate') return (...values: Parameters<StatementSync['iterate']>) => prepare(sql).iterate(...values);
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
  };
}

const present = new WeakMap<DatabaseSync, Set<string>>();

/**
 * Whether the schema holds an object named `name`, asked once per connection (Issue #1654 lock plan: the probes ran per place
 * of a 全部替换). Only a positive answer is kept: a baseline store holds every relation, and a stub schema that lacks one keeps
 * asking, as before.
 */
export function schemaHas(db: DatabaseSync, name: string): boolean {
  let names = present.get(db);
  if (names === undefined) present.set(db, names = new Set());
  if (names.has(name)) return true;
  const found = db.prepare('SELECT 1 FROM sqlite_schema WHERE name = ?').get(name) !== undefined;
  if (found) names.add(name);
  return found;
}
