import type { CurrencyCode } from '../../common/money/money.constants.js';
import type { MinorUnits } from '../../common/money/money.js';
import type { ReplayDay } from '../../common/day/day.js';
import { replayDaysThrough } from '../../common/day/day.js';
import { FAULT_CODE } from '../../common/errors/error-codes.js';
import { LedgerError } from '../../common/errors/ledger-error.js';
import { ENTRY_ORIGIN, type ILedgerEntry } from '../ledger/ledger-entry.types.js';
import type { Ledger } from '../ledger/ledger.js';
import {
  OVERDRAFT_FEE_MINOR_BY_CURRENCY,
  OVERDRAFT_THRESHOLD_MINOR,
} from './fees.constants.js';

/**
 * What one assessment run needs to know.
 *
 * The day the run is happening. A fee booked now carries this as its booking day. It carries
 * the day it covers as its value date. So the two clocks stay honest even for a fee that lands
 * on an already closed day.
 */
export interface IAssessmentRequest {
  readonly ledger: Ledger;
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly throughDay: ReplayDay;
  readonly bookedOnDay: ReplayDay;
}

/**
 * Returns what an overdraft costs in one currency.
 *
 * @param currency - The account's currency.
 * @returns The fee in minor units.
 * @throws LedgerError With `FEE_NOT_PRICED_FOR_CURRENCY` when the schedule has no entry.
 */
export function overdraftFeeMinor(currency: CurrencyCode): MinorUnits {
  const fee = OVERDRAFT_FEE_MINOR_BY_CURRENCY[currency];

  if (fee === undefined) {
    throw new LedgerError(
      FAULT_CODE.FEE_NOT_PRICED_FOR_CURRENCY,
      `No overdraft fee is priced in ${currency}. The brief prices the fee in AED only, and ` +
        `inventing a figure would be guessing at an amount a customer gets charged.`,
    );
  }

  return fee;
}

/**
 * Books an overdraft fee for every day in the window that closes below zero.
 *
 * @remarks
 * A fee is itself a value dated ledger entry, so a fee booked against an earlier day lowers
 * the closing balance of every later day. Two rules follow, and both are load bearing.
 *
 * Ascending order. A fee for day `d` can only affect days at or after `d`. So walking the
 * window from the start reaches a fixed point in a single pass. Any other order would need
 * iterating until nothing changes.
 *
 * At most one fee per account per day, ever. The guard is on the pair, not on the run,
 * because a backdated entry makes a later run revisit days an earlier run already charged.
 * Without the guard the day two fee would be recharged at every day close from day five on.
 *
 * The run covers every day up to `throughDay`, not just that day. A backdated entry can push
 * an already closed day below zero, which is exactly what E7 does to days two and four.
 *
 * Applied at the day five close of ACC-001, this walk books three fees and skips day three
 * by 5.00. That is why acceptance criterion 2, which claims exactly one fee, is refused.
 *
 * @steps
 * 1. Walk the replay days from the start of the window through `throughDay`, ascending.
 * 2. Skip a day that already carries a fee for this account.
 * 3. Read the day's closing balance, including any fee booked earlier in this same walk.
 * 4. Book a fee value dated to that day when the closing balance is below zero.
 *
 * @param request - The account, the currency, and how far to walk.
 * @returns The fees booked by this walk, in the order they were booked. Empty when no day
 *   closes below zero.
 * @throws LedgerError With `FEE_NOT_PRICED_FOR_CURRENCY` when an account in an unpriced
 *   currency closes below zero.
 */
export function assessOverdraftFees(request: IAssessmentRequest): readonly ILedgerEntry[] {
  const { ledger, accountId, currency, throughDay, bookedOnDay } = request;
  const booked: ILedgerEntry[] = [];

  for (const day of replayDaysThrough(throughDay)) {
    if (ledger.hasEntry(accountId, ENTRY_ORIGIN.OVERDRAFT_FEE, day)) {
      continue;
    }

    const closingMinor = ledger.balanceMinor(accountId, { valueDateOnOrBefore: day });
    if (closingMinor >= OVERDRAFT_THRESHOLD_MINOR) {
      continue;
    }

    booked.push(
      ledger.append({
        accountId,
        valueDate: day,
        bookedOnDay,
        amountMinor: -overdraftFeeMinor(currency),
        origin: ENTRY_ORIGIN.OVERDRAFT_FEE,
        sourceEventId: `FEE-D${day}`,
        reversesEntryId: null,
      }),
    );
  }

  return booked;
}
