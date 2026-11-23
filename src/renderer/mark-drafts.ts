import type { ManuscriptWindowProjection } from '../shared/protocol.js';

export type DraftScope = Pick<ManuscriptWindowProjection, 'bookId' | 'manuscriptId' | 'branchId'>;
export type DraftRange = { blockId: string; blockDigest: string; fromGrapheme: number; toGrapheme: number; text: string };
export type DraftPlace = { kind: 'reply'; markId: string } | { kind: 'annotation' | 'editor-note'; range: DraftRange };
export interface MarkDraft { readonly scope: DraftScope; readonly place: DraftPlace; readonly body: string; readonly revision: number }
const keyOf = (scope: DraftScope, place: DraftPlace): string => JSON.stringify([scope.bookId, scope.manuscriptId, scope.branchId, place.kind === 'reply' ? ['reply', place.markId] : [place.kind, place.range.blockId, place.range.blockDigest, place.range.fromGrapheme, place.range.toGrapheme, place.range.text]]);

/** Unsent words belong only to this renderer session. There is deliberately no persistence adapter. */
export class MarkDrafts {
  private readonly entries = new Map<string, MarkDraft>();
  private readonly flights = new Map<string, Promise<boolean>>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  read(scope: DraftScope, place: DraftPlace): string { return this.entries.get(keyOf(scope, place))?.body ?? ''; }
  list(scope: DraftScope): ReadonlyArray<MarkDraft> {
    return [...this.entries.values()].filter(entry => entry.scope.bookId === scope.bookId && entry.scope.manuscriptId === scope.manuscriptId && entry.scope.branchId === scope.branchId);
  }
  write(scope: DraftScope, place: DraftPlace, body: string): void {
    const key = keyOf(scope, place);
    if (body.length) this.entries.set(key, { scope: { bookId: scope.bookId, manuscriptId: scope.manuscriptId, branchId: scope.branchId }, place, body, revision: ++this.revision });
    else this.entries.delete(key);
    this.changed();
  }
  discard(scope: DraftScope, place: DraftPlace): void { this.entries.delete(keyOf(scope, place)); this.changed(); }
  sending(scope: DraftScope, place: DraftPlace): boolean { return this.flights.has(keyOf(scope, place)); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  send(scope: DraftScope, place: DraftPlace, run: (body: string) => Promise<boolean>): Promise<boolean> {
    const key = keyOf(scope, place), existing = this.flights.get(key);
    if (existing) return existing;
    const entry = this.entries.get(key);
    if (!entry?.body.trim()) return Promise.resolve(false);
    const flight = run(entry.body).then(done => {
      if (done && this.entries.get(key) === entry) this.entries.delete(key);
      return done;
    }).finally(() => { this.flights.delete(key); this.changed(); });
    this.flights.set(key, flight);
    return flight;
  }
}

export const markDrafts = new MarkDrafts();
