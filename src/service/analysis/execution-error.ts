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
 * The one slot, no queue (Issue #420, plan slice S74a A2): while another Run holds the execution owner's
 * slot, a new start is refused with this reason before anything is recorded — no authorization, no Run
 * Record, and no queued state that would start it later. It lives here, beside the owner's refusal type,
 * so the ledgers that refuse with it need not import the owner.
 */
export const EXECUTION_SLOT_BUSY = 'EXECUTION_BUSY';
export const EXECUTION_SLOT_BUSY_REASON = '另一项任务正在运行；它结束后再开始。';
