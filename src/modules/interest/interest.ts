import type { MinorUnits } from '../../common/money/money.js';
import type { Day, ReplayDay } from '../../common/day/day.js';
import { REPLAY_DAYS } from '../../common/day/day.constants.js';
import { divideRounded } from '../../common/rounding/rounding.js';
import { sumMinor } from '../../common/money/money.js';
import { ENTRY_ORIGIN, type ILedgerEntry } from '../ledger/ledger-entry.types.js';
import type { Ledger } from '../ledger/ledger.js';
import {
  ACCRUAL_THRESHOLD_MINOR,
  DAILY_RATE_DENOMINATOR,
  DAILY_RATE_NUMERATOR,
} from './interest.constants.js';

/**
 * One day of interest, kept so the report can show the working.
 *
 * @property day - The day accrued for.
 * @property closingBalanceMinor - The balance the accrual was calculated on.
 * @property accrualMinor - The accrual, already rounded to the currency's precision.
 */
export interface IDailyAccrual {
  readonly day: ReplayDay;
  readonly closingBalanceMinor: MinorUnits;
  readonly accrualMinor: MinorUnits;
}

/**
 * Calculates one day of interest on a closing balance.
 *
 * @remarks
 * `balanceMinor * 4n / 10000n`, rounded once at the end. The multiplication happens before
 * the division so no precision is lost in between, which is the whole reason the rate is a
 * pair of integers rather than a decimal.
 *
 * A balance at or below zero accrues nothing. There is no debit interest in this model.
 *
 * @param closingBalanceMinor - The day's closing balance.
 * @returns The accrual in minor units, rounded. Zero for a balance that is not positive.
 */
export function dailyAccrualMinor(closingBalanceMinor: MinorUnits): MinorUnits {
  if (closingBalanceMinor <= ACCRUAL_THRESHOLD_MINOR) {
    return 0n;
  }

  return divideRounded(closingBalanceMinor * DAILY_RATE_NUMERATOR, DAILY_RATE_DENOMINATOR);
}

/**
 * Works out the six daily accruals of an account across the whole window.
 *
 * @remarks
 * Every closing balance is read at the moment this runs, with every event known. That is the
 * restatement reading, and it is the consequential choice in the whole interest calculation.
 *
 * The brief never says which version of a day's closing balance to accrue on, and by day six
 * there are two answers for four of the six days. Restating gives AED 0.93 for ACC-001.
 * Accruing on the balance visible at each day's own close gives AED 0.81.
 *
 * Restatement is chosen because acceptance criterion 1 already restates. It asks for the day
 * two closing balance "evaluated at end of Day 5", which is the same operation applied to the
 * fee engine. Restating balances to charge a customer and refusing to restate them to pay a
 * customer would be hard to defend. See AMBIGUITIES.md.
 *
 * A consequence worth stating plainly: E9 reverses E7 at its original value date, so under
 * restatement the interest E7 destroyed comes back on its own. The three overdraft fees do
 * not, because a fee is an assessed decision rather than a derived value. That asymmetry is
 * the subject of the annotated failing test.
 *
 * @param ledger - The ledger to read closing balances from.
 * @param accountId - The account to accrue for.
 * @returns One accrual per day of the window, in day order.
 */
export function dailyAccruals(ledger: Ledger, accountId: string): readonly IDailyAccrual[] {
  return REPLAY_DAYS.map((day) => {
    const closingBalanceMinor = ledger.balanceMinor(accountId, { valueDateOnOrBefore: day });

    return {
      day,
      closingBalanceMinor,
      accrualMinor: dailyAccrualMinor(closingBalanceMinor),
    };
  });
}

/**
 * Books the whole window of interest as a single credit at the end of the last day.
 *
 * @remarks
 * The capitalized total is defined as the sum of the rounded daily accruals. The brief
 * requires the two to agree exactly, and defining one as the other is the only way to make
 * that true by construction rather than by luck.
 *
 * The tempting alternative fails. Applying the rate to the summed balances gives
 * `0.0004 * 2295.00`, which is 0.918 and rounds to 0.92, while the six rounded accruals
 * total 0.93. Acceptance criterion 8 says to discard that difference. Discarding it both
 * breaks the rule it sits beside and destroys a fils of a customer's money, so it is
 * refused. See REJECTED.md.
 *
 * Day six accrues on the balance before this credit lands. Accruing on the balance after
 * would make the calculation depend on its own result.
 *
 * @steps
 * 1. Work out the six daily accruals from the restated closing balances.
 * 2. Add the rounded accruals together.
 * 3. Append one credit for that total, value dated the last day, when it is not zero.
 *
 * @param ledger - The ledger to read from and append to.
 * @param accountId - The account to capitalize.
 * @param onDay - The day the credit is value dated and booked to, the last day of the window.
 * @returns The accrual schedule, the total, and the entry booked. The entry is null when the
 *   total is zero, because a ledger does not need a record of nothing happening.
 */
export function capitalizeInterest(
  ledger: Ledger,
  accountId: string,
  onDay: ReplayDay,
): {
  readonly accruals: readonly IDailyAccrual[];
  readonly totalMinor: MinorUnits;
  readonly entry: ILedgerEntry | null;
} {
  const accruals = dailyAccruals(ledger, accountId);
  const totalMinor = sumMinor(accruals.map((accrual) => accrual.accrualMinor));

  if (totalMinor === 0n) {
    return { accruals, totalMinor, entry: null };
  }

  const entry = ledger.append({
    accountId,
    valueDate: onDay satisfies Day,
    bookedOnDay: onDay,
    amountMinor: totalMinor,
    origin: ENTRY_ORIGIN.INTEREST_CAPITALIZATION,
    sourceEventId: 'INT-CAP',
    reversesEntryId: null,
  });

  return { accruals, totalMinor, entry };
}
