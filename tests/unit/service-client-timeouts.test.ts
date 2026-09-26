import { describe, expect, it } from 'vitest';
import { requestTimeoutMs } from '../../src/main/service-client.js';

// Unit suite for how long main waits on one service request before it treats the service as hung and stops it: the work
// that grows with a file or a manuscript has the long budget, and every other request the ordinary one.

describe('the service request deadlines', () => {
  it("gives 资料库's intake the long budget, since it reads a file of up to 1 GiB whole (Issue #427, S79c review)", () => {
    const ordinary = requestTimeoutMs('inspectLibraryMaterials');
    const long = requestTimeoutMs('approveManuscriptExport');
    expect(long).toBeGreaterThan(ordinary);
    expect(requestTimeoutMs('previewLibraryMaterial')).toBe(long);
    expect(requestTimeoutMs('addLibraryMaterial')).toBe(long);
    // A decision or a read touches no file, so it keeps the ordinary deadline.
    expect(requestTimeoutMs('decideLibraryMaterial')).toBe(ordinary);
    expect(requestTimeoutMs('inspectLibraryMaterial')).toBe(ordinary);
  });

  it('answers 导出数据库 at once, since packing and writing the store run off the request (Issue #434 review, V2-UX-EXP-011)', () => {
    const ordinary = requestTimeoutMs('inspectLibraryMaterials');
    expect(['prepareDatabaseExport', 'approveDatabaseExport', 'inspectDatabaseExports', 'cancelDatabaseExport'].map((operation) =>
      requestTimeoutMs(operation as Parameters<typeof requestTimeoutMs>[0]))).toEqual([ordinary, ordinary, ordinary, ordinary]);
  });

  it('gives 导入数据库 the long budget, since its preview, 替换, 回退 and 取消 each read or write a whole package (Issue #434, S86c)', () => {
    const long = requestTimeoutMs('approveManuscriptExport');
    const operations = ['inspectDatabaseImport', 'prepareDatabaseReplacement', 'rollBackDatabaseReplacement', 'cancelDatabaseReplacement'] as const;
    expect(operations.map((operation) => requestTimeoutMs(operation))).toEqual([long, long, long, long]);
    // The list of replacements is a read of the ledger and the staging place's intent, so it keeps the ordinary deadline.
    expect(requestTimeoutMs('inspectDatabaseReplacements')).toBe(requestTimeoutMs('inspectLibraryMaterials'));
  });
});
