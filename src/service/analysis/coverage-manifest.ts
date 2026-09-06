import type { CoverageManifestProjection, CoverageManifestUnitProjection } from '../../shared/protocol.js';
import { BLOCK_ID_PATTERN, DIGEST_PATTERN, UUID_PATTERN, canonicalJson, requireAnalysis, sha256Hex } from './canonical.js';

/**
 * Coverage Manifest derivation for one exact Task Input Manuscript Revision.
 *
 * Structure-aware, deterministic, and complete: every `title` or `heading` block opens a structural
 * section that becomes one Analysis Unit; a section whose text exceeds the unit budget is split into
 * ordered sub-units, each later sub-unit carrying the previous sub-unit's last block(s) as bounded
 * overlap context; blocks before the first heading form the leading section. Own block ranges
 * partition the revision, so every block belongs to exactly one unit's own range and to at most one
 * later unit's overlap. Failures and gaps never enter the manifest; they belong to the Result Set
 * Revision. The same revision always yields byte-identical canonical JSON.
 */
export const COVERAGE_MANIFEST_SCHEMA = 'ai7.coverage-manifest/1' as const;
/** Unit budget in graphemes of own blocks (an execution budget, not the editor window). */
export const UNIT_BUDGET_GRAPHEMES = 1_200;
/** Bounded overlap: how many trailing blocks of the previous sub-unit a later sub-unit repeats as context. */
export const UNIT_OVERLAP_BLOCKS = 1;

export interface ManifestBlockInput {
  readonly blockId: string;
  readonly position: number;
  readonly kind: 'title' | 'heading' | 'paragraph';
  readonly level: number | null;
  readonly text: string;
  readonly digest: string;
  readonly graphemes: number;
}

export interface CoverageManifestInput {
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly revisionDigest: string;
  readonly blocks: ReadonlyArray<ManifestBlockInput>;
}

interface Section {
  ordinal: number;
  heading: ManifestBlockInput | null;
  blocks: ManifestBlockInput[];
}

function requireBlocks(blocks: ReadonlyArray<ManifestBlockInput>): void {
  requireAnalysis(blocks.length > 0, 'COVERAGE_MANIFEST_INVALID', '任务输入修订版没有内容块。');
  blocks.forEach((block, index) => {
    requireAnalysis(
      block.position === index + 1 && BLOCK_ID_PATTERN.test(block.blockId) && DIGEST_PATTERN.test(block.digest) &&
        Number.isSafeInteger(block.graphemes) && block.graphemes >= 0 && block.text.isWellFormed() &&
        (block.kind === 'title' || block.kind === 'heading' || block.kind === 'paragraph') &&
        (block.level === null || (Number.isSafeInteger(block.level) && block.level >= 1 && block.level <= 6)),
      'COVERAGE_MANIFEST_INVALID',
      '任务输入修订版内容块序列无效。',
    );
  });
  requireAnalysis(new Set(blocks.map((block) => block.blockId)).size === blocks.length,
    'COVERAGE_MANIFEST_INVALID', '任务输入修订版内容块标识重复。');
}

function sectionsOf(blocks: ReadonlyArray<ManifestBlockInput>): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const block of blocks) {
    if (block.kind === 'title' || block.kind === 'heading' || current === null) {
      const structural = block.kind === 'title' || block.kind === 'heading';
      current = { ordinal: sections.length + 1, heading: structural ? block : null, blocks: [block] };
      sections.push(current);
      continue;
    }
    current.blocks.push(block);
  }
  return sections;
}

function splitSection(section: Section): ManifestBlockInput[][] {
  const groups: ManifestBlockInput[][] = [];
  let group: ManifestBlockInput[] = [];
  let graphemes = 0;
  for (const block of section.blocks) {
    if (group.length > 0 && graphemes + block.graphemes > UNIT_BUDGET_GRAPHEMES) {
      groups.push(group);
      group = [];
      graphemes = 0;
    }
    group.push(block);
    graphemes += block.graphemes;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

/**
 * The unit digest covers the unit's position in the revision and the content digests of its own and
 * overlap blocks, not block identities: identities are minted per import, while the same manuscript
 * content must yield the same unit digest (and therefore the same fixture request digest) in every
 * import of the same source.
 */
function unitDigest(
  ordinal: number,
  startPosition: number,
  endPosition: number,
  blockDigests: readonly string[],
  overlapBlockDigests: readonly string[],
): string {
  return sha256Hex(canonicalJson({ ordinal, startPosition, endPosition, blockDigests, overlapBlockDigests }));
}

export function deriveCoverageManifest(input: CoverageManifestInput): CoverageManifestProjection {
  requireAnalysis(
    UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.manuscriptId) && UUID_PATTERN.test(input.branchId) &&
      UUID_PATTERN.test(input.revisionId) && /^r[1-9][0-9]*$/.test(input.revisionLabel) &&
      DIGEST_PATTERN.test(input.revisionDigest),
    'COVERAGE_MANIFEST_INVALID',
    '任务输入修订版身份无效。',
  );
  requireBlocks(input.blocks);
  const sections = sectionsOf(input.blocks);
  const units: CoverageManifestUnitProjection[] = [];
  for (const section of sections) {
    const groups = splitSection(section);
    groups.forEach((group, index) => {
      const previous = index === 0 ? [] : groups[index - 1]!;
      const overlap = previous.slice(Math.max(0, previous.length - UNIT_OVERLAP_BLOCKS));
      const ordinal = units.length + 1;
      const blockIds = group.map((block) => block.blockId);
      const blockDigests = group.map((block) => block.digest);
      const overlapBlockIds = overlap.map((block) => block.blockId);
      const startPosition = group[0]!.position;
      const endPosition = group[group.length - 1]!.position;
      units.push({
        ordinal,
        sectionOrdinal: section.ordinal,
        subUnitIndex: index + 1,
        subUnitCount: groups.length,
        headingBlockId: section.heading?.blockId ?? null,
        headingText: section.heading?.text ?? null,
        headingLevel: section.heading?.level ?? null,
        startPosition,
        endPosition,
        blockIds,
        blockDigests,
        overlapBlockIds,
        graphemes: group.reduce((total, block) => total + block.graphemes, 0),
        digest: unitDigest(ordinal, startPosition, endPosition, blockDigests, overlap.map((block) => block.digest)),
      });
    });
  }
  const body = {
    schema: COVERAGE_MANIFEST_SCHEMA,
    manuscript: {
      bookId: input.bookId,
      manuscriptId: input.manuscriptId,
      branchId: input.branchId,
      revisionId: input.revisionId,
      revisionLabel: input.revisionLabel,
      revisionDigest: input.revisionDigest,
    },
    parameters: { unitBudgetGraphemes: UNIT_BUDGET_GRAPHEMES, overlapBlocks: UNIT_OVERLAP_BLOCKS },
    totalBlocks: input.blocks.length,
    totalGraphemes: input.blocks.reduce((total, block) => total + block.graphemes, 0),
    sectionCount: sections.length,
    units,
  };
  const digest = sha256Hex(canonicalJson(body));
  return { ...body, digest };
}

/** Canonical JSON of a manifest including its own digest; what the plan record stores. */
export function canonicalManifestJson(manifest: CoverageManifestProjection): string {
  return canonicalJson(manifest);
}

/** Recompute and compare the manifest digest; a stored manifest that fails is corrupt. */
export function manifestDigestIsExact(manifest: CoverageManifestProjection): boolean {
  const { digest, ...body } = manifest;
  return DIGEST_PATTERN.test(digest) && sha256Hex(canonicalJson(body)) === digest;
}

/**
 * The content-exact, position-independent compatibility key of every unit, in unit order: a digest
 * over the unit's own block content digests and its overlap block content digests, each in order.
 * Overlap context only ever comes from the immediately preceding sub-unit of the same section, so the
 * overlap digests are read from that unit's own digests and need no extra manifest field. Ordinal,
 * positions, and block identities are deliberately excluded: a unit whose content moved but did not
 * change keeps its key, while any own or overlap change gives a new one. Successive manifests of the
 * same Book compare units by this key when a later Run reuses earlier unit results.
 */
export function unitContentKeys(manifest: CoverageManifestProjection): string[] {
  return manifest.units.map((unit, index) => {
    const previous = index === 0 ? null : manifest.units[index - 1]!;
    const overlapBlockDigests = unit.overlapBlockIds.map((blockId) => {
      const overlapIndex = previous === null ? -1 : previous.blockIds.indexOf(blockId);
      requireAnalysis(previous !== null && overlapIndex >= 0 && previous.sectionOrdinal === unit.sectionOrdinal,
        'COVERAGE_MANIFEST_INVALID', '覆盖清单的重叠上下文不来自同一结构段的前一子单元。');
      return previous.blockDigests[overlapIndex]!;
    });
    requireAnalysis(unit.blockDigests.length === unit.blockIds.length, 'COVERAGE_MANIFEST_INVALID', '覆盖清单单元的内容摘要数量无效。');
    return sha256Hex(canonicalJson({ blockDigests: unit.blockDigests, overlapBlockDigests }));
  });
}

/** Every block position of the revision must belong to exactly one unit's own range. */
export function manifestCoversEveryBlock(manifest: CoverageManifestProjection): boolean {
  const covered = new Set<number>();
  for (const unit of manifest.units) {
    for (let position = unit.startPosition; position <= unit.endPosition; position += 1) {
      if (covered.has(position)) return false;
      covered.add(position);
    }
  }
  return covered.size === manifest.totalBlocks &&
    Array.from({ length: manifest.totalBlocks }, (_, index) => index + 1).every((position) => covered.has(position));
}
