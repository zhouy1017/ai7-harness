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

  it('gives 导出数据库 the long budget, since it copies, compresses and writes the whole store (Issue #434, S86a review)', () => {
    const long = requestTimeoutMs('approveManuscriptExport');
    expect([requestTimeoutMs('prepareDatabaseExport'), requestTimeoutMs('approveDatabaseExport')]).toEqual([long, long]);
    expect(requestTimeoutMs('inspectDatabaseExports')).toBe(requestTimeoutMs('inspectLibraryMaterials'));
  });
});
