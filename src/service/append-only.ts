/**
 * The append-only ledger triggers (#1634, ADR 0105 §4): every ledger of the store refuses any UPDATE and any DELETE of its rows
 * with its own message, and nothing else. One helper emits both triggers of each ledger, named `<table>_no_update` and
 * `<table>_no_delete`, so a ledger's guard is one line in its owner module instead of two copied trigger texts. They cost nothing
 * on insert.
 */
export function appendOnly(ledgers: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const triggers: Record<string, string> = {};
  for (const [table, code] of Object.entries(ledgers)) {
    for (const operation of ['update', 'delete'] as const) {
      triggers[`${table}_no_${operation}`] = `CREATE TRIGGER ${table}_no_${operation}
    BEFORE ${operation.toUpperCase()} ON ${table}
    BEGIN
      SELECT RAISE(ABORT, '${code}');
    END`;
    }
  }
  return triggers;
}
