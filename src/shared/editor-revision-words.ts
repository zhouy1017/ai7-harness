// The words an editor revision carries on its card (Issue #1409, #1411), the same in the service that writes a replacement's
// revisions and on the surface that writes one 替换当前处.

/** One occurrence a replacement wrote: its card's 修订说明. */
export function replacementRevisionRationale(query: string, replacement: string): string {
  return `编辑替换「${query}」→「${replacement}」`;
}
