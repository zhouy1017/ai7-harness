import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocx } from '../../src/service/docx.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { withModelClarification } from '../../src/service/provider/clarification-contract.js';
import { identityRemap } from '../../src/service/provider/identity-replay.js';

// The #1585 no-send reconstruction as a provider-free test: exact sample1 imported twice, each initial-evaluation unit request
// built by the product's own kind definition and clarification wrapper. Only block identities differ, so every unit maps.
const root = fileURLToPath(new URL('../../', import.meta.url));
const SAMPLE1_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';

describe('identity-normalised forms of initial-evaluation unit requests (#1585)', () => {
  it('maps every unit of a fresh import of sample1 onto the earlier one by block identity alone', async () => {
    const blocks: ManifestBlockInput[] = [];
    await parseDocx(resolve(root, 'SampleBooks/sample1.docx'), 'sample1.docx', (block) => blocks.push({ ...block, graphemes: block.graphemeLength }), { digest: SAMPLE1_DIGEST, bytes: 29_550 });
    const imported = (minted: ManifestBlockInput[]) => {
      const manifest = deriveCoverageManifest({ bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', revisionDigest: 'a'.repeat(64), blocks: minted });
      return { manifest, byId: new Map(minted.map((block) => [block.blockId, block])) };
    };
    const first = imported(blocks);
    const second = imported(blocks.map((block) => ({ ...block, blockId: `blk_${randomBytes(12).toString('hex')}` })));
    const definition = withModelClarification(initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) }));
    const message = (book: ReturnType<typeof imported>, ordinal: number) => definition.buildUnitMessage(book.manifest.units[ordinal]!, book.manifest.units.length, book.byId);
    const body = (user: string) => JSON.stringify({ model: 'deepseek-v4.1-flash', messages: [{ role: 'system', content: definition.systemPrompt }, { role: 'user', content: user }] });
    const ids = (book: ReturnType<typeof imported>, ordinal: number) => [...book.manifest.units[ordinal]!.overlapBlockIds, ...book.manifest.units[ordinal]!.blockIds];
    expect(second.manifest.units).toHaveLength(first.manifest.units.length);
    for (let ordinal = 0; ordinal < first.manifest.units.length; ordinal++) {
      const earlier = message(first, ordinal);
      const fresh = message(second, ordinal);
      expect(fresh).not.toBe(earlier);
      // The header and the clarification line carry identity-free digests: byte-exact across the two imports.
      expect(fresh.split('\n')[1]).toMatch(/^AI7 单元指令\/2 · 请求摘要 [0-9a-f]{64}$/u);
      expect(fresh.split('\n').slice(0, 2)).toEqual(earlier.split('\n').slice(0, 2));
      // Each earlier block identity maps onto the block at the same place in the fresh import.
      const after = ids(second, ordinal);
      expect(identityRemap(body(earlier), body(fresh))?.get('block')).toEqual(new Map(ids(first, ordinal).map((id, index) => [id, after[index]!])));
      // One more byte of manuscript text is another question.
      expect(identityRemap(body(earlier), body(`${fresh}！`))).toBeNull();
    }
  });
});
