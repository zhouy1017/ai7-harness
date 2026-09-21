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
