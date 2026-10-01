import { describe, expect, it } from 'vitest';
import * as labels from '../../src/renderer/book-delivery-package-labels.js';
import {
  BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT,
  BOOK_DELIVERY_PACKAGE_EXPORT_WORDS,
  bookDeliveryPackageExportSummary,
} from '../../src/service/book-delivery-package-exports.js';
import {
  BOOK_DELIVERY_PACKAGE_CONDITION_LABELS,
  BOOK_DELIVERY_PACKAGE_REFUSALS,
  BOOK_DELIVERY_PACKAGE_STATEMENT,
  BOOK_DELIVERY_PACKAGE_WORDS,
  bookDeliveryPackageNotReady,
} from '../../src/service/book-delivery-packages.js';
import { PUBLICATION_FORBIDDEN_WORDS } from '../../src/shared/protocol.js';

// The words of 图书交付包 (Issue #416, plan slices S67a and S67b; V2-UX-BUNDLE-001 to 005, DPKG-011, EXP-010 to EXP-022),
// byte for byte: the page's own and the service's, which reach the page through the projection.

describe('the words of 图书交付包', () => {
  it('names the block, its conditions, its preview and its versions', () => {
    expect(labels.PACKAGE_HEADING).toBe('图书交付包');
    expect(labels.PACKAGE_CONDITIONS_HEADING).toBe('条件');
    expect(labels.PACKAGE_CONDITION_STATE).toEqual({ met: '✓ 已满足', unmet: '○ 未满足' });
    expect([labels.PACKAGE_PREVIEW_HEADING, labels.PACKAGE_INCLUDED_HEADING, labels.PACKAGE_EXCLUDED_HEADING, labels.PACKAGE_LIMITATIONS_HEADING])
      .toEqual(['清单预览', '包含', '不包含', '限制']);
    expect(labels.PACKAGE_INCLUDED_TRUNCATED).toBe('更早的审阅报告也在包中，这里只列出最近的。');
    expect(labels.PACKAGE_LIMITATIONS_TRUNCATED).toBe('更早的审阅也各有说明，都写在包的内容里，这里只列出最近的。');
    expect(labels.PACKAGE_PURPOSE_LABEL).toBe('交付包用途');
    expect(labels.PACKAGE_PURPOSE_HINT).toBe('写明为什么准备这一版，例如「交出版社存档」。');
    expect(labels.PACKAGE_PREPARE).toBe('准备图书交付包');
    expect(labels.PACKAGE_PURPOSE_NEEDED).toBe('先写明交付包用途。');
    expect([labels.PACKAGE_VERSIONS_HEADING, labels.PACKAGE_VERSIONS_TRUNCATED, labels.PACKAGE_CURRENT_MARK, labels.PACKAGE_PREPARED])
      .toEqual(['已准备的版本', '更早的版本保留在记录中。', '当前', '图书交付包已准备']);
    expect(labels.PACKAGE_STATUS_LINES).toEqual({ preparing: '正在准备图书交付包…', prepareFailed: '无法准备图书交付包。', refreshFailed: '无法读取图书交付包。' });
    expect(labels.packageNotReadyLine(['发稿版本', '营销要点'])).toBe('还不能准备：发稿版本、营销要点未满足。');
    expect(labels.packageChangedLine('v1')).toBe('内容与图书交付包 v1 不同：再次准备会生成新的版本，v1 保持不变。');
    expect(labels.packageVersionLine({ label: 'v2', exportHistoryLabel: '暂无导出记录' })).toBe('v2 · 图书交付包已准备 · 暂无导出记录');
    expect(labels.packageVersionMeta('交出版社存档', '9月24日 12:30')).toBe('用途：交出版社存档 · 9月24日 12:30');
    expect(labels.packagePreparedLine('v1')).toBe('已准备图书交付包 v1');
    expect(labels.packageUnchangedLine('v1')).toBe('内容和用途都没有变化，仍是图书交付包 v1');
  });

  it('states what a package is and is not, and every condition, route and refusal in the service\'s words', () => {
    expect(BOOK_DELIVERY_PACKAGE_STATEMENT).toBe('图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。');
    expect(BOOK_DELIVERY_PACKAGE_CONDITION_LABELS).toEqual({ publication: '发稿版本', workRecords: '工作记录' });
    expect(BOOK_DELIVERY_PACKAGE_WORDS).toEqual({
      publicationMissing: '尚未设发稿版本',
      publicationNotice: '自发稿版本后有修改：可以另设发稿版本，也可以按当前发稿版本打包。',
      publicationRoute: '设为发稿版本…',
      notForThisBook: '本书不做',
      documentMissing: '尚未创建',
      documentUndelivered: '尚未交付',
      documentNotice: '交付后有修改：可以再交付，也可以按交付过的版本打包。',
      documentCreateRoute: '前往生产文档',
      documentDeliverRoute: '交付…',
      documentRedeliverRoute: '再交付…',
      noReviews: '暂无审阅记录',
      reviewRoute: '前往审阅',
      exportHistoryNone: '暂无导出记录',
      editorNotes: '备注',
      editorNotesDetail: '稿件与文档上的备注只供编辑自己参考',
      libraryOriginals: '资料库原件',
      intermediateRevisions: '中间修订版',
      intermediateRevisionsDetail: '稿件只含发稿版本，文档只含交付过的版本',
      unavailableRecords: '评估记录与定稿的审稿意见：AI7 尚未提供这两类记录，本包不含。',
    });
    expect(BOOK_DELIVERY_PACKAGE_REFUSALS).toEqual({
      changed: '图书交付包的内容在查看后又有变化，请看过新的内容再准备。',
      purpose: '请写明交付包用途（1–80 个字）。',
    });
    expect(bookDeliveryPackageNotReady(['营销要点'])).toBe('还不能准备图书交付包：营销要点未满足。');
  });

  it('names a version\'s export, its folder, its approval and what each file came to (S67b)', () => {
    expect(labels.PACKAGE_EXPORT_ACTION_LABELS).toEqual({
      open: '导出…', choose: '选择位置…', chooseAgain: '重新选择位置…', approve: '按上述方式导出', cancel: '取消', close: '完成', reveal: '在文件夹中显示',
    });
    expect(labels.packageExportOpenAccessibleName('v2')).toBe('导出图书交付包 v2…');
    expect(labels.packageExportHeading('v2')).toBe('导出 · 图书交付包 v2');
    expect([labels.PACKAGE_EXPORT_FILES_LABEL, labels.PACKAGE_EXPORT_FILES_TRUNCATED]).toEqual(['写入所选文件夹的文件', '还有其他文件，可以翻页查看并另行选择导出。']);
    expect(labels.packageExportFileName('书名 · 一审稿.docx', 'docx')).toBe('「书名 · 一审稿.docx」 · DOCX');
    expect(labels.packageExportFileName('交付包清单.md', 'markdown')).toBe('「交付包清单.md」 · Markdown');
    expect(labels.PACKAGE_EXPORT_FOLDER_UNCHOSEN)
      .toBe('还没有选择文件夹。请选择一个空文件夹，或在系统的对话框里新建一个：已有同名文件的文件夹不能使用，导出不会替换任何文件。');
    expect(labels.packageExportFolderLine('/交付/第一次')).toBe('导出到：/交付/第一次');
    expect(labels.PACKAGE_EXPORT_APPROVE_REASON).toBe('先选择位置。');
    expect(labels.packageExportStoppedLine({ fileName: '交付包清单.md', reason: '所选位置在准备后发生了变化，请重新选择保存位置。' }))
      .toBe('「交付包清单.md」没有导出：所选位置在准备后发生了变化，请重新选择保存位置。之后的文件没有写入，AI7 不会自动重试；可以重新导出到别的文件夹。');
    expect(labels.packageExportsAccessibleName('v1')).toBe('图书交付包 v1 的导出记录');
    expect(labels.packageExportHistoryLine('已导出到所选位置 · 3 个文件', '9月24日 12:30')).toBe('已导出到所选位置 · 3 个文件 · 9月24日 12:30');
    expect(labels.PACKAGE_EXPORTS_TRUNCATED).toBe('更早的导出保留在记录中。');
    expect(labels.PACKAGE_EXPORT_STATUS_LINES).toEqual({
      reviewing: '正在列出要导出的文件…',
      reviewed: '要导出的文件已列出',
      reviewFailed: '无法准备图书交付包的导出。',
      choosing: '正在打开系统的文件夹对话框…',
      cancelled: '已取消选择位置，没有写入任何文件。',
      prepared: '已准备好导出文件，等待你确认。',
      chooseFailed: '未能准备导出文件。',
      writing: '正在写入所选文件夹…',
      approveFailed: '未能导出图书交付包。',
      closed: '已关闭导出，没有写入任何文件。',
      revealed: '已在文件夹中显示。',
      revealFailed: '无法在文件夹中显示。',
    });
    expect(BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT).toBe('导出只把这些文件写到你选择的文件夹：每个文件都有自己的导出记录，交付包本身不变；AI7 不会发送任何文件。');
    expect(BOOK_DELIVERY_PACKAGE_EXPORT_WORDS).toEqual({ manifest: '交付包清单', prepared: '已准备', notWritten: '未写入' });
    // What an export came to, in one line: prepared, every file written, or each outcome counted in the order written.
    expect(bookDeliveryPackageExportSummary(['prepared', 'prepared', 'prepared'])).toBe('已准备，尚未导出 · 3 个文件');
    expect(bookDeliveryPackageExportSummary(['created', 'created', 'created'])).toBe('已导出到所选位置 · 3 个文件');
    expect(bookDeliveryPackageExportSummary(['created', 'not-written', 'not-written'])).toBe('已导出 1 个文件，其余 2 个没有写入');
    expect(bookDeliveryPackageExportSummary(['failed', 'not-written', 'not-written'])).toBe('1 个未能导出，其余 2 个没有写入');
    expect(bookDeliveryPackageExportSummary(['created', 'created', 'ambiguous'])).toBe('已导出 2 个文件，1 个结果待确认');
    expect(bookDeliveryPackageExportSummary(['created', 'ambiguous', 'not-written'])).toBe('已导出 1 个文件，1 个结果待确认，其余 1 个没有写入');
  });

  it('never says a package was sent, published or delivered, and never shows a percentage (BUNDLE-005, WORK-007)', () => {
    const words = [
      labels.PACKAGE_HEADING, labels.PACKAGE_CONDITIONS_HEADING, ...Object.values(labels.PACKAGE_CONDITION_STATE), labels.PACKAGE_PREVIEW_HEADING,
      labels.PACKAGE_INCLUDED_HEADING, labels.PACKAGE_EXCLUDED_HEADING, labels.PACKAGE_LIMITATIONS_HEADING, labels.PACKAGE_INCLUDED_TRUNCATED,
      labels.PACKAGE_LIMITATIONS_TRUNCATED, labels.PACKAGE_PURPOSE_LABEL, labels.PACKAGE_PURPOSE_HINT, labels.PACKAGE_PREPARE,
      labels.PACKAGE_PURPOSE_NEEDED, labels.PACKAGE_VERSIONS_HEADING, labels.PACKAGE_VERSIONS_TRUNCATED, labels.PACKAGE_CURRENT_MARK,
      labels.PACKAGE_PREPARED, ...Object.values(labels.PACKAGE_STATUS_LINES), labels.packageNotReadyLine(['营销要点']),
      labels.packageChangedLine('v1'), labels.packageVersionLine({ label: 'v1', exportHistoryLabel: BOOK_DELIVERY_PACKAGE_WORDS.exportHistoryNone }),
      labels.packagePreparedLine('v1'), labels.packageUnchangedLine('v1'),
      BOOK_DELIVERY_PACKAGE_STATEMENT, ...Object.values(BOOK_DELIVERY_PACKAGE_CONDITION_LABELS), ...Object.values(BOOK_DELIVERY_PACKAGE_WORDS),
      ...Object.values(BOOK_DELIVERY_PACKAGE_REFUSALS), bookDeliveryPackageNotReady(['营销要点']),
      ...Object.values(labels.PACKAGE_EXPORT_ACTION_LABELS), labels.packageExportOpenAccessibleName('v1'), labels.packageExportHeading('v1'),
      labels.PACKAGE_EXPORT_FILES_LABEL, labels.PACKAGE_EXPORT_FILES_TRUNCATED, labels.PACKAGE_EXPORT_FOLDER_UNCHOSEN, labels.PACKAGE_EXPORT_APPROVE_REASON,
      labels.packageExportStoppedLine({ fileName: '交付包清单.md', reason: '未能写入。' }), labels.packageExportsAccessibleName('v1'),
      labels.PACKAGE_EXPORTS_TRUNCATED, ...Object.values(labels.PACKAGE_EXPORT_STATUS_LINES), BOOK_DELIVERY_PACKAGE_EXPORT_STATEMENT,
      ...Object.values(BOOK_DELIVERY_PACKAGE_EXPORT_WORDS), bookDeliveryPackageExportSummary(['created', 'failed', 'ambiguous', 'not-written']),
    ];
    for (const phrase of words) {
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(phrase).not.toContain(forbidden);
      expect(phrase).not.toMatch(/%|百分/u);
    }
  });
});
