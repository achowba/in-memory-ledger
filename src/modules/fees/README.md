# fees

## What it does

Books an overdraft fee for every day in the window that closes below zero, at most once per account per day.

## How it relates to the rest of the project

`modules/replay` calls `assessOverdraftFees` at the close of each day. It reads balances from `modules/ledger` and appends its fees back to the same ledger.

This is the module acceptance criterion 2 is wrong about, so it carries the heaviest reasoning per line in the project.

## The decisions it owns

### The walk is ascending, and one pass is enough

A fee is a value dated ledger entry. So a fee booked against day two lowers the closing balance
of days three through six as well. Fees cascade.

Walking ascending makes a single pass sufficient, because a fee for day `d` can only affect days at or after `d`. By the time the walk reaches day four, every fee that could change day four has already been booked. Any other order would need iterating until nothing changes, and would have to prove it terminates.

### The walk covers the whole window, not just today

A backdated entry can push an already closed day below zero. E7 arrives on day five value dated day two and does exactly that to days two and four.

A run that looked at today alone would miss both, and would charge one fee instead of three.

### At most one fee per account per day, ever

The guard is `ledger.hasEntry(accountId, OVERDRAFT_FEE, day)`, keyed on the pair of account and day, not on the assessment run.

The distinction is what makes repeated runs safe. Every day close re-walks the window. Without
the guard the day two fee would be charged again on day five, on day six, and at every close
after that.

### Strictly below zero

A day that closes at exactly 0.00 is not overdrawn. `OVERDRAFT_THRESHOLD_MINOR` is `0n` and the comparison is `< 0n`.

Written as `<= 0n` this would charge an account that owes nothing, which is both wrong and the kind of wrong a customer notices.

### The fee amount is load bearing

AED 25.00 sits just under a cliff. Day three of ACC-001 closes at 30.00 once E7 has posted, and the day two fee lowers it to 5.00.

| Fee | Day 3 closing | Fees charged |
|---|---|---|
| 12.50 | 17.50 | 3 |
| 25.00 | 5.00 | 3 |
| 30.00 | 0.00 | 3 |
| 30.01 | (0.01) | 4 |

So halving the fee changes nothing, and the count moves only above AED 30.00, where the cascade reaches day three. See `NUMBERS.md`.

### BHD has no fee, and that is not a bug to paper over

The brief prices the overdraft fee in AED only. `OVERDRAFT_FEE_MINOR_BY_CURRENCY` has one entry, and an account in an unpriced currency that goes overdrawn raises `FEE_NOT_PRICED_FOR_CURRENCY`.

Defaulting to the AED figure, or to zero, would be guessing at an amount a customer gets
charged. ACC-002 never goes below zero, so the case does not arise in this replay. A two
currency system with a one currency fee schedule is still a real gap. See `AMBIGUITIES.md`.

### What a fee is, and what that means for a reversal

A fee is an assessed decision, not a derived value. It records what the system decided on a given day with the facts it had on that day.

So when E9 reverses E7 on day six, the interest corrects itself and the three fees stand. That asymmetry is deliberate, it is why acceptance criterion 6 is refused, and it is what the annotated failing test is about.

## Its dependencies on other modules

`modules/ledger` to read balances and append entries, `common/day` for the ascending walk, `common/errors` for the unpriced currency fault.
