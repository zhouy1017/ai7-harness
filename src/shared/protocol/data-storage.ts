import type {
  ManuscriptExportDisposition,
} from '../protocol.js';
import type {
  SeriesKnowledgeItemProjection,
  SeriesMembershipChangeKind,
  SeriesImpactGroupProjection,
  SeriesMembershipChangeProjection,
} from './series.js';

// ---- 设置 › 数据与存储 › 版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1) ---------------------------------

/** One record of the versions that opened the store. */
export interface StoreVersionProjection {
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly schemaRevision: number;
  readonly recordedAt: string;
  /** The backup the open behind this record made before it upgraded the data (Issue #967), and whether it is still there. */
  readonly backup?: { readonly fileName: string; readonly present: boolean };
}

/**
 * 设置 › 数据与存储's 版本 (DSTO-016): the software version and the Data Version apart, whether the Data Version is frozen yet,
 * the latest software update and whether it kept the Data Version, and the records of the versions that opened the store.
 */
export interface DataVersionProjection {
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly frozen: boolean;
  readonly schemaRevision: number;
  readonly update: {
    readonly from: string;
    readonly to: string;
    /** Newer, earlier (an older build opened the store again), or the same precedence (Issue #433 review). */
    readonly direction: 'newer' | 'earlier' | 'same';
    readonly fromDataVersion: number;
    readonly toDataVersion: number;
    readonly recordedAt: string;
  } | null;
  readonly history: ReadonlyArray<StoreVersionProjection>;
  readonly historyTruncated: boolean;
  /** Each upgrade of this data to a later Data Version, newest first (Issue #433, S85b); none before the first release. */
  readonly upgrades: ReadonlyArray<DataVersionUpgradeProjection>;
  /** Where the backup made before each upgrade is kept. */
  readonly backupLocation: string;
  /**
   * The data root's version marker (Issue #967; ADR 0023) as it stands now: every open writes it, so an older build refuses
   * newer data. `present` only while a marker AI7 wrote is there; never a path.
   */
  readonly marker: { readonly present: boolean; readonly writtenAt: string | null; readonly softwareVersion: string | null };
}

/** An upgrade of the data to a later Data Version (Issue #433, S85b; DSTO-016): what changed, and the backup made before it. */
export interface DataVersionUpgradeProjection {
  readonly fromDataVersion: number;
  readonly toDataVersion: number;
  /** The software that last opened the data before; `null` for data from before its versions were recorded. */
  readonly fromSoftwareVersion: string | null;
  readonly rollback?: { readonly softwareVersion: string | null; readonly dataVersion: number; readonly backupFileName: string; readonly backupPresent: boolean };
  readonly softwareVersion: string;
  readonly changes: ReadonlyArray<string>;
  readonly backupFileName: string;
  /** Whether that backup is still in the backup location. */
  readonly backupPresent: boolean;
  readonly recordedAt: string;
}

// ---- 设置 › 数据与存储 › 导出数据库 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.4, §1.6, §1.7) -------------

/** At most this many database exports are listed, newest first. */
export const MAX_DATABASE_EXPORTS_LISTED = 20;

/** What a database package holds, counted when it is made. */
export interface DatabaseExportContentsProjection {
  readonly books: number;
  readonly sourceVersions: number;
  readonly libraryMaterials: number;
  readonly series: number;
}

/**
 * One prepared database export (DSTO-017; EXP-012 to EXP-021): the package with its size, Data Version and contents, the file
 * it would create or replace, and — once approved — what the write came to.
 */
export interface DatabaseExportPreparationProjection {
  readonly preparationId: string;
  readonly fileName: string;
  readonly destination: string;
  readonly disposition: ManuscriptExportDisposition;
  readonly dispositionLabel: string;
  readonly payloadBytes: number;
  readonly dataVersion: number;
  readonly softwareVersion: string;
  readonly contents: DatabaseExportContentsProjection;
  readonly preparedAt: string;
  readonly receipt: DatabaseExportReceiptProjection | null;
}

/**
 * What one approved database export came to: a verified created or replaced file — `已导出到所选位置` — or `未能导出` when
 * nothing at the destination changed, or `结果待确认` when AI7 cannot tell, which never retries by itself.
 */
export interface DatabaseExportReceiptProjection {
  readonly preparationId: string;
  readonly fileName: string;
  readonly destination: string;
  readonly approvedAt: string;
  readonly outcome: 'created' | 'replaced' | 'ambiguous' | 'failed';
  readonly outcomeLabel: string;
  readonly detail: string;
  readonly byteLength: number | null;
  readonly recordedAt: string | null;
}

/**
 * The database export under way, or how the last one in this launch ended (Issue #434 review; V2-UX-EXP-011). A preparation
 * copies the store — the bytes of the pages copied — and then packs it with every other file; an approval reads the prepared
 * file, writes it, and reads it back — `completedBytes` of `totalBytes` in each step —
 * and `cancellable` says whether 取消导出 still stops it, which it does until the file is being put in place. Once it ends:
 * `prepared` with the preparation, `finished` with the approval's receipt, `cancelled` with nothing recorded, or `failed`
 * with why.
 */
export interface DatabaseExportActivityProjection {
  readonly activityId: string;
  readonly kind: 'prepare' | 'approve';
  readonly state: 'running' | 'prepared' | 'finished' | 'cancelled' | 'failed';
  readonly step: 'copying' | 'packing' | 'verifying' | 'writing' | 'committing' | null;
  readonly completedBytes: number;
  readonly totalBytes: number;
  readonly cancellable: boolean;
  /** What a preparation made once it has, and what an approval writes. */
  readonly preparation: DatabaseExportPreparationProjection | null;
  /** What an approval came to, once it did. */
  readonly receipt: DatabaseExportReceiptProjection | null;
  readonly failure: { readonly code: string; readonly message: string } | null;
}

/** The approved database exports, newest first, how many there are, and the export under way. */
export interface DatabaseExportsProjection {
  readonly exports: ReadonlyArray<DatabaseExportReceiptProjection>;
  readonly total: number;
  readonly activity: DatabaseExportActivityProjection | null;
}

// ---- 设置 › 数据与存储 › 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7) ---------------

/** At most this many kept backups are listed, newest first. */
export const MAX_SCHEDULED_BACKUPS_LISTED = 20;

/** One kept backup: its file in the backup location, its size, when it was made and when its fourteen days end. */
export interface ScheduledBackupProjection {
  readonly backupId: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** Whether its file is still in the backup location. */
  readonly present: boolean;
}

/** Why the service's last check made no backup, as the section states it (Issue #434 review). */
export type ScheduledBackupFailureReason = 'no-space' | 'not-writable' | 'location-unavailable' | 'too-large' | 'source-damaged' | 'other';

export interface ScheduledBackupFailureProjection {
  /** When the check that made no backup ran. */
  readonly at: string;
  readonly reason: ScheduledBackupFailureReason;
}

/** 定期自动备份: the switch, off by default; the fixed backup location; and the backups kept, newest first. */
export interface ScheduledBackupsProjection {
  readonly enabled: boolean;
  /** How many times the switch has changed: what a change must name. */
  readonly ordinal: number;
  readonly location: string;
  readonly keptDays: number;
  readonly backups: ReadonlyArray<ScheduledBackupProjection>;
  readonly total: number;
  /** When the next backup is due while the switch is on; `null` while it is off. */
  readonly nextDueAt: string | null;
  /**
   * A backup is being made on the service's background check, never inside a request (Issue #434 review): the section
   * reads again until it is done.
   */
  readonly backingUp: boolean;
  /** The last backup this service could not make, until one is made or the switch is turned off; `null` otherwise. */
  readonly lastFailure: ScheduledBackupFailureProjection | null;
}

export interface SetScheduledBackupInput {
  readonly enabled: boolean;
  readonly expectedOrdinal: number;
}

// ---- 设置 › 数据与存储 › 导入数据库 (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3, §1.4) --------------------

/**
 * Why a database package was made: 导出数据库 (S86a), a 定期自动备份 (S86b), the backup made before a replacement (S86c), or the
 * one made before a merge (S86d).
 */
export type DatabasePackageOrigin = 'database-export' | 'scheduled-backup' | 'pre-replace-backup' | 'pre-merge-backup' | 'pre-upgrade-backup';

/** One Book of a previewed package, as `只导入其中的图书` would take it (Issue #434, S86d; ADR 0079 §1.5). */
export interface DatabaseImportBookProjection {
  readonly bookId: string;
  readonly title: string;
  /** `new` merges; `present` is this very Book, already here, and is not taken again; `same-title` merges beside it. */
  readonly status: 'new' | 'present' | 'same-title';
  /** Its 内部编号 is already another Book's here, so it merges without one. */
  readonly internalNumberCleared: boolean;
}

/**
 * What stays behind when a package's Books merge: Series, 资料库 items, the 编辑工作区方案's enablement, a 内部编号 taken here — and
 * the 范例 of other Books a merging Book's writing Tasks referenced, when neither merges nor is here (Issue #432 re-review), and
 * the 资料库 items' pinned index builds a merging Book's writing Tasks referenced: builds do not merge and a rebuild gets a new
 * digest, and an item no merging Book owns stays behind itself (Issue #771).
 */
export type DatabaseMergeNotice = 'series' | 'internal-number' | 'writing-exemplar' | 'writing-material';

/**
 * Whether this AI7 can take a package's data: the same Data Version, and a schema revision it knows. A package from a newer
 * Data Version or a newer AI7 waits for AI7 to be updated; one from an older Data Version waits for the upgrade path (S85b).
 */
export type DatabaseImportCompatibility = 'compatible' | 'newer-data-version' | 'older-data-version' | 'newer-schema';

/** At most this many replacements are listed, newest first. */
export const MAX_DATABASE_REPLACEMENTS_LISTED = 20;

/**
 * 导入数据库's preview (DSTO-017): a package read and verified member by member — its file, where it came from and when, its
 * versions against this AI7's, and what it holds. Nothing has been taken from it.
 */
export interface DatabaseImportPreviewProjection {
  readonly previewId: string;
  readonly fileName: string;
  readonly source: string;
  readonly byteLength: number;
  readonly origin: DatabasePackageOrigin;
  readonly createdAt: string;
  readonly dataVersion: number;
  readonly softwareVersion: string;
  readonly schemaRevision: number;
  /** This AI7's own Data Version, the package's is read against. */
  readonly localDataVersion: number;
  readonly compatibility: DatabaseImportCompatibility;
  readonly contents: DatabaseExportContentsProjection;
  /** How many files the package holds, each verified. */
  readonly members: number;
  /** Its first Books, as merging would take them (S86d), at most fifty; the rest are counted (Issue #434 review). */
  readonly books: ReadonlyArray<DatabaseImportBookProjection>;
  /** How many of its Books merging would take as new, leave as already here, or take beside one of the same title. */
  readonly bookCounts: { readonly new: number; readonly present: number; readonly sameTitle: number };
  readonly mergeNotices: ReadonlyArray<DatabaseMergeNotice>;
  /**
   * Why merging would be refused over a 资料库 item the Books bring (Issue #434 review; ADR 0079 §1.5), in the editor's words:
   * the same file here as another item, the same item here with other records, or an item that also belonged to a Book not
   * merging. `null` when nothing stands in the way.
   */
  readonly mergeRefusal: string | null;
}

/** A replacement or a merge prepared and waiting for AI7's next start, with the backup made of the data it changes. */
export interface DatabasePendingReplacementProjection {
  readonly replacementId: string;
  readonly kind: 'replace' | 'roll-back' | 'merge';
  readonly packageFileName: string;
  readonly packageCreatedAt: string;
  readonly packageOrigin: DatabasePackageOrigin;
  readonly contents: DatabaseExportContentsProjection;
  readonly backupFileName: string;
  readonly preparedAt: string;
  /** A merge's first Books: the ones it takes, each with how (S86d), at most fifty; `null` for a replacement. */
  readonly mergeBooks: ReadonlyArray<DatabaseImportBookProjection> | null;
  /** How many Books the merge takes; `null` for a replacement. */
  readonly mergeBooksTotal: number | null;
  readonly mergeNotices: ReadonlyArray<DatabaseMergeNotice>;
}

/**
 * One replacement or merge as the data open now records it: an applied replacement in the data it brought in, a failed one in
 * the data it spared; a merge in the data it merged into.
 */
export interface DatabaseReplacementRecordProjection {
  readonly replacementId: string;
  readonly kind: 'replace' | 'roll-back' | 'merge';
  readonly outcome: 'applied' | 'failed';
  readonly packageFileName: string;
  readonly backupFileName: string;
  readonly preparedAt: string;
  readonly recordedAt: string;
  /** Whether its backup is still in the backup location. */
  readonly backupPresent: boolean;
  /** The first titles of the Books a merge took, at most ten; `null` for a replacement. */
  readonly mergedTitles: ReadonlyArray<string> | null;
  /** How many Books a merge took; `null` for a replacement. */
  readonly mergedCount: number | null;
  /**
   * Why one that failed failed: its data would not open; what waited was no longer the package the preparation verified; or
   * an open of the data it moved in was interrupted, which leaves nothing to tell that data from what was verified (Issue #434
   * review); a merge's Books conflicted with what this data holds now; or a merge could not finish writing its Books, before
   * any of them committed (Issue #644). `null` for one applied, and for one that failed before this was recorded.
   */
  readonly failure: DatabaseReplacementFailure | null;
}

/**
 * Why a replacement or a merge failed, as its record says. `conflict` and `unmergeable` are a merge's: `unmergeable` is a merge
 * that stopped on something other than a conflict — a file it takes, or a write into the store — and only a merge records it.
 */
export type DatabaseReplacementFailure = 'unopenable' | 'changed' | 'interrupted' | 'conflict' | 'unmergeable';

/** 替换本机全部数据: the replacement waiting for AI7's next start, if any, and the replacements this data records. */
export interface DatabaseReplacementsProjection {
  readonly pending: DatabasePendingReplacementProjection | null;
  readonly replacements: ReadonlyArray<DatabaseReplacementRecordProjection>;
  readonly total: number;
  /** The replacement `回退到替换前的数据` undoes: the latest, when it replaced this data and its backup is still there. */
  readonly rollBackOf: string | null;
  readonly backupLocation: string;
}

export interface SeriesKnowledgePromotionProjection {
  readonly itemId: string;
  readonly revisionId: string;
  readonly completionLabel: '书系知识已纳入' | '书系知识已更新';
  /** The item as it now stands: the answer carries it alone (Issue #63 review). */
  readonly item: SeriesKnowledgeItemProjection;
}

export interface PreviewSeriesMembershipChangeInput {
  readonly seriesId: string;
  readonly bookId: string;
  readonly kind: SeriesMembershipChangeKind;
}

/** The Series Membership Impact Preview (SER-003 to SER-008): exact identities first, then the four groups, then the one action. */
export interface SeriesMembershipPreviewProjection {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly actionLabel: '加入书系' | '移出书系';
  readonly groups: ReadonlyArray<SeriesImpactGroupProjection>;
  /** What the commit names so a changed membership or governing record refuses it (SER-010). */
  readonly previewDigest: string;
}

export interface ChangeSeriesMembershipInput {
  readonly seriesId: string;
  readonly bookId: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly previewDigest: string;
}

export interface SeriesMembershipChangeResultProjection {
  readonly changeId: string;
  /** `已加入书系「…」：《…》` or `已移出书系「…」：《…》`. */
  readonly completionLabel: string;
  /** The record the change made: the answer carries it alone, and the page reads the Series again (Issue #63 review). */
  readonly change: SeriesMembershipChangeProjection;
}
