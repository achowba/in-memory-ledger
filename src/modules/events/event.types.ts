import type { Day, ReplayDay } from '../../common/day/day.js';
import type { MinorUnits } from '../../common/money/money.js';
import type { RefusalCode, WarningCode } from '../../common/errors/error-codes.js';

/**
 * What every event carries, whatever its type.
 *
 * @property eventId - The identifier from the brief, such as `E7`. Stable, and used by a
 *   reversal to name what it reverses.
 * @property bookingDay - The day the system learns of the event.
 * @property valueDate - The day the event changes a balance. Equal to `bookingDay` for an
 *   ordinary event, and earlier for a backdated one.
 * @property accountId - The account the event belongs to.
 */
interface IEventBase {
  readonly eventId: string;
  readonly bookingDay: ReplayDay;
  readonly valueDate: Day;
  readonly accountId: string;
}

/**
 * The starting balance of an account, value dated before the window opens.
 *
 * @property type - Discriminant.
 * @property amountMinor - The opening amount. Zero for both accounts in this brief.
 */
export interface IOpeningBalanceEvent extends IEventBase {
  readonly type: 'OPENING_BALANCE';
  readonly amountMinor: MinorUnits;
}

/**
 * Money into the account.
 *
 * @remarks
 * `instalmentCount` exists because E10 credits BHD 10.000 as three equal instalments. One event
 * therefore produces three ledger entries. Modelling that as three separate events would lose
 * the fact that they are one instruction. It would also break the residual allocation, which
 * only makes sense across a known set of parts.
 *
 * @property type - Discriminant.
 * @property amountMinor - The total credited, always positive.
 * @property instalmentCount - How many entries the total is split across. One for an
 *   ordinary credit.
 */
export interface ICreditEvent extends IEventBase {
  readonly type: 'CREDIT';
  readonly amountMinor: MinorUnits;
  readonly instalmentCount: number;
}

/**
 * Money out of the account, posted directly.
 *
 * @remarks
 * A debit is not gated on available balance. Only an authorization is. A direct debit posts
 * and may overdraw the account, which is the reason an overdraft fee exists at all. Gating
 * it would decline E7 and make acceptance criterion 1 unreachable. See AMBIGUITIES.md.
 *
 * @property type - Discriminant.
 * @property amountMinor - The amount debited, always positive. Direction comes from the
 *   type, never from the sign.
 */
export interface IDebitEvent extends IEventBase {
  readonly type: 'DEBIT';
  readonly amountMinor: MinorUnits;
}

/**
 * A request to reserve funds against the account.
 *
 * @remarks
 * An authorization never produces a ledger entry. An approved authorization creates a hold,
 * which reduces the available balance and leaves the ledger balance untouched.
 *
 * @property type - Discriminant.
 * @property authId - The identifier a later settlement will name.
 * @property amountMinor - The amount to hold, always positive.
 */
export interface IAuthorizationEvent extends IEventBase {
  readonly type: 'AUTHORIZATION';
  readonly authId: string;
  readonly amountMinor: MinorUnits;
}

/**
 * The presentment that turns a hold into a posting.
 *
 * @remarks
 * A settlement is not gated on available balance. The hold already reserved the funds and
 * the bank is already committed to the payment.
 *
 * The settled amount may differ from the held amount. E5 settles 185.00 against a hold of
 * 200.00, and the whole hold is released. See AMBIGUITIES.md.
 *
 * @property type - Discriminant.
 * @property authId - The authorization being settled. E6 names one that never existed.
 * @property amountMinor - The amount actually presented, always positive.
 */
export interface ISettlementEvent extends IEventBase {
  readonly type: 'SETTLEMENT';
  readonly authId: string;
  readonly amountMinor: MinorUnits;
}

/**
 * An instruction to undo an earlier posting.
 *
 * @remarks
 * A reversal never edits the original. A reversal appends an opposite entry that inherits the
 * original value date. So the correction lands on the day the money was supposed to have moved,
 * not on the day the mistake was noticed.
 *
 * A reversal carries no reason code, which is the gap behind the annotated failing test. The
 * system cannot tell an error by the bank from a legitimate return by the customer. Only the
 * first should refund the fees that the original posting triggered.
 *
 * @property type - Discriminant.
 * @property reversesEventId - The event being reversed. E9 names E7.
 */
export interface IReversalEvent extends IEventBase {
  readonly type: 'REVERSAL';
  readonly reversesEventId: string;
}

/** Any event that can arrive in the input stream. */
export type LedgerEvent =
  | IOpeningBalanceEvent
  | ICreditEvent
  | IDebitEvent
  | IAuthorizationEvent
  | ISettlementEvent
  | IReversalEvent;

/**
 * A warning attached to an event that was still accepted.
 *
 * @property code - Which warning.
 * @property detail - A sentence naming the specific values involved.
 */
export interface IEventWarning {
  readonly code: WarningCode;
  readonly detail: string;
}

/**
 * One event as the log holds it, together with what the system decided about it.
 *
 * @remarks
 * A refusal is recorded here rather than thrown away. The log records what happened, and a
 * refusal happened. This is what lets the report print the day four rejection of E6 and the day
 * five decline of Auth-B. The brief requires both as output.
 *
 * @property sequence - Arrival order in the log, starting at one.
 *
 *   This counts records, not ledger entries, and the two do not correspond. A refused event
 *   takes a sequence number and posts nothing. One credit event posts three entries when it
 *   is split into instalments. In this replay the log holds ten records and the ledger holds
 *   sixteen entries.
 *
 *   So this number orders the log. It is not a bound for a ledger balance query. That bound
 *   is `ILedgerEntry.sequence`, which `Ledger.nextSequence` hands out.
 * @property event - The event exactly as it arrived.
 * @property outcome - Whether the event was accepted or refused.
 * @property refusal - The code and reason, present only when the outcome is `REFUSED`.
 * @property warnings - Notes that did not prevent acceptance.
 */
export interface IRecordedEvent {
  readonly sequence: number;
  readonly event: LedgerEvent;
  readonly outcome: 'ACCEPTED' | 'REFUSED';
  readonly refusal: { readonly code: RefusalCode; readonly detail: string } | null;
  readonly warnings: readonly IEventWarning[];
}
