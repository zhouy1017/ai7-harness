import { posix } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { unzipSync, strFromU8 } from 'fflate';
import { SaxesParser } from 'saxes';
import type { ManuscriptBlockProjection, ManuscriptSourceDisplay } from '../../shared/protocol/manuscript-notes.js';
import { asString, requireBounded, type SqlRow } from './bounded-kernel.js';

const WORD = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);
interface SourceTable { paragraphs: number[]; rows: string[][] }
export interface SourceObjects {
  tables: SourceTable[];
  images: Array<{ paragraph: number; preview: ManuscriptSourceDisplay['images'][number]; media?: { bytes: Uint8Array; mime: string } }>;
}

/** Read only retained parts. Relationship targets never become network/file URLs in the renderer. */
export function readSourceObjects(bytes: Uint8Array, reading: 'rejected' | 'accepted' = 'rejected'): SourceObjects {
  const files = unzipSync(bytes, { filter: (file) => file.name === 'word/document.xml' || file.name === 'word/_rels/document.xml.rels' || file.name.startsWith('word/media/') });
  const relations = new Map<string, string>();
  const rels = new SaxesParser({ xmlns: true });
  rels.on('opentag', (tag) => {
    const attr = (name: string): string | undefined => Object.values(tag.attributes).find((a) => a.local === name)?.value;
    if (tag.local !== 'Relationship' || attr('TargetMode') === 'External') return;
    const id = attr('Id');
    const target = attr('Target');
    if (id !== undefined && target !== undefined) {
      const path = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join('word', target));
      if (path.startsWith('word/media/')) relations.set(id, path);
    }
  });
  if (files['word/_rels/document.xml.rels']) rels.write(strFromU8(files['word/_rels/document.xml.rels']!)).close();
  const result: SourceObjects = { tables: [], images: [] };
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  const paragraphs: number[] = [];
  const alternates: Array<{ depth: number; chosen: boolean }> = [];
  const tables: SourceTable[] = [];
  let paragraph = -1;
  let textDepth = 0;
  let skip = -1;
  let box = 0;
  let image = false;
  let imageAdded = false;
  let drawingBox = false;
  const preview = (id: string): Pick<SourceObjects['images'][number], 'preview' | 'media'> => {
    const path = relations.get(id);
    const data = path === undefined ? undefined : files[path];
    let mime: string | undefined;
    if (data !== undefined) {
      if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) mime = 'image/png';
      else if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) mime = 'image/jpeg';
      else if (strFromU8(data.subarray(0, 6)).startsWith('GIF8')) mime = 'image/gif';
      else if (strFromU8(data.subarray(0, 4)) === 'RIFF' && strFromU8(data.subarray(8, 12)) === 'WEBP') mime = 'image/webp';
    }
    return { preview: { label: '稿件内嵌图片', dataUrl: mime !== undefined && data !== undefined && data.byteLength <= 96 * 1024
      ? `data:${mime};base64,${Buffer.from(data).toString('base64')}` : null },
      ...(mime !== undefined && data !== undefined ? { media: { bytes: data, mime } } : {}) };
  };
  parser.on('opentag', (tag) => {
    if (WORD.has(tag.uri) && tag.local === 'p') { paragraph += 1; paragraphs.push(paragraph); }
    stack.push(tag.local);
    if (skip >= 0) return;
    if (tag.local === 'AlternateContent') alternates.push({ depth: stack.length, chosen: false });
    if (tag.local === 'Choice' && alternates.length > 0) {
      const alternate = alternates.at(-1)!;
      if (alternate.chosen) { skip = stack.length; return; }
      alternate.chosen = true;
    }
    const excluded = reading === 'accepted' ? ['del', 'moveFrom', 'rPrChange', 'pPrChange'] : ['ins', 'moveTo', 'rPrChange', 'pPrChange'];
    if (tag.local === 'Fallback' || (WORD.has(tag.uri) && excluded.includes(tag.local))) { skip = stack.length; return; }
    if (WORD.has(tag.uri) && tag.local === 'txbxContent') { box += 1; drawingBox = true; }
    if (box > 0) return;
    if (WORD.has(tag.uri)) {
      if (tag.local === 'tbl') { const table = { paragraphs: [], rows: [] }; result.tables.push(table); tables.push(table); }
      if (tag.local === 'tr') tables.at(-1)?.rows.push([]);
      if (tag.local === 'tc') tables.at(-1)?.rows.at(-1)?.push('');
      if (tag.local === 'p') {
        tables.at(-1)?.paragraphs.push(paragraph);
        const row = tables.at(-1)?.rows.at(-1);
        if (row && row.length > 0 && row.at(-1) !== '') row[row.length - 1] += '\n';
      }
      if (tag.local === 't' || tag.local === 'delText') textDepth += 1;
      if (tag.local === 'drawing' || tag.local === 'pict') { image = true; imageAdded = false; drawingBox = false; }
    }
    if (image && (tag.local === 'blip' || tag.local === 'imagedata')) {
      const id = Object.values(tag.attributes).find((a) => ['embed', 'id'].includes(a.local) && a.uri.includes('relationships'))?.value;
      if (id !== undefined) { result.images.push({ paragraph: paragraphs.at(-1) ?? paragraph, ...preview(id) }); imageAdded = true; }
    }
  });
  parser.on('text', (text) => {
    if (skip >= 0 || box > 0 || textDepth === 0) return;
    const row = tables.at(-1)?.rows.at(-1);
    if (row && row.length > 0) row[row.length - 1] += text;
  });
  parser.on('closetag', (tag) => {
    if (skip === stack.length) skip = -1;
    else if (skip < 0) {
      if (WORD.has(tag.uri) && tag.local === 'txbxContent') box -= 1;
      if (box === 0 && WORD.has(tag.uri)) {
        if (tag.local === 't' || tag.local === 'delText') textDepth -= 1;
        if (tag.local === 'tbl') tables.pop();
        if (tag.local === 'drawing' || tag.local === 'pict') {
          if (!imageAdded && !drawingBox) result.images.push({ paragraph: paragraphs.at(-1) ?? paragraph, preview: { label: '稿件内嵌图片', dataUrl: null } });
          image = false;
        }
      }
    }
    if (WORD.has(tag.uri) && tag.local === 'p') paragraphs.pop();
    if (tag.local === 'AlternateContent' && alternates.at(-1)?.depth === stack.length) alternates.pop();
    stack.pop();
  });
  if (files['word/document.xml']) parser.write(strFromU8(files['word/document.xml']!)).close();
  return result;
}

/** Source-only presentation layered on the original paragraph identities; no copied media or lossy table model is persisted. */
export class ManuscriptSourceObjects {
  #cached: { digest: string; objects: SourceObjects } | undefined;
  #mapping: { revisionId: string; rows: SqlRow[] } | undefined;
  constructor(readonly db: DatabaseSync, readonly readObject: (digest: string) => Uint8Array) {}

  #source(revisionId: string): { objects: SourceObjects; rows: SqlRow[]; sourceVersionId: string } | undefined {
    const source = this.db.prepare(`SELECT mr.source_version_id, sv.object_digest, sv.format, sv.converter_identity
      FROM manuscript_revisions mr JOIN source_versions sv ON sv.source_version_id = mr.source_version_id WHERE mr.revision_id = ?`).get(revisionId) as SqlRow | undefined;
    if (!source || source.format !== 'DOCX' || source.converter_identity !== null) return undefined;
    if (!this.db.prepare(`SELECT 1 FROM import_fidelity_reviews r JOIN import_fidelity_categories c ON c.fidelity_review_id = r.fidelity_review_id
      WHERE r.source_version_id = ? AND c.category_key IN ('tables', 'images-captions') AND c.item_count > 0 LIMIT 1`).get(asString(source.source_version_id))) return undefined;
    if (this.#mapping?.revisionId !== revisionId) this.#mapping = { revisionId, rows: this.db.prepare(`WITH RECURSIVE ancestors(revision_id, parent_revision_id, depth) AS (
      SELECT revision_id, parent_revision_id, 0 FROM manuscript_revisions WHERE revision_id = ?
      UNION ALL SELECT r.revision_id, r.parent_revision_id, a.depth + 1 FROM manuscript_revisions r JOIN ancestors a
        ON r.revision_id = a.parent_revision_id WHERE r.source_version_id = ? AND a.depth < 100000),
      nearest AS (SELECT a.revision_id FROM ancestors a WHERE EXISTS(SELECT 1 FROM manuscript_block_sources x WHERE x.revision_id = a.revision_id)
        OR EXISTS(SELECT 1 FROM word_manuscript_source_segments w WHERE w.revision_id = a.revision_id) ORDER BY a.depth LIMIT 1)
      SELECT s.block_id, s.source_paragraph_index, 'suggestions' mode FROM manuscript_block_sources s
        WHERE s.source_part = 'body' AND s.revision_id = (SELECT revision_id FROM nearest)
      UNION SELECT w.block_id, CAST(json_extract(w.canonical_json, '$.fragment.paragraphIndex') AS INTEGER) source_paragraph_index, i.mode
        FROM word_manuscript_source_segments w JOIN word_revision_imports i ON i.revision_id = w.revision_id
        WHERE w.revision_id = (SELECT revision_id FROM nearest) AND json_extract(w.canonical_json, '$.fragment.part') = 'word/document.xml'
      ORDER BY source_paragraph_index`).all(revisionId, asString(source.source_version_id)) as SqlRow[] };
    const digest = asString(source.object_digest);
    const reading = this.#mapping.rows[0]?.mode === 'accepted-baseline' ? 'accepted' : 'rejected';
    const cacheKey = `${digest}:${reading}`;
    if (this.#cached?.digest !== cacheKey) this.#cached = { digest: cacheKey, objects: readSourceObjects(this.readObject(digest), reading) };
    return { objects: this.#cached.objects, rows: this.#mapping.rows, sourceVersionId: asString(source.source_version_id) };
  }

  imageChunk(revisionId: string, sourceVersionId: string, ordinal: number, offset: number): { base64: string; totalBytes: number; mime: string } {
    const source = this.#source(revisionId);
    const media = source?.objects.images[ordinal]?.media;
    requireBounded(source?.sourceVersionId === sourceVersionId && media !== undefined && Number.isSafeInteger(offset) && offset >= 0 && offset < media.bytes.length,
      'SOURCE_IMAGE_CHANGED', '图片来源已变化，请重新打开当前稿件。');
    return { base64: Buffer.from(media.bytes.subarray(offset, offset + 128 * 1024)).toString('base64'), totalBytes: media.bytes.length, mime: media.mime };
  }

  isReadOnly(revisionId: string, blockId: string): boolean {
    const source = this.#source(revisionId);
    const index = source?.rows.find((row) => row.block_id === blockId)?.source_paragraph_index;
    return index !== undefined && source!.objects.tables.some((table) => table.paragraphs.includes(Number(index)));
  }

  project(revisionId: string, blocks: ManuscriptBlockProjection[], branchId?: string): ManuscriptBlockProjection[] {
    const source = this.#source(revisionId);
    if (!source) return blocks;
    const byId = new Map(source.rows.map((row) => [asString(row.block_id), Number(row.source_paragraph_index)]));
    const shown = new Set<SourceTable>();
    const assignedImages = new Map<string, ManuscriptSourceDisplay['images']>();
    for (const [ordinal, image] of source.objects.images.entries()) {
      // An image-only paragraph has no editable block: show it after the preceding source block, or before the first.
      const owner = source.rows.findLast((row) => Number(row.source_paragraph_index) <= image.paragraph) ?? source.rows[0];
      if (!owner) continue;
      let id = asString(owner.block_id);
      if (!blocks.some((block) => block.blockId === id) && branchId !== undefined) {
        const merged = this.db.prepare(`WITH RECURSIVE owners(block_id, depth) AS (
          SELECT ?, 0 UNION ALL SELECT l.related_block_id, o.depth + 1 FROM owners o JOIN manuscript_block_lineage l ON l.block_id = o.block_id
          JOIN manuscript_command_groups g ON g.command_group_id = l.command_group_id
          WHERE l.relation = 'merged-into' AND g.branch_id = ? AND g.status = 'applied' AND o.depth < 100000)
          SELECT o.block_id FROM owners o JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = o.block_id ORDER BY o.depth DESC LIMIT 1`)
          .get(id, branchId, branchId) as SqlRow | undefined;
        if (merged) id = asString(merged.block_id);
      }
      if (!blocks.some((block) => block.blockId === id)) continue;
      assignedImages.set(id, [...(assignedImages.get(id) ?? []), { ...image.preview, before: Number(owner.source_paragraph_index) > image.paragraph,
        ...(image.media ? { sourceImage: { sourceVersionId: source.sourceVersionId, ordinal } } : {}) }]);
    }
    let budget = Math.max(0, 480 * 1024 - Buffer.byteLength(JSON.stringify(blocks), 'utf8'));
    return blocks.map((block) => {
      const table = source.objects.tables.find((candidate) => candidate.paragraphs.includes(byId.get(block.blockId) ?? -1));
      const images = (assignedImages.get(block.blockId) ?? []).map((image) => {
        const length = image.dataUrl?.length ?? 0;
        if (length > budget) return { ...image, dataUrl: null };
        budget -= length;
        return image;
      });
      if (table === undefined && images.length === 0) return block;
      const display: ManuscriptSourceDisplay = { images, table: null };
      if (table !== undefined) {
        const continuation = shown.has(table);
        shown.add(table);
        let chars = 0;
        let bytes = 512;
        const rows: string[][] = [];
        if (!continuation) for (const row of table.rows.slice(0, 100)) {
          const cells: string[] = [];
          for (const cell of row.slice(0, 50)) {
            const remaining = budget - bytes;
            if (remaining < 8) break;
            const text = cell.slice(0, Math.max(0, Math.min(4096, 32000 - chars, Math.floor(remaining / 6))));
            chars += text.length;
            bytes += Buffer.byteLength(JSON.stringify(text), 'utf8') + 4;
            cells.push(text);
          }
          if (cells.length > 0) rows.push(cells);
          if (budget - bytes < 8) break;
        }
        display.table = { rows, continuation, truncated: !continuation && (table.rows.length > rows.length ||
          table.rows.some((row, at) => row.length > (rows[at]?.length ?? 0) || row.some((cell, col) => cell.length > (rows[at]?.[col]?.length ?? 0)))) };
        budget = Math.max(0, budget - Buffer.byteLength(JSON.stringify(display.table), 'utf8'));
      }
      return { ...block, sourceDisplay: display };
    });
  }
}
