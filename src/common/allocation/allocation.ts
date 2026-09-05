import { FAULT_CODE } from '../errors/error-codes.js';
import { LedgerError } from '../errors/ledger-error.js';

/**
 * Splits a total into a fixed number of parts that sum exactly back to the total.
 *
 * @remarks
 * The parts are as equal as the currency allows. When the total does not divide evenly, a
 * residual is left over. The residual is spread one unit at a time over the earliest parts.
 * That is the largest remainder method, with the index as the tie break.
 *
 * BHD 10.000 into three parts is the case the brief supplies. 10000 fils divided by 3 is 3333,
 * with a remainder of 1. So the parts are 3334, 3333 and 3333. They sum to exactly 10000. Three
 * genuinely equal parts do not exist at three decimal places.
 *
 * Acceptance criterion 7 asks for three parts of 3.334, which sum to 10.002. That criterion
 * is refused. When equality and conservation conflict, conservation wins, because a ledger
 * that can invent 0.002 can invent anything. See REJECTED.md.
 *
 * The residual goes to the earliest parts rather than the last. All parts in this brief
 * share one value date, so the choice moves no money in time and is presentational. It is
 * fixed here anyway, because an allocation that depends on nothing visible is an allocation
 * that changes when somebody reorders a loop.
 *
 * @steps
 * 1. Refuse a part count below one.
 * 2. Take the magnitude of the total, so a negative total splits symmetrically.
 * 3. Divide to get the base part and the residual.
 * 4. Give one extra unit to each of the first `residual` parts.
 * 5. Reapply the sign.
 *
 * @param totalMinor - The amount to split, in minor units.
 * @param partCount - How many parts to produce. Must be at least one.
 * @returns The parts, in order. They always sum to `totalMinor` exactly.
 * @throws LedgerError With `SPLIT_COUNT_INVALID` when `partCount` is below one.
 */
export function splitEvenly(totalMinor: bigint, partCount: number): readonly bigint[] {
  if (!Number.isInteger(partCount) || partCount < 1) {
    throw new LedgerError(
      FAULT_CODE.SPLIT_COUNT_INVALID,
      `Cannot split into ${partCount} parts. A split needs at least one whole part.`,
    );
  }

  const divisor = BigInt(partCount);
  const isNegative = totalMinor < 0n;
  const magnitude = isNegative ? -totalMinor : totalMinor;

  const basePart = magnitude / divisor;
  const residual = magnitude % divisor;

  const parts = Array.from({ length: partCount }, (_unused, index) =>
    BigInt(index) < residual ? basePart + 1n : basePart,
  );

  return isNegative ? parts.map((part) => -part) : parts;
}
