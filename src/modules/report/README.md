# report

## What it does

Renders a replay as text, one block per day, plus the interest schedule and the final balances.

## How it relates to the rest of the project

Reads `IReplayResult` and returns a string. `src/main.ts` prints it.

It queries the ledger for the final balances, through `balanceMinor`. It never appends, never mutates and never decides. So a change here can change how a number is shown, and never what the number is.

## The decisions it owns

### The section order answers the brief in turn

The brief asks for closing ledger balance, fee assessments, authorization states, and errors. Each day prints those four, in that order, after the events that caused them.

Restatements sit next to the balances rather than under errors, because a restated earlier day is a balance and not a mistake.

### The value date is always printed

Not only when it differs from the booking day. A reader checking a backdated entry should not have to infer from the absence of a note that the two dates agree.

### A negative balance prints in brackets

`(230.00)`, not `-230.00`. The accounting convention, and it makes an overdrawn day impossible to miss when scanning the column, which is the whole thing this replay is about.

### The interest schedule shows its working

The daily accruals are printed as a column, with a rule and a total under them, aligned. So a
reader can add the column up by eye.

That check is precisely the rule the brief states: the rounded daily accruals must sum exactly to the capitalized total. Printing only the total would ask the reader to trust it.

### One column width for every currency

AED prints two decimals and BHD three. A width derived from the currency would leave the two
accounts misaligned in the same column. That makes a report harder to scan than a slightly wider
one.

## Its dependencies on other modules

`modules/replay` for the result shape, `common/money` for formatting. It reads, and never writes.
