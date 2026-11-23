import { guidelineClauses } from './fast-role/flash-task-contract.js';
import { StoreError, requireStore } from './store-records.js';
import { readGuidelineFile, ReviewGuidelineError, ReviewGuidelineLedger } from './review-guidelines.js';
import type { ReviewGuidelinePreviewProjection } from '../shared/protocol.js';

export interface EditorialStoreGuidelineFormatter {
  model: () => string | null;
  format: (paragraphs: readonly string[]) => Promise<import('./fast-role/flash-task-contract.js').FlashTaskResult<string[]>>;
}

export class ReviewGuidelineFormatting {
  constructor(private readonly ledger: ReviewGuidelineLedger, private readonly assertAvailable: () => void, private readonly call: <T>(operation: () => T) => T) {}
  #guidelineFormatter: EditorialStoreGuidelineFormatter | null = null;
  #guidelineOffer: { documentId: string; digest: string; model: string } | null = null;

  useGuidelineFormatter(formatter: EditorialStoreGuidelineFormatter): void {
    this.#guidelineFormatter = formatter;
  }

  /** 导入新版本's first step: the picked file's clauses as the next version of one document would read them; nothing is recorded. */
  async previewReviewGuidelineVersion(documentId: string, path: string | undefined, formatConfirmed = false): Promise<ReviewGuidelinePreviewProjection> {
    this.assertAvailable();
    if (typeof path !== 'string' || path.length === 0) throw new StoreError('REVIEW_GUIDELINE_FILE_UNREADABLE', '请重新选择文件。');
    let read: Awaited<ReturnType<typeof readGuidelineFile>>;
    try {
      read = await readGuidelineFile(path);
    } catch (error) {
      if (error instanceof ReviewGuidelineError) throw new StoreError(error.code, error.message);
      throw error;
    }
    const previous = this.#guidelineOffer;
    this.#guidelineOffer = null;
    if (formatConfirmed) requireStore(previous?.documentId === documentId && previous.digest === read.source.sha256 &&
      previous.model === this.#guidelineFormatter?.model(), 'REVIEW_GUIDELINE_CHANGED', '文件或所选模型已变化，请重新选择。');
    try {
      return this.call(() => this.ledger.preview(documentId, read));
    } catch (error) {
      if (!(error instanceof StoreError) || error.code !== 'REVIEW_GUIDELINE_NO_CLAUSES' || !this.#guidelineFormatter) throw error;
      const model = this.#guidelineFormatter.model();
      if (!model) throw error;
      const bytes = Buffer.byteLength(guidelineClauses.message(read.paragraphs));
      if (bytes > guidelineClauses.budget.maxInputBytes) throw new StoreError('REVIEW_GUIDELINE_TOO_LARGE', '文件超过一次整理的范围，请分为较小的规范文件。');
      if (!formatConfirmed) {
        this.#guidelineOffer = { documentId, digest: read.source.sha256, model };
        throw new StoreError('REVIEW_GUIDELINE_FORMAT_OFFER', `文件没有编号。可将选定文件的 ${read.paragraphs.length} 段（约 ${Math.ceil(bytes / 1024)} KB）发给底层 Flash（${model}）整理。预计一次请求，结果可逐条核对后导入。`);
      }
      const result = await this.#guidelineFormatter.format(read.paragraphs);
      if (result.state !== 'checked') throw new StoreError('REVIEW_GUIDELINE_FORMAT_UNAVAILABLE', result.reason);
      const clauses = result.value;
      return { ...this.call(() => this.ledger.preview(documentId,
        { source: read.source, paragraphs: clauses.map((clause, index) => `${index + 1}. ${clause}`) })), modelFormatted: true };
    }
  }

}
