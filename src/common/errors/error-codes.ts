/**
 * Stable codes for everything that can go wrong, split by how it is handled.
 *
 * @remarks
 * The split is the point. A refusal is an expected outcome of a correct system, and the brief
 * requires it to be printed. So a refusal is recorded and the replay continues. A fault means
 * the model was handed something it was not designed for. So a fault throws and the replay
 * stops. See `.agents/conventions/error-handling.convention.md`.
 *
 * A code names the situation, never the message text. A test asserts on the code, because
 * a message is for a human and may be reworded.
 */

/**
 * Refusals. The system is working correctly and is declining an input on purpose.
 *
 * @property SETTLEMENT_WITHOUT_AUTHORIZATION - A settlement names an authorization the
 *   register has never seen. Acceptance criterion 4 requires the funds to stay put.
 * @property AUTHORIZATION_DECLINED_INSUFFICIENT_AVAILABLE - Applying the hold would take
 *   the available balance below zero.
 * @property AUTHORIZATION_ALREADY_EXISTS - An authorization identifier was reused.
 * @property SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION - The authorization exists but has
 *   already settled or been released, so it cannot settle again.
 * @property REVERSAL_TARGET_NOT_FOUND - The reversal names an event that was never booked.
 * @property REVERSAL_TARGET_ALREADY_REVERSED - The target carries a reversal already. A
 *   second one would credit the account twice.
 * @property REVERSAL_TARGET_NOT_REVERSIBLE - The target is not a balance-affecting entry,
 *   so there is nothing to reverse.
 */
export const REFUSAL_CODE = {
  SETTLEMENT_WITHOUT_AUTHORIZATION: 'SETTLEMENT_WITHOUT_AUTHORIZATION',
  AUTHORIZATION_DECLINED_INSUFFICIENT_AVAILABLE: 'AUTHORIZATION_DECLINED_INSUFFICIENT_AVAILABLE',
  AUTHORIZATION_ALREADY_EXISTS: 'AUTHORIZATION_ALREADY_EXISTS',
  SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION: 'SETTLEMENT_AGAINST_CLOSED_AUTHORIZATION',
  REVERSAL_TARGET_NOT_FOUND: 'REVERSAL_TARGET_NOT_FOUND',
  REVERSAL_TARGET_ALREADY_REVERSED: 'REVERSAL_TARGET_ALREADY_REVERSED',
  REVERSAL_TARGET_NOT_REVERSIBLE: 'REVERSAL_TARGET_NOT_REVERSIBLE',
} as const;

/** The type of any refusal code. */
export type RefusalCode = (typeof REFUSAL_CODE)[keyof typeof REFUSAL_CODE];

/**
 * Faults. The model has been handed something it cannot represent, so it stops.
 *
 * @remarks
 * Every one of these would require the system to guess. A guessed answer in a ledger is
 * worse than no answer, because a guess is silent and a stop is not.
 *
 * @property MALFORMED_AMOUNT - The text is not a decimal amount.
 * @property PRECISION_EXCEEDS_CURRENCY - The amount carries more decimal places than the
 *   currency has. Rounding an input silently would destroy the caller's intent.
 * @property NON_POSITIVE_AMOUNT - A credit or a debit was given a zero or negative amount.
 *   Direction is carried by the entry type, never by the sign of the input.
 * @property UNKNOWN_ACCOUNT - An event names an account that was never opened.
 * @property FEE_NOT_PRICED_FOR_CURRENCY - An account in a currency with no fee in the
 *   schedule went overdrawn. The brief prices the overdraft fee in AED only.
 * @property SPLIT_COUNT_INVALID - A split was asked for fewer than one part.
 */
export const FAULT_CODE = {
  MALFORMED_AMOUNT: 'MALFORMED_AMOUNT',
  PRECISION_EXCEEDS_CURRENCY: 'PRECISION_EXCEEDS_CURRENCY',
  NON_POSITIVE_AMOUNT: 'NON_POSITIVE_AMOUNT',
  UNKNOWN_ACCOUNT: 'UNKNOWN_ACCOUNT',
  FEE_NOT_PRICED_FOR_CURRENCY: 'FEE_NOT_PRICED_FOR_CURRENCY',
  SPLIT_COUNT_INVALID: 'SPLIT_COUNT_INVALID',
} as const;

/** The type of any fault code. */
export type FaultCode = (typeof FAULT_CODE)[keyof typeof FAULT_CODE];

/**
 * Warnings. Nothing is refused, but a reader needs to be told.
 *
 * @remarks
 * A warning is printed beside the day it belongs to. None of these changes a balance. Each
 * one marks a place where the input was unusual enough that a silent success would hide
 * something a reviewer should see.
 *
 * @property BACK_VALUED_POSTING - An entry arrived with a value date earlier than its
 *   booking day, so it restates at least one already closed day.
 * @property OUT_OF_ORDER_BOOKING - An event arrived after an event with a later booking
 *   day, which means the stream is not in arrival order.
 * @property UNEVEN_SPLIT - A total did not divide evenly, so a residual was allocated.
 */
export const WARNING_CODE = {
  BACK_VALUED_POSTING: 'BACK_VALUED_POSTING',
  OUT_OF_ORDER_BOOKING: 'OUT_OF_ORDER_BOOKING',
  UNEVEN_SPLIT: 'UNEVEN_SPLIT',
} as const;

/** The type of any warning code. */
export type WarningCode = (typeof WARNING_CODE)[keyof typeof WARNING_CODE];
