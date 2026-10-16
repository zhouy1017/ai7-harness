import type { EmbeddingProvider, EmbeddingReadiness } from './embedding.js';

/**
 * The built-in similarity vectors (Issue #892): deterministic, provider-free, made on this machine with nothing to load. Each
 * text becomes a hashed bag of its words — Han characters one by one and in adjacent pairs, every other run of letters and
 * digits as one lower-cased word — signed into `STUB_EMBEDDING_DIMENSIONS` slots and scaled to unit length. Two paragraphs
 * that share words come out near each other; one that shares none comes out apart. It finds wording, not meaning: a model
 * adapter the Owner picks may replace it under its own identity, and vectors of the two are never compared.
 *
 * Every test, CI run and test guest uses this provider; so does the product until a model adapter is admitted.
 */
export const STUB_EMBEDDING_IDENTITY = 'ai7-embedding/stub-1';
export const STUB_EMBEDDING_DIMENSIONS = 256;

const HAN = /\p{Script=Han}/u;
const WORD = /[\p{L}\p{N}]/u;

/** FNV-1a over the UTF-16 code units: the same text always lands in the same slot with the same sign. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The words of a text as the stub counts them: Han unigrams and bigrams, and every other letter-or-digit run. */
export function stubFeatures(text: string): string[] {
  const features: string[] = [];
  let word = '';
  let previousHan: string | null = null;
  const endWord = (): void => {
    if (word.length > 0) features.push(`w:${word}`);
    word = '';
  };
  for (const character of text.normalize('NFKC').toLowerCase()) {
    if (HAN.test(character)) {
      endWord();
      features.push(`h:${character}`);
      if (previousHan !== null) features.push(`b:${previousHan}${character}`);
      previousHan = character;
      continue;
    }
    previousHan = null;
    if (WORD.test(character)) word += character;
    else endWord();
  }
  endWord();
  return features;
}

/** One text's vector: each word adds one, signed, to its slot; the sum is scaled to unit length (none for no words). */
export function stubEmbedding(text: string, dimensions: number = STUB_EMBEDDING_DIMENSIONS): Float32Array {
  const vector = new Float32Array(dimensions);
  for (const feature of stubFeatures(text)) {
    const hash = fnv1a(feature);
    vector[hash % dimensions]! += (hash & 0x80000000) === 0 ? 1 : -1;
  }
  let sum = 0;
  for (const value of vector) sum += value * value;
  if (sum === 0) return vector;
  const scale = 1 / Math.sqrt(sum);
  for (let index = 0; index < dimensions; index += 1) vector[index] = vector[index]! * scale;
  return vector;
}

export class StubEmbeddingProvider implements EmbeddingProvider {
  readonly identity = STUB_EMBEDDING_IDENTITY;
  readonly dimensions = STUB_EMBEDDING_DIMENSIONS;

  readiness(): EmbeddingReadiness {
    return { state: 'ready' };
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    return texts.map((text) => stubEmbedding(text, this.dimensions));
  }
}
