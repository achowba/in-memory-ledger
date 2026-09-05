// The rounding vocabulary, and the mode this ledger uses.

/**
 * How a division that cannot be exact resolves a tie.
 *
 * @remarks
 * Only a tie is affected. A quotient with a remainder above or below the halfway point
 * rounds the same way under either mode.
 *
 * @property HALF_UP - A tie rounds away from zero. The retail banking convention.
 * @property HALF_EVEN - A tie rounds to the nearest even quotient. Statistically neutral
 *   over many roundings, which matters when the same calculation runs daily for years.
 */
export const ROUNDING_MODES = ['HALF_UP', 'HALF_EVEN'] as const;

/** A rounding mode this ledger understands. */
export type RoundingMode = (typeof ROUNDING_MODES)[number];

/**
 * The mode used everywhere in this ledger.
 *
 * @remarks
 * HALF_UP, the retail banking convention, and the mode a customer expects when a fraction
 * of a fils is in question.
 *
 * No tie occurs anywhere in the six day window, so this choice changes no number in the
 * replay. It is still fixed here rather than left implicit, because a mode that is only
 * decided when a tie first appears is decided by accident.
 *
 * The choice stops being free if the rate moves. At 0.02 percent per day, two of the six daily
 * accruals land exactly on a tie. The capitalized total then differs by 0.02 between the two
 * modes. See NUMBERS.md.
 */
export const ROUNDING_MODE: RoundingMode = 'HALF_UP';
