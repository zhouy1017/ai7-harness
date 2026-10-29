import type { GlobalAttentionGroupProjection, ModelServiceRouteId } from '../protocol.js';

/**
 * The context header's live processing indicator (ADR 0096 §3; Issue #1177), derived from the execution state and nothing it
 * cannot vouch for: `sending` while a request is in the transport — an attempt awaiting its answer, or a Global Agent dialogue
 * answering — naming each channel; `waiting-network` while a Run is in Connectivity Wait for the network; `local` otherwise.
 * Sending wins over waiting, which wins over local. A channel is a route, never a model id or credential.
 */
export type ProcessingIndicatorProjection =
  | { readonly state: 'local' }
  | { readonly state: 'sending'; readonly channels: ReadonlyArray<ModelServiceRouteId> }
  | { readonly state: 'waiting-network' };

/**
 * 待我处理 across every Book (editor-surfaces §8.1, V2-UX-ATTN-001 to 009, IA-007). A read: composing it
 * terminalizes, claims and writes nothing (V2-UX-ATTN-008). An item resolves by itself when the record
 * moves on — a newer Task of the same kind for its Book, a decision made, a completion aging out.
 */
export interface GlobalAttentionProjection {
  /** Always the four groups, in the fixed order. */
  groups: ReadonlyArray<GlobalAttentionGroupProjection>;
  /** The Actionable Attention Count: the items of the first two groups, and no others (V2-UX-ATTN-006). */
  actionableCount: number;
  /** A Run is in flight now, or a Review Run is being driven: a reader follows it slowly until it ends. */
  running: boolean;
  /** What the context header's processing indicator says now. */
  processing: ProcessingIndicatorProjection;
}
