import { describe, expect, it } from 'vitest';
import * as labels from '../../src/renderer/book-delivery-package-labels.js';
import {
  BOOK_DELIVERY_PACKAGE_CONDITION_LABELS,
  BOOK_DELIVERY_PACKAGE_REFUSALS,
  BOOK_DELIVERY_PACKAGE_STATEMENT,
  BOOK_DELIVERY_PACKAGE_WORDS,
  bookDeliveryPackageNotReady,
} from '../../src/service/book-delivery-packages.js';
import { PUBLICATION_FORBIDDEN_WORDS } from '../../src/shared/protocol.js';

// The words of 图书交付包 (Issue #416, plan slice S67a; V2-UX-BUNDLE-001 to 005, DPKG-011), byte for byte: the page's own
// and the service's, which reach the page through the projection.

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
    ];
    for (const phrase of words) {
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(phrase).not.toContain(forbidden);
      expect(phrase).not.toMatch(/%|百分/u);
    }
  });
});
