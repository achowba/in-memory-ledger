# rounding

## What it does

Divides one integer by another and rounds the quotient to a whole number. One function, `divideRounded`.

## How it relates to the rest of the project

Together with `common/allocation`, this is one of only two places in the ledger where a value can change. Everything else is exact integer addition.

`modules/interest` is the only caller. Interest is `balanceMinor * 4n / 10000n`, and that division is almost never exact.

## The decisions it owns

### The tie test never divides

Placing a quotient against the halfway point is done by comparing `remainder * 2n` against the divisor. Both sides are integers, so the comparison is exact for any magnitude.

Computing a fraction and comparing it against one half would reintroduce the floating point that
the whole money design exists to avoid. It would do so in the one function where precision
matters most.

### HALF_UP means away from zero

The sign is stripped, the magnitude is rounded, and the sign is reapplied. So `-3n / 2n` gives `-2n`, not `-1n`. This matches `ROUND_HALF_UP` in Java `BigDecimal` and in the Python `decimal` module.

The alternative, rounding a tie always upward on the number line, would round `-1.5` to `-1` and `1.5` to `2`. That treats a debit differently from a credit of the same size, which leaks value in one direction over many roundings. The spec sweeps every magnitude in the window to assert symmetry.

### The mode is fixed even though it changes nothing here

No accrual in the six day window lands on an exact tie at 0.04 percent per day. `HALF_UP` and `HALF_EVEN` therefore produce identical output, and the choice changes no number in the replay.

The mode is still named in `rounding.constants.ts` rather than left to whatever the first tie
happens to hit. A mode decided by accident is a mode nobody can defend.

The choice stops being free if the rate moves. At 0.02 percent, two of the six daily accruals land exactly on a tie, and the capitalized total differs by 0.02 between the modes. Both cases are in the spec.

## Its dependencies on other modules

None.
