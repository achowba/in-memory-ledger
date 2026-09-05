# day

## What it does

Defines which days exist, and the one predicate that decides whether an entry counts towards a given day's closing balance.

## How it relates to the rest of the project

Everything with a date imports `Day` from here. `modules/fees` walks the window with `replayDaysThrough`. `modules/ledger` decides membership with `countsTowards`.

## The decisions it owns

### A day is a literal union, not a number

`Day` is `0 | 1 | 2 | 3 | 4 | 5 | 6`. Passing day 7 is a compile error rather than a query that quietly returns nothing.

This is only practical because the window is fixed and tiny. A real calendar would need a date type and a business day calendar, and that is named in `ARCHITECTURE.md` as one of the cuts.

### The opening balance is an entry on day zero

The opening balance is a ledger entry value dated day zero, not a field on the account.

Two reasons. A balance stays a pure function of the entry list, so no caller has to remember to add a starting figure. And day zero keeps two ideas apart: day one holds what happened on day one, day zero holds what was already true before the window opened.

Nothing is ever assessed against day zero. `replayDaysThrough(0)` returns an empty list, which is why no fee and no accrual can land there.

### The window is a list, not a pair of bounds

`REPLAY_DAYS` is `[1, 2, 3, 4, 5, 6]`, and every walk over the window iterates it.

A hand written loop with its own start and end is a place an off by one can hide. Here an off by one does not produce an obvious crash. It changes a fee count by one, which looks exactly like a correct answer.

### `countsTowards` is a named predicate

`entry.valueDate <= day` appears in every balance query. Written inline it reads as an arithmetic accident. Named, it reads as the value date rule, which is the single most important rule in the system.

## Its dependencies on other modules

None.
