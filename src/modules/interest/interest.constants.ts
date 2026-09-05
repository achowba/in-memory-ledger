// The interest rate, expressed so that it never becomes a decimal.

/**
 * The numerator of the daily interest rate.
 *
 * @remarks
 * The rate is 0.04 percent per day, which is 4 parts in 10000. It is held as a pair of integers
 * rather than as 0.0004. 0.0004 is not representable in binary floating point. A rate that is
 * already wrong before it is applied cannot be rounded back into correctness.
 *
 * An accrual is therefore `balanceMinor * 4n / 10000n`, which is exact integer arithmetic up
 * to the single division at the end.
 *
 * On the size of the rate: 0.04 percent per day is about 14.6 percent a year simple, and about
 * 15.7 percent compounded. That is a lending rate, not a deposit rate. The brief supplies it,
 * so the implementation uses it. A rate this high on a credit balance is still worth flagging.
 * See NUMBERS.md.
 */
export const DAILY_RATE_NUMERATOR = 4n;

/**
 * The denominator of the daily interest rate.
 *
 * @remarks
 * 10000, which puts the numerator in units of one hundredth of a percent. Chosen so the
 * numerator stays a whole number. Expressing 0.04 percent as 1n over 2500n would also be exact.
 * It would hide the rate a reader is checking against the brief.
 */
export const DAILY_RATE_DENOMINATOR = 10000n;

/**
 * The balance above which interest accrues.
 *
 * @remarks
 * Zero, and the comparison is strict. The brief says "positive balances only", and zero is
 * not positive. ACC-002 holds zero on days one to four and accrues nothing on any of them.
 *
 * There is no debit interest. A day that closes below zero accrues nothing at all, rather
 * than accruing a negative amount. The overdraft is priced by the flat fee instead, which is
 * a simplification the brief makes and ARCHITECTURE.md records as a cut.
 */
export const ACCRUAL_THRESHOLD_MINOR = 0n;
