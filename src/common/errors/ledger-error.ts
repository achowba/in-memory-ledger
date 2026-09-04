import type { FaultCode } from './error-codes.js';

/**
 * The single exception type this ledger throws.
 *
 * @remarks
 * Only a fault throws. A refusal is appended to the event log and the replay continues, so
 * a refusal never reaches this class. Keeping one exception type means a caller branches on
 * `code` rather than on the class hierarchy, and the code is stable while the message is not.
 *
 * @property code - The stable fault code a caller or a test branches on.
 */
export class LedgerError extends Error {
  public readonly code: FaultCode;

  /**
   * Creates a fault.
   *
   * @param code - The stable fault code.
   * @param message - A plain sentence for a human reading the stack trace.
   */
  public constructor(code: FaultCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}
