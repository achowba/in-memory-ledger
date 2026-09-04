import { FAULT_CODE } from '../errors/error-codes.js';
import { LedgerError } from '../errors/ledger-error.js';
import { CURRENCY_EXPONENT, DIGIT_GROUP_SIZE, type CurrencyCode } from './money.constants.js';

/**
 * An amount of money, as a whole count of the smallest unit of its currency.
 *
 * @remarks
 * AED 415.00 is `41500n`. BHD 10.000 is `10000n`. There is no floating point in this
 * ledger and no third party decimal type, so the only rounding that happens is rounding
 * somebody wrote on purpose. Every such place is a named function in this folder.
 *
 * This is an alias rather than a branded type. A brand would force a cast at every
 * literal, which costs more in readability than it buys in safety here: there is no second
 * numeric money representation anywhere in the codebase to confuse it with, and the naming
 * convention puts `Minor` on the end of every money identifier.
 */
export type MinorUnits = bigint;

/** Matches an optionally signed decimal amount, capturing sign, whole part, and fraction. */
const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Returns how many decimal places a currency has.
 *
 * @param currency - The currency to look up.
 * @returns The ISO 4217 minor unit exponent.
 */
export function exponentOf(currency: CurrencyCode): number {
  return CURRENCY_EXPONENT[currency];
}

/**
 * Returns the number of minor units in one major unit of a currency.
 *
 * @remarks
 * 100n for AED, 1000n for BHD. Used wherever a major amount is converted, and by the
 * formatter to split an amount into its whole and fractional parts.
 *
 * @param currency - The currency to look up.
 * @returns Ten raised to the currency's exponent, as a bigint.
 */
export function scaleOf(currency: CurrencyCode): bigint {
  return 10n ** BigInt(exponentOf(currency));
}

/**
 * Converts a decimal amount written as text into minor units.
 *
 * @remarks
 * The precision check is the reason this function exists. An amount carrying more decimal
 * places than its currency has is refused rather than rounded, because rounding an input
 * silently discards what the caller meant and there is no way to tell later that it
 * happened. `1.005` is a fault for AED and a valid amount for BHD.
 *
 * Parsing text rather than accepting a raw bigint also lets the event stream be written in
 * the same notation as the brief, so the two can be compared line by line during review.
 *
 * @steps
 * 1. Match the text against the decimal pattern.
 * 2. Refuse a fraction longer than the currency allows.
 * 3. Pad the fraction to the currency's exponent.
 * 4. Join the sign, the whole part, and the padded fraction into one integer.
 *
 * @param currency - The currency the amount is denominated in.
 * @param text - The amount, for example `1200.00` or `-620.00` or `10.000`.
 * @returns The amount in minor units.
 * @throws LedgerError With `MALFORMED_AMOUNT` when the text is not a decimal amount.
 * @throws LedgerError With `PRECISION_EXCEEDS_CURRENCY` when the fraction is too long.
 */
export function parseAmount(currency: CurrencyCode, text: string): MinorUnits {
  const match = AMOUNT_PATTERN.exec(text.trim().replace(/,/g, ''));
  if (match === null) {
    throw new LedgerError(
      FAULT_CODE.MALFORMED_AMOUNT,
      `"${text}" is not a decimal amount in ${currency}.`,
    );
  }

  const [, sign = '', whole = '0', fraction = ''] = match;
  const exponent = exponentOf(currency);

  if (fraction.length > exponent) {
    throw new LedgerError(
      FAULT_CODE.PRECISION_EXCEEDS_CURRENCY,
      `${currency} has ${exponent} decimal places, but "${text}" has ${fraction.length}. ` +
        `An input is never rounded silently.`,
    );
  }

  return BigInt(`${sign}${whole}${fraction.padEnd(exponent, '0')}`);
}

/**
 * Renders minor units as a decimal amount for a human to read.
 *
 * @remarks
 * Presentation only. Nothing downstream of this function is a money value. A negative
 * amount is rendered in brackets, which is the accounting convention and which removes any
 * chance of a leading minus being mistaken for a list bullet in the printed report.
 *
 * @param currency - The currency the amount is denominated in.
 * @param amountMinor - The amount in minor units.
 * @returns The amount with digit grouping and the currency's full precision, for example
 *   `1,200.00` or `(370.00)` or `10.000`.
 */
export function formatAmount(currency: CurrencyCode, amountMinor: MinorUnits): string {
  const exponent = exponentOf(currency);
  const scale = scaleOf(currency);
  const isNegative = amountMinor < 0n;
  const magnitude = isNegative ? -amountMinor : amountMinor;

  const whole = (magnitude / scale).toString();
  const fraction = (magnitude % scale).toString().padStart(exponent, '0');

  const grouped = whole.replace(
    new RegExp(`\\B(?=(\\d{${DIGIT_GROUP_SIZE}})+(?!\\d))`, 'g'),
    ',',
  );
  const rendered = exponent === 0 ? grouped : `${grouped}.${fraction}`;

  return isNegative ? `(${rendered})` : rendered;
}

/**
 * Adds up any number of amounts in the same currency.
 *
 * @remarks
 * Integer addition, so the sum is exact no matter how many terms there are. This is the
 * only way a balance is ever computed, which is what makes a balance reproducible.
 *
 * @param amounts - The amounts to add, all in the same currency.
 * @returns The total in minor units. An empty list totals zero.
 */
export function sumMinor(amounts: readonly MinorUnits[]): MinorUnits {
  return amounts.reduce((total, amount) => total + amount, 0n);
}
