import type { Day } from '../../common/day/day.js';
import type { MinorUnits } from '../../common/money/money.js';

/**
 * Why a ledger entry exists.
 *
 * @remarks
 * An authorization is absent on purpose. A hold never produces a ledger entry, because a
 * hold reduces the available balance and leaves the ledger balance untouched.
 *
 * @property OPENING_BALANCE - The starting figure, value dated day zero.
 * @property CREDIT - Money in. One credit event can produce several entries when it is
 *   split into instalments.
 * @property DEBIT - Money out, posted directly.
 * @property SETTLEMENT - Money out, presented against an authorization.
 * @property REVERSAL - The opposite of an earlier entry, inheriting its value date.
 * @property OVERDRAFT_FEE - Charged once per account per day that closes below zero.
 * @property INTEREST_CAPITALIZATION - The single credit that pays six days of accruals.
 */
export const ENTRY_ORIGIN = {
  OPENING_BALANCE: 'OPENING_BALANCE',
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  SETTLEMENT: 'SETTLEMENT',
  REVERSAL: 'REVERSAL',
  OVERDRAFT_FEE: 'OVERDRAFT_FEE',
  INTEREST_CAPITALIZATION: 'INTEREST_CAPITALIZATION',
} as const;

/** Why a ledger entry exists. */
export type EntryOrigin = (typeof ENTRY_ORIGIN)[keyof typeof ENTRY_ORIGIN];

/**
 * One balance-affecting posting. Immutable once appended.
 *
 * @remarks
 * The amount is signed, so a balance is the plain sum of the amounts and nothing has to
 * consult the origin to know which way to add. Direction on the way in is carried by the
 * event type, and it is converted to a sign exactly once, at the point of posting.
 *
 * @property entryId - Stable identifier, assigned by the ledger. Deterministic, so a rerun
 *   produces identical output.
 * @property sequence - Position in the ledger's arrival order, starting at one. This is the
 *   second clock. A balance query bounds it to ask what was known at a point in the replay.
 * @property accountId - The account this entry belongs to.
 * @property valueDate - The day this entry changes the balance. The first clock.
 * @property bookedOnDay - The day this entry arrived. Later than `valueDate` when the entry
 *   is backdated, which is what makes an already closed day get restated.
 * @property amountMinor - Signed minor units. Positive is money in, negative is money out.
 * @property origin - Why the entry exists.
 * @property sourceEventId - The event that caused it, so any entry can be traced back to
 *   the line of the brief that produced it.
 * @property reversesEntryId - The entry this one reverses, or null. Set on a reversal so the
 *   pair can be read together without editing either one.
 */
export interface ILedgerEntry {
  readonly entryId: string;
  readonly sequence: number;
  readonly accountId: string;
  readonly valueDate: Day;
  readonly bookedOnDay: Day;
  readonly amountMinor: MinorUnits;
  readonly origin: EntryOrigin;
  readonly sourceEventId: string;
  readonly reversesEntryId: string | null;
}

/** A ledger entry before the ledger assigns its identifier and sequence number. */
export type LedgerEntryDraft = Omit<ILedgerEntry, 'entryId' | 'sequence'>;
