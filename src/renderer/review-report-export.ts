import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type RendererApi } from '../shared/protocol.js';

type ReportExportApi = Pick<RendererApi, 'reviewManuscriptExport' | 'chooseManuscriptExportDestination' | 'approveManuscriptExport'>;

/** Compile → native Save dialog → existing atomic export and receipt. The dialog's Save is the user's approval. */
export async function exportReviewReportDocx(api: ReportExportApi, bookId: string,
  setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void): Promise<void> {
  setStatus('正在整理审阅报告…', 'busy');
  const options = { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS };
  const reviewed = await api.reviewManuscriptExport({ target: { kind: 'book-review-report' }, options, format: 'docx' });
  if (reviewed.bookId !== bookId || reviewed.target.report === null) throw new Error('未能整理这本书的审阅报告。');
  const chosen = await api.chooseManuscriptExportDestination({ target: { kind: 'report', reportId: reviewed.target.report.reportId },
    revisionId: reviewed.target.revisionId, options, format: 'docx', reviewDigest: reviewed.reviewDigest, suggestedFileName: reviewed.suggestedFileName });
  if (chosen.outcome === 'cancelled') { setStatus('已取消导出审阅报告。'); return; }
  if (chosen.preparation.bookId !== bookId) throw new Error('导出不属于这本书。');
  setStatus('正在导出审阅报告…', 'busy');
  const receipt = await api.approveManuscriptExport({ preparationId: chosen.preparation.preparationId });
  if (receipt.bookId !== bookId || receipt.preparationId !== chosen.preparation.preparationId) throw new Error('未能确认审阅报告的导出结果。');
  setStatus(receipt.outcome === 'created' || receipt.outcome === 'replaced' ? `审阅报告已导出至 ${receipt.destination}` : receipt.detail,
    receipt.outcome === 'created' || receipt.outcome === 'replaced' ? 'success' : 'error');
}

export function reviewReportExportButton(options: { api: ReportExportApi; bookId: string; enabled: boolean;
  setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void; beforeExport?: () => Promise<boolean> }): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'secondary'; button.textContent = '导出审阅报告（DOCX）';
  button.dataset['reviewAction'] = 'export-docx-report'; button.disabled = !options.enabled;
  button.addEventListener('click', () => {
    button.disabled = true;
    void (async () => {
      if (options.beforeExport && !await options.beforeExport()) return;
      await exportReviewReportDocx(options.api, options.bookId, options.setStatus);
    })().catch((error: unknown) => options.setStatus(error instanceof Error ? error.message : '未能导出审阅报告。', 'error'))
      .finally(() => { button.disabled = !options.enabled; });
  });
  return button;
}
