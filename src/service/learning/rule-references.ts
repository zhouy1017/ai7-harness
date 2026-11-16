import type { HouseReviewPreferenceUse } from '../../shared/protocol.js';

/** Original selection indexes are attribution; synthetic block positions are not. */
export function referencedRules(preference: HouseReviewPreferenceUse) {
  return preference.selection === undefined ? [] : preference.lines.map((text, index) => ({ versionId: preference.versionId,
    ordinal: preference.ordinal, lineIndex: preference.selection!.lineIndexes[index]!, text }));
}

