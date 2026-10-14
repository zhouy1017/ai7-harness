/**
 * A refusal of 润色这段 or 基于当前稿件重新生成建议 (Issue #842), in the editor's words. Kept apart from the execution owner, which
 * loads the Harness, so the service entry can name it before network denial is installed.
 */
export class FastRoleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'FastRoleError';
  }
}
