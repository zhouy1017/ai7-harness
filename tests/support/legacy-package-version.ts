import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';

/**
 * A 图书交付包 version in the shape packages had before Issue #1639, inserted beside an existing one: each included derivative
 * names the Delivery Record the package held (`deliveryId`), its `limitations` carry the delivery-based sentence that was stored
 * with it, and its three exclusion keys are stored. Its `canonical_json`, its content digest and its digest are computed here, so a
 * test can compare what the store reads back with exactly what was inserted. The source version must hold a derivative that has a
 * Delivery Record on the held version.
 */
export interface LegacyPackageVersion {
  packageVersionId: string;
  preparedAt: string;
  content: Record<string, unknown>;
  contentDigest: string;
  digest: string;
  canonicalJson: string;
}

export const LEGACY_PACKAGE_EXCLUSIONS = ['editor-notes', 'library-originals', 'intermediate-revisions'];

export function insertLegacyPackageVersion(databasePath: string, sourcePackageVersionId: string, preparedAt?: string): LegacyPackageVersion {
  const database = new DatabaseSync(databasePath);
  try {
    const row = database.prepare('SELECT * FROM book_delivery_package_versions WHERE package_version_id = ?').get(sourcePackageVersionId) as Record<string, string | number>;
    const record = JSON.parse(String(row['canonical_json'])) as { content: { documents: Array<Record<string, unknown>>; limitations: string[] }; preparedAt: string; [key: string]: unknown };
    const at = preparedAt ?? String(row['prepared_at']);
    const documents = record.content.documents.map((entry) => {
      if (entry['disposition'] !== 'included') return entry;
      const deliveryIds = entry['deliveryIds'] as string[];
      if (deliveryIds.length === 0) throw new Error('the source version holds a derivative with no Delivery Record');
      return { ...entry, deliveryId: deliveryIds[0] };
    });
    const content = {
      ...record.content,
      documents,
      exclusions: LEGACY_PACKAGE_EXCLUSIONS,
      limitations: [...record.content.limitations, ...documents.filter((entry) => entry['disposition'] === 'included')
        .map((entry) => `新闻稿：交付后有修改，本包按交付时的版本 ${String(entry['version'])}。`)],
    };
    const forged = { ...record, packageVersionId: randomUUID(), version: Number(row['version']) + 1, priorVersionId: sourcePackageVersionId,
      preparedAt: at, contentDigest: canonicalRecord(content).digest, content };
    const canonical = canonicalRecord(forged);
    database.prepare(`INSERT INTO book_delivery_package_versions(package_version_id, package_id, book_id, version, prior_version_id, purpose,
      publication_version_id, content_sha256, actor, prepared_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(forged.packageVersionId, row['package_id']!, row['book_id']!, forged.version, sourcePackageVersionId, row['purpose']!, row['publication_version_id']!,
        forged.contentDigest, row['actor']!, at, canonical.json, canonical.digest);
    return { packageVersionId: forged.packageVersionId, preparedAt: at, content, contentDigest: forged.contentDigest, digest: canonical.digest, canonicalJson: canonical.json };
  } finally {
    database.close();
  }
}
