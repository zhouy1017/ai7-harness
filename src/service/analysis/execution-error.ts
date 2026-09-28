/**
 * The execution owner's one refusal type. It lives apart from the owner so that a module the owner's
 * own imports reach — the baseline kind's reused-result remap is one — can throw it without importing
 * the owner, and with it the harness and the adapters, back.
 */
export class ExecutionAdmissionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutionAdmissionError';
  }
}

/**
 * Every place of the execution owner's governor taken (Issue #420, S74a A2; Issue #49, S14): a Review Run's approval
 * is refused with this reason before anything is recorded, while 开始任务's start is recorded and waits for a place
 * instead. It lives here, beside the owner's refusal type, so the ledgers that refuse with it need not import the owner.
 */
export const EXECUTION_SLOT_BUSY = 'EXECUTION_BUSY';
export const EXECUTION_SLOT_BUSY_REASON = '运行名额已满：正在运行的任务结束后再开始。';
