# allocation

## What it does

Splits a total into a fixed number of parts that sum back to exactly the total. One function, `splitEvenly`.

## How it relates to the rest of the project

The second of the two places where a value could be lost or created. `modules/replay` calls it to post the three BHD instalments of E10.

## The decisions it owns

### Conservation beats equality

The brief asks for BHD 10.000 as "three equal instalments". Three equal instalments do not exist at three decimal places. 10000 fils over three parts is 3333 each with 1 left over.

Two invariants are in conflict, and only one can hold:

| Invariant | Result |
|---|---|
| The parts are equal | 3.334, 3.334, 3.334, totalling 10.002 |
| The parts sum to the total | 3.334, 3.333, 3.333, totalling 10.000 |

Conservation wins. A ledger that can invent BHD 0.002 can invent anything, and the invented amount appears on a customer's statement as money nobody deposited. Acceptance criterion 7 asks for the first row and is refused. See `REJECTED.md`.

### The residual goes to the earliest parts

Largest remainder, with the index as the tie break. All three parts of E10 carry the same value date, so the placement moves no money in time and is presentational.

It is fixed anyway. An allocation that depends on nothing visible changes silently the day
somebody reorders a loop. That change would not fail a test that only checks the total.

### The parts never spread by more than one minor unit

Dumping the whole residual onto one part would also conserve value. It would still be wrong. "As
equal as the currency allows" is a real constraint. The spec asserts it over a sweep of totals
and part counts, rather than on one example.

### A negative total splits symmetrically

Splitting a debit is as meaningful as splitting a credit. The magnitude is split and the sign is reapplied, so no unit leaks at the boundary.

## Its dependencies on other modules

`common/errors`, for the one fault code it can throw.
