import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSURANCE_SAMPLE_SIZE,
  assuranceSamplingTurns,
  drawAssuranceSample,
  type AssuranceSamplingCandidate,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import type { CoverageManifestProjection, CoverageManifestUnitProjection } from '../../src/shared/protocol.js';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/**
 * A manifest is only ever read here for `digest` and for each unit's `sectionOrdinal`, so the fixture
 * states exactly the section layout under test: `sections` gives the number of units in each section,
 * in section order.
 */
function manifest(sections: ReadonlyArray<number>, digest = 'm'.repeat(64)): Pick<CoverageManifestProjection, 'digest' | 'units'> {
  const units: CoverageManifestUnitProjection[] = [];
  sections.forEach((unitCount, index) => {
    for (let subUnit = 1; subUnit <= unitCount; subUnit += 1) {
      const ordinal = units.length + 1;
      units.push({
        ordinal,
        sectionOrdinal: index + 1,
        subUnitIndex: subUnit,
        subUnitCount: unitCount,
        headingBlockId: null,
        headingText: null,
        headingLevel: null,
        startPosition: ordinal,
        endPosition: ordinal,
        blockIds: [`blk_${String(ordinal).padStart(24, '0')}`],
        blockDigests: [String(ordinal).padStart(64, '0')],
        overlapBlockIds: [],
        graphemes: 10,
        digest: String(ordinal).padStart(64, 'a'),
      });
    }
  });
  return { digest, units };
}

function candidate(ref: string, unitOrdinal: number, tier = 'medium'): AssuranceSamplingCandidate {
  return { ref, unitOrdinal, tier, text: `合成发现 ${ref}。` };
}

/** `count` candidates anchored in `unitOrdinal`, numbered from `from`. */
function candidates(unitOrdinal: number, count: number, from = 0): AssuranceSamplingCandidate[] {
  return Array.from({ length: count }, (_item, index) => candidate(String(from + index), unitOrdinal));
}

describe('drawAssuranceSample (ADR 0066 §Assurance sampling)', () => {
  it('samples every candidate when there are fewer than the default size', () => {
    const draw = drawAssuranceSample(manifest([8]), candidates(1, 2));
    expect(draw.seed).toMatch(DIGEST_PATTERN);
    expect(draw.size).toBe(2);
    expect(draw.candidateCount).toBe(2);
    expect(draw.strata).toEqual([{ sectionOrdinal: 1, candidates: 2, sampled: 2 }]);
    expect(draw.sampled.map((entry) => entry.ref)).toEqual(['0', '1']);
  });

  /**
   * The seed is a function of the manifest digest, which covers the minted identities of one import,
   * so it moves when the same manuscript is imported again. The keyed hash therefore decides *which*
   * candidates are drawn and nothing else: the drawn set is emitted in candidate order, which both
   * kinds derive from the manuscript and the model. Without this a fixture could not answer a sampling
   * turn twice, because the listing — and the digest over it — would flip between imports.
   */
  it('emits the drawn candidates in candidate order, whatever the seed does to the selection', () => {
    const set = candidates(1, 6);
    for (const digest of ['m'.repeat(64), 'n'.repeat(64), '0'.repeat(64)]) {
      const draw = drawAssuranceSample(manifest([8], digest), set);
      expect(draw.sampled.map((entry) => entry.ref)).toEqual(['0', '1', '2', '3', '4', '5']);
    }
    // A partial draw keeps candidate order too; only its membership follows the seed.
    const partial = drawAssuranceSample(manifest([8]), candidates(1, 40));
    const positions = partial.sampled.map((entry) => Number(entry.ref));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('caps the sample at thirty and still draws it deterministically', () => {
    const draw = drawAssuranceSample(manifest([8]), candidates(1, 44));
    expect(draw.size).toBe(DEFAULT_ASSURANCE_SAMPLE_SIZE);
    expect(draw.candidateCount).toBe(44);
    expect(draw.strata).toEqual([{ sectionOrdinal: 1, candidates: 44, sampled: 30 }]);
    expect(new Set(draw.sampled.map((entry) => entry.ref)).size).toBe(30);
  });

  it('draws nothing at all from an empty candidate set', () => {
    const draw = drawAssuranceSample(manifest([8]), []);
    expect(draw).toMatchObject({ size: 0, candidateCount: 0, strata: [], sampled: [] });
    expect(draw.seed).toMatch(DIGEST_PATTERN);
  });

  /**
   * The property acceptance criterion 1 turns on: an editor holding only the recorded seed and the
   * revision's own findings can redraw the identical sample and check that this is the set that was
   * asked about. Nothing here consults a clock, an insertion order, or `Math.random`.
   */
  it('is reproducible from the manifest and the findings alone, and moves when either does', () => {
    const layout = manifest([3, 2, 4]);
    const set = [...candidates(1, 5), ...candidates(4, 4, 5), ...candidates(6, 6, 9)];
    const first = drawAssuranceSample(layout, set);
    const redrawn = drawAssuranceSample(layout, set.map((entry) => ({ ...entry })));
    expect(redrawn).toEqual(first);
    // A different manuscript revision is a different manifest digest, so the same findings redraw differently.
    expect(drawAssuranceSample(manifest([3, 2, 4], 'n'.repeat(64)), set).seed).not.toBe(first.seed);
    // One changed finding text is a changed finding set.
    const edited = set.map((entry, index) => (index === 0 ? { ...entry, text: '合成发现（已改）。' } : entry));
    expect(drawAssuranceSample(layout, edited).seed).not.toBe(first.seed);
    // One finding fewer is too.
    expect(drawAssuranceSample(layout, set.slice(1)).seed).not.toBe(first.seed);
  });

  it('refuses to stratify a candidate whose unit the manifest does not hold', () => {
    expect(() => drawAssuranceSample(manifest([2]), candidates(9, 1))).toThrow('抽样候选发现的单元不在覆盖清单内，无法按结构段分层。');
  });
});

/**
 * `sample1` is one structural section (`manifest.sectionCount === 1`), so the floor and the
 * largest-remainder allocation are never exercised by a real Run. These synthetic layouts are where
 * they are proven.
 */
describe('the per-stratum floor and the largest-remainder allocation', () => {
  it('gives every section holding a candidate at least one place', () => {
    // Section 3 holds one candidate among fifty; it is still sampled.
    const set = [...candidates(1, 30), ...candidates(2, 19, 30), ...candidates(3, 1, 49)];
    const draw = drawAssuranceSample(manifest([1, 1, 1]), set);
    expect(draw.size).toBe(DEFAULT_ASSURANCE_SAMPLE_SIZE);
    expect(draw.strata.map((stratum) => stratum.sampled).reduce((total, value) => total + value, 0)).toBe(30);
    expect(draw.strata.every((stratum) => stratum.sampled >= 1)).toBe(true);
    expect(draw.strata[2]).toEqual({ sectionOrdinal: 3, candidates: 1, sampled: 1 });
  });

  it('allocates the remainder proportionally to candidate counts, largest remainders first', () => {
    // Three sections holding 60, 30, and 10 of 100 candidates. The floor takes 3 of the 30 places;
    // the remaining 27 are shared as 16.2, 8.1, and 2.7, so the whole parts are 16, 8, and 2 and the
    // one leftover place goes to the largest fraction, section 3.
    const set = [...candidates(1, 60), ...candidates(2, 30, 60), ...candidates(3, 10, 90)];
    const draw = drawAssuranceSample(manifest([1, 1, 1]), set);
    expect(draw.size).toBe(DEFAULT_ASSURANCE_SAMPLE_SIZE);
    expect(draw.strata).toEqual([
      { sectionOrdinal: 1, candidates: 60, sampled: 17 },
      { sectionOrdinal: 2, candidates: 30, sampled: 9 },
      { sectionOrdinal: 3, candidates: 10, sampled: 4 },
    ]);
  });

  it('breaks a tie between equal remainders by section ordinal, never by insertion order', () => {
    // Four sections of eleven: the floor takes 4 places and each section's share of the remaining 26
    // is exactly 6.5, so all four fractions tie and the two leftover places go to sections 1 and 2.
    const set = [0, 1, 2, 3].flatMap((index) => candidates(index + 1, 11, index * 11));
    const draw = drawAssuranceSample(manifest([1, 1, 1, 1]), set);
    expect(draw.size).toBe(DEFAULT_ASSURANCE_SAMPLE_SIZE);
    expect(draw.strata.map((stratum) => stratum.sampled)).toEqual([8, 8, 7, 7]);
    // The same candidates offered in another order are the same allocation.
    expect(drawAssuranceSample(manifest([1, 1, 1, 1]), [...set].reverse()).strata.map((stratum) => stratum.sampled))
      .toEqual([8, 8, 7, 7]);
  });

  it('never allocates a section more places than it has candidates, and moves the freed places on', () => {
    // Section 1 holds one candidate and can take no second place; the surplus goes to section 2.
    const set = [...candidates(1, 1), ...candidates(2, 60, 1)];
    const draw = drawAssuranceSample(manifest([1, 1]), set);
    expect(draw.size).toBe(DEFAULT_ASSURANCE_SAMPLE_SIZE);
    expect(draw.strata).toEqual([
      { sectionOrdinal: 1, candidates: 1, sampled: 1 },
      { sectionOrdinal: 2, candidates: 60, sampled: 29 },
    ]);
  });

  it('lets the floor raise the size past thirty rather than leave a section unsampled', () => {
    const layout = manifest(Array.from({ length: 34 }, () => 1));
    const set = Array.from({ length: 34 }, (_item, index) => candidate(String(index), index + 1));
    const draw = drawAssuranceSample(layout, set);
    expect(draw.size).toBe(34);
    expect(draw.strata).toHaveLength(34);
    expect(draw.strata.every((stratum) => stratum.sampled === 1)).toBe(true);
  });
});

describe('assuranceSamplingTurns', () => {
  it('groups the drawn sample into one turn per anchor unit, in unit order and candidate order', () => {
    const draw = drawAssuranceSample(manifest([2, 2]), [
      candidate('0', 3), candidate('1', 1), candidate('2', 3), candidate('3', 2),
    ]);
    const turns = assuranceSamplingTurns(draw.sampled);
    expect(turns.map((turn) => turn.unitOrdinal)).toEqual([1, 2, 3]);
    expect(turns.map((turn) => turn.findings.map((finding) => finding.ref))).toEqual([['1'], ['3'], ['0', '2']]);
    // Bounded by the distinct anchor units, which is never more than the unit count.
    expect(turns.length).toBeLessThanOrEqual(4);
    expect(assuranceSamplingTurns([])).toEqual([]);
  });
});
