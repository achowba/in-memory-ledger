/**
 * The currency registry, and the reasoning behind each exponent.
 *
 * @remarks
 * This file is the only place a currency exponent is declared. Adding a currency anywhere
 * else would let two parts of the system disagree about how many fils are in a dirham, and
 * that disagreement would show up as a rounding bug rather than as a type error.
 */

/**
 * How many decimal places each currency has, from the ISO 4217 minor unit.
 *
 * @remarks
 * AED is 2 because the dirham subdivides into 100 fils. BHD is 3 because the Bahraini
 * dinar subdivides into 1000 fils. The two differ on purpose in the brief: a single global
 * precision would pass every AED test and silently corrupt every BHD amount.
 *
 * BHD is one of a small group of three place currencies, alongside KWD, OMR, TND, JOD, LYD
 * and IQD. Treating 3 as an exotic special case rather than as an ordinary value in a
 * registry is the mistake this table exists to prevent.
 *
 * @property AED - United Arab Emirates dirham, 2 places.
 * @property BHD - Bahraini dinar, 3 places.
 */
export const CURRENCY_EXPONENT = {
  AED: 2,
  BHD: 3,
} as const;

/** A currency this ledger can hold. Any other code is a fault, never a silent default. */
export type CurrencyCode = keyof typeof CURRENCY_EXPONENT;

/**
 * The digit grouping size used when an amount is formatted for a human.
 *
 * @remarks
 * Three, because the brief writes `AED 1,200.00`. Grouping is presentation only and never
 * touches a stored value. It exists so the printed report can be checked against the brief
 * by eye without the reader counting digits.
 */
export const DIGIT_GROUP_SIZE = 3;
