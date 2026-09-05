import { ROUNDING_MODE, type RoundingMode } from './rounding.constants.js';

/**
 * Divides one integer by another and rounds the result to a whole number.
 *
 * @remarks
 * This is one of only two functions in the ledger where a value can change. The other is
 * `splitEvenly`. Every other operation is exact integer addition.
 *
 * The sign is handled by taking magnitudes and reapplying the sign at the end. HALF_UP
 * therefore means "away from zero", so `-3n` divided by `2n` gives `-2n` rather than `-1n`.
 * That is the behaviour of ROUND_HALF_UP in Java BigDecimal and of ROUND_HALF_UP in the
 * Python decimal module, and it keeps the result symmetric about zero. A rounding rule that
 * treats a debit differently from a credit of the same size is a rule that leaks value in
 * one direction.
 *
 * The tie test avoids division entirely. Comparing `remainder * 2n` against the divisor is
 * exact for any bigint, whereas comparing a computed fraction against one half would
 * reintroduce the floating point this ledger exists to avoid.
 *
 * @steps
 * 1. Work out the sign of the result, then take the magnitude of both operands.
 * 2. Divide, keeping the truncated quotient and the remainder.
 * 3. Compare twice the remainder against the divisor to place the result against the
 *    halfway point.
 * 4. Resolve an exact tie with the rounding mode.
 * 5. Reapply the sign.
 *
 * @param numerator - The value being divided.
 * @param denominator - The divisor. Must not be zero.
 * @param mode - The tie rule. Defaults to the ledger wide `ROUNDING_MODE`.
 * @returns The quotient, rounded to a whole number.
 * @throws RangeError When the denominator is zero.
 */
export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = ROUNDING_MODE,
): bigint {
  if (denominator === 0n) {
    throw new RangeError('Cannot divide by zero.');
  }

  const isNegative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const twiceRemainder = remainder * 2n;

  let rounded: bigint;
  if (twiceRemainder > absoluteDenominator) {
    rounded = quotient + 1n;
  } else if (twiceRemainder < absoluteDenominator) {
    rounded = quotient;
  } else if (mode === 'HALF_UP') {
    rounded = quotient + 1n;
  } else {
    rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
  }

  return isNegative ? -rounded : rounded;
}
