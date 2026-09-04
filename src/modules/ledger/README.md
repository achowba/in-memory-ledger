# ledger

## What it does

Holds the balance-affecting entries, and answers the only question that matters: what did this account close at, on this day, as far as we knew at this point.

## How it relates to the rest of the project

`modules/replay` appends entries. `modules/fees` and `modules/interest` read balances and append their own entries. `modules/report` reads balances to print them.

## The decisions it owns

### A balance query names both clocks

```ts
balanceMinor(accountId, { valueDateOnOrBefore, knownAsOfSequence });
```

`valueDateOnOrBefore` selects which entries are economically in scope. `knownAsOfSequence` selects what the system had learned at the moment being asked about.

A day's closing balance is not one number. The Day 2 closing balance of ACC-001 in this replay is:

| Asked | Balance | Why |
|---|---|---|
| On day 2 | 250.00 | Only E1 and E2 exist |
| On day 5 | (370.00) | E7 has arrived, backdated to day two |
| On day 6 | 225.00 | E9 has reversed E7, and the fee remains |

All three are correct. Acceptance criterion 1 asks for the middle one, and the phrase it uses, "evaluated at end of Day 5", only means something if the other two exist.

There is deliberately no convenience helper that takes a day alone. Such a helper would be a correct answer to the wrong question, and somebody would call it by mistake.

### The amount is signed

A balance is the plain sum of the amounts. Nothing consults the origin to work out which way to add.

Direction arrives carried by the event type, and it becomes a sign exactly once, at the point of posting. That is why `NON_POSITIVE_AMOUNT` is a fault: an input that carries its direction in the sign has two sources of truth for the same fact.

### Nothing is cached and no running total is held

Every balance is recomputed from the entries. At ten events that is free, and it means a balance is always reproducible and never stale.

It is also the first thing that breaks at scale. A balance query scans the whole history of an account, and the fee engine calls it once per day per account at every day close. That is section one of `ARCHITECTURE.md`.

### `hasEntry` is the once per day guard

"At most one overdraft fee per account per day, ever" is enforced on the pair of account and day, not on the assessment run.

The distinction matters because a later run revisits days an earlier run already charged. Without the guard, the day two fee would be charged again at every day close from day five onwards, and the balance would drift by 25.00 a day.

### Identifiers are derived, not generated

An entry gets `L1`, `L2`, and so on, from its sequence number. Two runs of the same event stream produce byte identical output, which the testing convention requires and which a ledger needs anyway: a ledger that cannot be replayed to the same result is not a ledger.

## Its dependencies on other modules

`common/day` for the value date rule, `common/money` for exact summation.
