import type { CurrencyCode } from '../../common/money/money.constants.js';
import type { MinorUnits } from '../../common/money/money.js';
import type { ReplayDay } from '../../common/day/day.js';
import type { IRecordedEvent } from '../events/event.types.js';
import type { ILedgerEntry } from '../ledger/ledger-entry.types.js';
import type { IAuthorization } from '../authorizations/authorization.types.js';
import type { IDailyAccrual } from '../interest/interest.js';

/**
 * An account the replay operates on.
 *
 * @property accountId - The identifier used throughout, such as `ACC-001`.
 * @property currency - Decides the precision of every amount and the price of a fee.
 * @property openingBalanceMinor - Booked as an entry value dated day zero, not held as a
 *   field, so a balance stays a pure function of the entry list.
 */
export interface IAccount {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly openingBalanceMinor: MinorUnits;
}

/**
 * A prior day whose closing balance changed because of something booked later.
 *
 * @remarks
 * This is what a backdated entry does, made visible. E7 arrives on day five and changes the
 * closing balance of days two, three and four, all of which had already been reported.
 *
 * @property day - The earlier day that moved.
 * @property wasMinor - What that day closed at when it was last reported.
 * @property nowMinor - What it closes at now.
 */
export interface IRestatement {
  readonly day: ReplayDay;
  readonly wasMinor: MinorUnits;
  readonly nowMinor: MinorUnits;
}

/**
 * One account, as it stands at the close of one day.
 *
 * @property accountId - Which account.
 * @property currency - Its currency, so the report can format amounts correctly.
 * @property closingBalanceMinor - The closing ledger balance for this day, as known now.
 * @property activeHoldsMinor - The total still reserved by approved authorizations.
 * @property availableBalanceMinor - The closing balance minus the active holds.
 * @property restatements - Earlier days whose closing balance moved during this day.
 */
export interface IAccountDaySnapshot {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly closingBalanceMinor: MinorUnits;
  readonly activeHoldsMinor: MinorUnits;
  readonly availableBalanceMinor: MinorUnits;
  readonly restatements: readonly IRestatement[];
}

/**
 * Everything that happened on one day of the replay.
 *
 * @property day - Which day.
 * @property events - The events booked on this day, with their outcomes, in arrival order.
 * @property feesBooked - Overdraft fees assessed at this day's close, in ascending value
 *   date order. A fee here may be value dated to an earlier day.
 * @property accounts - One snapshot per account, at this day's close.
 * @property authorizations - Every authorization known by the end of this day, whatever its
 *   state, so the report can show the states the brief asks for.
 */
export interface IDayResult {
  readonly day: ReplayDay;
  readonly events: readonly IRecordedEvent[];
  readonly feesBooked: readonly ILedgerEntry[];
  readonly accounts: readonly IAccountDaySnapshot[];
  readonly authorizations: readonly IAuthorization[];
}

/**
 * What one account earned across the window, and the credit that paid it.
 *
 * @property accountId - Which account.
 * @property currency - Its currency.
 * @property accruals - One rounded accrual per day, with the balance it was worked out on.
 * @property totalMinor - The capitalized total, which equals the sum of the accruals.
 * @property entry - The single credit booked, or null when the total is zero.
 */
export interface IInterestResult {
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly accruals: readonly IDailyAccrual[];
  readonly totalMinor: MinorUnits;
  readonly entry: ILedgerEntry | null;
}
