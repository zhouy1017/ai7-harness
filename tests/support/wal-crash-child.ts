import { randomUUID } from 'node:crypto';
import { newParagraphIdentity } from '../../src/renderer/editor-structure.js';
import { EditorialStore } from '../../src/service/store.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import type { JournalEditInput, JournalStructuralEdit } from '../../src/shared/protocol.js';

installNodeNetworkDenial();
const [dataRoot, codeRoot, manuscriptId, branchId] = process.argv.slice(2);
const store = await EditorialStore.open(dataRoot!, codeRoot!);
let window = store.getManuscriptWindow(manuscriptId!, branchId!, null);
const blockId = window.blocks.find(block => block.kind === 'paragraph' && block.text.length > 0)!.blockId;
const newBlockId = newParagraphIdentity();
function write(from: number, insertText: string, structure?: JournalStructuralEdit) {
  const block = window.blocks.find(value => value.blockId === blockId)!;
  const input: JournalEditInput = {
    clientEditId: randomUUID(), manuscriptId: manuscriptId!, branchId: branchId!, baseRevisionId: window.revisionId,
    blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: from, toGrapheme: from, insertText,
    ...(structure === undefined ? {} : { structure }),
  };
  const ack = store.flushJournalEdit(input); window = ack.window; return ack;
}
write(1, '', { kind: 'split', newBlockId });
write(1, '', { kind: 'merge', mergedBlockId: newBlockId, mergedBlockDigest: window.blocks.find(block => block.blockId === newBlockId)!.digest });
const ack = write(0, '甲');
process.on('message', () => undefined); // Keep this process open until the test kills it, without closing SQLite.
process.send?.({ sequence: ack.sequence, workingDigest: ack.resultingWorkingDigest, blockId });
