/**
 * The name a Developer Capability Proposal version is offered under in the Save dialog (Issue #65, S30; ADR 0087 §6): its
 * title, made safe for every file system and cut by grapheme so no character is split, with its version. Shared by main, which
 * offers it, and the service's tests.
 */
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/** How much of the title the offered name keeps, in graphemes. */
export const DEVELOPER_PROPOSAL_FILE_TITLE_GRAPHEMES = 40;

export function developerProposalFileName(version: { readonly title: string; readonly version: number }): string {
  const safe = Array.from(segmenter.segment(version.title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, '_')), (part) => part.segment)
    .slice(0, DEVELOPER_PROPOSAL_FILE_TITLE_GRAPHEMES)
    .join('');
  return `开发建议 ${safe} 第 ${version.version} 版.md`;
}
