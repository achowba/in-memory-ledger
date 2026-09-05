import type { CurrencyCode } from '../../common/money/money.constants.js';
import type { MinorUnits } from '../../common/money/money.js';

/**
 * The overdraft fee schedule, and the reasoning behind the amount.
 */

/**
 * What an overdraft costs, per account per day, in each currency the ledger prices.
 *
 * @remarks
 * AED 25.00, which the brief supplies. Expressed as 2500n fils, because a fee is money and
 * money is an integer count of minor units.
 *
 * The amount is load bearing in a way that is easy to miss. Day three of ACC-001 closes at
 * 30.00 once E7 has posted, before any fee lands. The day two fee is value dated day two, so
 * it lowers day three as well, leaving 5.00. Day three escapes by exactly 5.00.
 *
 * | Fee | Day 3 closing | Fees charged |
 * |---|---|---|
 * | 12.50 | 17.50 | 3 |
 * | 25.00 | 5.00 | 3 |
 * | 30.00 | 0.00 | 3 |
 * | 30.01 | (0.01) | 4 |
 *
 * So halving the fee changes nothing, and the count only moves above AED 30.00, where the
 * cascade reaches day three and charges a fourth time. See NUMBERS.md.
 *
 * BHD is absent on purpose. The brief prices the fee in AED only, and inventing a BHD figure
 * would be guessing at a number a customer gets charged. An account in an unpriced currency
 * that goes overdrawn raises FEE_NOT_PRICED_FOR_CURRENCY rather than defaulting to anything.
 * ACC-002 never goes below zero, so the case does not arise in this replay.
 *
 * @property AED - AED 25.00, as 2500 fils.
 */
export const OVERDRAFT_FEE_MINOR_BY_CURRENCY: Partial<Record<CurrencyCode, MinorUnits>> = {
  AED: 2500n,
};

/**
 * The balance at or above which no overdraft fee is charged.
 *
 * Zero, and the comparison is strict. A day that closes at exactly 0.00 is not overdrawn, so a
 * flat account is never charged. Written as `<= 0n` this would put a fee on an account that
 * owes nothing. That is wrong, and it is the kind of wrong a customer notices.
 */
export const OVERDRAFT_THRESHOLD_MINOR: MinorUnits = 0n;
