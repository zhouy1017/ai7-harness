import type { MaterialReferenceBoundary, MaterialTaskReading } from '../material-index.js';
import type { RetrievalSource } from './index.js';

/** Read every segment at the exact frozen build through the existing Task reader, including its availability checks. */
export function materialRetrievalSources(boundary: MaterialReferenceBoundary,
  read: (boundary: MaterialReferenceBoundary, materialId: string, from: number) => MaterialTaskReading): RetrievalSource[] {
  return boundary.references.map((pin) => ({
    sourceKind: 'material', sourceId: pin.materialId, digest: pin.indexDigest,
    read() {
      const segments: Array<{ segmentOrdinal: number; text: string }> = [];
      let digest = pin.indexDigest;
      for (let from: number | null = 1; from !== null;) {
        const page = read(boundary, pin.materialId, from);
        digest = page.indexDigest;
        segments.push(...page.segments.map((segment) => ({ segmentOrdinal: segment.ordinal, text: segment.text })));
        from = page.next;
      }
      return { digest, segments };
    },
  }));
}
