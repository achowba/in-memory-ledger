# interest

## What it does

Works out one accrual per day on the closing balance, and books the whole window as a single credit at the end of day six.

## How it relates to the rest of the project

`modules/replay` calls `capitalizeInterest` once, at the end of the last day. It reads balances from `modules/ledger`, rounds through `common/rounding`, and appends one entry back to the ledger.

## The decisions it owns

### The rate never becomes a decimal

`0.04 percent per day` is held as `4n / 10000n`, a pair of integers. An accrual is `balanceMinor * 4n / 10000n`, multiplied before it is divided, so nothing is lost in between and there is exactly one rounding.

`0.0004` is not representable in binary floating point. A rate that is already wrong before it is applied cannot be rounded back into correctness.

### Interest accrues on restated balances

This is the consequential choice in the module, and the brief does not make it for you.

This is the consequential choice in the module, and the brief does not make it for you. By day
six, four of the six days have two possible closing balances. One is the balance visible at the
time. The other is the balance you get after E7 arrives backdated and E9 reverses it. Which one
do you accrue on?

| Reading                                                      | ACC-001 total |
| ------------------------------------------------------------ | ------------- |
| Restated, recomputed at capitalization with everything known | 0.93          |
| As known at each day's own close, never revisited            | 0.81          |

Restatement is chosen because acceptance criterion 1 already restates. It asks for the day two closing balance "evaluated at end of Day 5", which is the same operation applied to the fee engine. Restating a balance in order to charge a customer, and refusing to restate it in order to pay one, would be difficult to defend.

Both numbers are in the spec, so the 0.12 difference is a stated figure rather than a claim. See `AMBIGUITIES.md`.

### A reversal repairs interest on its own, and does not repair a fee

E9 reverses E7 at its original value date, so under restatement the interest E7 destroyed simply comes back. Nobody has to notice or intervene.

The three overdraft fees do not come back, because a fee is an assessed decision rather than a derived value. Interest is recomputed from the entries whenever it is needed. A fee records what the system decided on a given day with the facts it had.

That asymmetry is deliberate and it is the subject of the annotated failing test.

### The capitalized total is defined as the sum of the parts

The brief requires the rounded daily accruals to sum exactly to the capitalized total. Defining the total as their sum is the only way to make that true by construction rather than by luck.

The tempting alternative fails outright. Applying the rate to the summed balances gives `0.0004 * 2295.00`, which is 0.918 and rounds to 0.92, while the six rounded accruals total 0.93.

Acceptance criterion 8 says to discard that one fils. Discarding it breaks the rule printed beside it and destroys a customer's money, so it is refused. See `REJECTED.md`.

### Day six accrues before its own credit lands

Accruing on the balance after capitalization would make the calculation depend on its own result. Day six accrues on 390.00, not on 390.93.

### Zero is not positive, and there is no debit interest

A day closing at exactly zero accrues nothing, which is why ACC-002 earns nothing on days one to four. A day closing below zero also accrues nothing, rather than accruing a negative amount. The overdraft is priced by the flat fee instead, which `ARCHITECTURE.md` records as a cut.

### On the size of the rate

0.04 percent per day is about 14.6 percent a year simple, and about 15.7 percent compounded. That is a lending rate, not a deposit rate.

The brief supplies it, so the implementation uses it. Transcribing a number that implausible
without comment would be a failure to say something worth saying. See `NUMBERS.md`.

## Its dependencies on other modules

`modules/ledger` to read balances and append the credit, `common/rounding` for the one rounding, `common/day` for the window.
