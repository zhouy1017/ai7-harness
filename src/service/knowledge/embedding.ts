/**
 * 资料索引 · 相似段落检索 (Issue #892; editor-surfaces §8.4, V2-UX-KB-009): the one seam every similarity vector of the Material
 * Index is made through. A provider turns texts into vectors on this machine — nothing is sent anywhere — and the same
 * identity and text always give the same vector, so a vector recorded once stays what that identity makes of that text.
 *
 * The identity names what made a vector: a vector is only ever compared with vectors of the same identity, and a build's
 * vectors made under another identity are simply not this provider's. Which provider a store uses is fixed when it opens.
 *
 * This build ships one provider, the deterministic built-in one (`embedding-stub.ts`). A local model adapter is the Owner's
 * pick and arrives behind this same interface; it would read its model files from the directory the editor names in 设置 ›
 * 本机, matched by digest, and never download anything (#892 brief revision 2).
 */
export interface EmbeddingProvider {
  /** What makes the vectors, e.g. `ai7-embedding/stub-1`: recorded beside every vector it made. */
  readonly identity: string;
  /** How many numbers each vector holds. */
  readonly dimensions: number;
  /** Whether it can embed now, or why not; a provider that is not ready embeds nothing and builds nothing. */
  readiness(): EmbeddingReadiness;
  /** One vector per text, in order, each `dimensions` long; deterministic for the same identity and text. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

/**
 * Whether a provider can embed: ready; or its model files are not where 设置 › 本机 says (需要模型文件), naming the digest it
 * expects; or they are there and their digest is not the one recorded (摘要不符).
 */
export type EmbeddingReadiness =
  | { readonly state: 'ready' }
  | { readonly state: 'needs-model'; readonly expectedDigest: string | null }
  | { readonly state: 'digest-mismatch'; readonly expectedDigest: string; readonly actualDigest: string };

/** The Euclidean length of a vector: recorded beside it, so a comparison never recomputes it. */
export function vectorNorm(vector: Float32Array): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/** The cosine of two vectors of one identity, from their recorded norms; a vector of no length is like nothing (0). */
export function cosineSimilarity(left: Float32Array, leftNorm: number, right: Float32Array, rightNorm: number): number {
  if (left.length !== right.length || leftNorm === 0 || rightNorm === 0) return 0;
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) dot += left[index]! * right[index]!;
  return dot / (leftNorm * rightNorm);
}

/** A vector as one stored blob: its float32 values, little-endian, whatever the machine. */
export function vectorBytes(vector: Float32Array): Uint8Array {
  const bytes = new Uint8Array(vector.length * 4);
  const view = new DataView(bytes.buffer);
  vector.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

/** A stored blob read back as its vector; `null` when it is not `dimensions` float32 values. */
export function vectorFromBytes(bytes: Uint8Array, dimensions: number): Float32Array | null {
  if (bytes.byteLength !== dimensions * 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) vector[index] = view.getFloat32(index * 4, true);
  return vector;
}
