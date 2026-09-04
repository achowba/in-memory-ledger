/**
 * The bounds of the replay window, and the reasoning behind each one.
 */

/**
 * The value date carried by an opening balance.
 *
 * @remarks
 * Zero, which sits outside the replay window on purpose. An opening balance is modelled as
 * an ordinary ledger entry rather than as a field on the account, so that a balance stays a
 * pure function of the entry list and nothing has to remember to add a starting figure.
 *
 * Placing it on day zero rather than day one keeps the two ideas separate. Day one holds
 * what happened on day one. Day zero holds what was already true before the window opened.
 */
export const OPENING_DAY = 0;

/**
 * Every day the replay covers, in order.
 *
 * @remarks
 * Six days, day one to day six inclusive. The brief gives no calendar, no timezone and no
 * cutoff time, so a day here is an ordinal with no weekend and no holiday. A production
 * system needs a real calendar, a timezone of Asia/Dubai, and a cutoff. See AMBIGUITIES.md.
 *
 * Interest accrues on all six days and capitalizes at the end of the last one. Accruing on
 * five days by excluding either end is a defensible reading of some interest conventions
 * and is not the reading taken here.
 *
 * This is a list rather than a pair of bounds because every loop over the window should be
 * a loop over this array. A hand written `for` loop with its own start and end is a place
 * an off by one can hide, and an off by one here silently changes a fee count.
 */
export const REPLAY_DAYS = [1, 2, 3, 4, 5, 6] as const;
