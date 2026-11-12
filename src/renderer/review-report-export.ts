import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type RendererApi } from '../shared/protocol.js';

/**
 * 导出审阅报告（DOCX） (Issue #1430): one click compiles the Book's 审阅报告, opens the system Save dialog on
 * 「《书名》_审阅报告.docx」 and writes it through the export ledger every export uses, ending on 「审阅报告已导出至 <path>」.
 * The dialog's Save is the editor's one decision; nothing else is asked. A new report version is recorded only once a
 * destination is chosen and only when the findings changed since the latest one (Issue #1446).
 */
type ReportExportApi = Pick<RendererApi, 'reviewManuscriptExport' | 'chooseManuscriptExportDestination' | 'approveManuscriptExport'>;
type SetStatus = (message: string, tone?: 'busy' | 'success' | 'error') => void;

export const REVIEW_REPORT_EXPORT_WORDS = {
  action: '导出审阅报告（DOCX）',
  menuAction: '导出审阅报告（.docx）',
  compiling: '正在整理审阅报告…',
  writing: '正在导出审阅报告…',
  cancelled: '已取消导出审阅报告。',
  failed: '未能导出审阅报告。',
  exported: (destination: string): string => `审阅报告已导出至 ${destination}`,
} as const;

async function exportReviewReportDocx(api: ReportExportApi, bookId: string, setStatus: SetStatus): Promise<void> {
  setStatus(REVIEW_REPORT_EXPORT_WORDS.compiling, 'busy');
  const options = { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS };
  const reviewed = await api.reviewManuscriptExport({ target: { kind: 'book-review-report' }, options, format: 'docx' });
  if (reviewed.bookId !== bookId || reviewed.target.report === null) throw new Error(REVIEW_REPORT_EXPORT_WORDS.failed);
  const chosen = await api.chooseManuscriptExportDestination({ target: { kind: 'report', reportId: reviewed.target.report.reportId },
    revisionId: reviewed.target.revisionId, options, format: 'docx', reviewDigest: reviewed.reviewDigest, suggestedFileName: reviewed.suggestedFileName });
  if (chosen.outcome === 'cancelled') { setStatus(REVIEW_REPORT_EXPORT_WORDS.cancelled); return; }
  if (chosen.preparation.bookId !== bookId) throw new Error(REVIEW_REPORT_EXPORT_WORDS.failed);
  setStatus(REVIEW_REPORT_EXPORT_WORDS.writing, 'busy');
  const receipt = await api.approveManuscriptExport({ preparationId: chosen.preparation.preparationId });
  if (receipt.bookId !== bookId || receipt.preparationId !== chosen.preparation.preparationId) throw new Error(REVIEW_REPORT_EXPORT_WORDS.failed);
  if (receipt.outcome === 'created' || receipt.outcome === 'replaced') setStatus(REVIEW_REPORT_EXPORT_WORDS.exported(receipt.destination), 'success');
  else setStatus(receipt.detail || receipt.outcomeLabel, 'error');
}

/** The one-step button: `data-review-action="export-docx-report"`, disabled while it runs and whenever `enabled` says so. */
export function reviewReportExportButton(options: {
  api: ReportExportApi;
  bookId: string;
  enabled: () => boolean;
  setStatus: SetStatus;
  errorMessage: (error: unknown, fallback: string) => string;
  /** The manuscript export bar's quiet menu entry rather than 审阅's header button. */
  inMenu?: boolean;
  beforeExport?: () => Promise<boolean>;
  onStart?: () => void;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.inMenu === true ? 'quiet' : 'secondary';
  button.textContent = options.inMenu === true ? REVIEW_REPORT_EXPORT_WORDS.menuAction : REVIEW_REPORT_EXPORT_WORDS.action;
  button.dataset['reviewAction'] = 'export-docx-report';
  button.disabled = !options.enabled();
  let busy = false;
  button.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    options.onStart?.();
    void (async () => {
      if (options.beforeExport !== undefined && !await options.beforeExport()) return;
      await exportReviewReportDocx(options.api, options.bookId, options.setStatus);
    })().catch((error: unknown) => options.setStatus(options.errorMessage(error, REVIEW_REPORT_EXPORT_WORDS.failed), 'error'))
      .finally(() => { busy = false; button.disabled = !options.enabled(); });
  });
  return button;
}
