import { OPENING_DAY, REPLAY_DAYS } from './day.constants.js';

/**
 * A day inside the replay window.
 *
 * @remarks
 * A literal union rather than a number, so an out of range day is a compile error rather
 * than a silently empty result. The window is fixed and small, which makes the union
 * practical here in a way it would not be for a real calendar.
 */
export type ReplayDay = (typeof REPLAY_DAYS)[number];

/**
 * Any day an entry can be value dated to, including the opening day.
 *
 * @remarks
 * The opening day is separate from the replay days because nothing happens on it. It exists
 * only to carry the opening balance, and no fee or accrual is ever assessed against it.
 */
export type Day = typeof OPENING_DAY | ReplayDay;

/**
 * Lists the replay days from the start of the window up to and including one day.
 *
 * @remarks
 * This is how every backward looking walk over the window is written. The fee engine uses
 * it to reassess earlier days after a backdated entry arrives, and the order it returns is
 * the ascending order that makes a single pass sufficient. See the ledger domain convention.
 *
 * Passing the opening day returns an empty list, which is correct: nothing is assessed
 * against a day that exists only to hold a starting figure.
 *
 * @param throughDay - The last day to include.
 * @returns The replay days up to `throughDay`, ascending.
 */
export function replayDaysThrough(throughDay: Day): readonly ReplayDay[] {
  return REPLAY_DAYS.filter((day) => day <= throughDay);
}

/**
 * Reports whether one day falls on or before another.
 *
 * @remarks
 * A named predicate rather than a bare comparison, because `entry.valueDate <= day` appears
 * in every balance query and reads as an arithmetic accident rather than as the value date
 * rule it actually is.
 *
 * @param valueDate - The value date of an entry.
 * @param day - The day whose closing balance is being computed.
 * @returns True when the entry counts towards that day's closing balance.
 */
export function countsTowards(valueDate: Day, day: Day): boolean {
  return valueDate <= day;
}
