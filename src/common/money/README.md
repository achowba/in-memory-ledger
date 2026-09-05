# money

## What it does

Represents money as a whole count of the smallest unit of its currency, and knows how many of those units make one major unit. AED 415.00 is `41500n` fils. BHD 10.000 is `10000n` fils.

## How it relates to the rest of the project

Everything that holds an amount imports from here. This folder imports only from `common/errors`, so it sits near the bottom of the dependency graph.

Rounding does not live here. Rounding lives beside it in `common/rounding` and
`common/allocation`. Those two are the only places a value can be lost or created, so they
deserve their own files and their own tests.

## The decisions it owns

### Money is a `bigint`, not a `number` and not a decimal library

A `number` is a binary float and cannot hold `0.1 + 0.2` exactly. That is disqualifying on its own for a ledger.

A decimal library would fix the arithmetic, but it would also move every rounding decision inside somebody else's code, behind a configuration option. This exercise is almost entirely about rounding: a total that will not divide by three, and an interest remainder the brief invites you to discard. Those decisions have to be visible in review, so they are written here as integer arithmetic with an explicit remainder.

The result is a claim that can be checked in one pass of the codebase. There is no floating point anywhere, so the only rounding in the system is rounding somebody wrote on purpose.

### The exponent belongs to the currency, not to the system

`CURRENCY_EXPONENT` is the only place a precision is declared. AED is 2 and BHD is 3, from ISO 4217.

The brief pairs a 2 place currency with a 3 place one deliberately. A single global precision
passes every AED test and silently corrupts every BHD amount. That bug only shows up in the
third decimal place of an account nobody is watching.

### `MinorUnits` is an alias, not a branded type

A brand would force a cast at every literal. That costs more in readability than it buys here.
There is no second numeric money representation in the codebase to confuse it with. The naming
rule also puts `Minor` on the end of every money identifier, so the unit is visible at the call
site.

### An input is refused rather than rounded

`parseAmount` throws `PRECISION_EXCEEDS_CURRENCY` when an amount carries more decimal places than its currency has. `1.005` is a fault in AED and a valid amount in BHD.

Rounding an input silently would discard what the caller meant, and nothing downstream could ever tell that it happened. Refusing is louder and cheaper.

Parsing text also lets the event stream use the same notation as the brief. A reviewer can then
compare the two line by line.

### A negative amount prints in brackets

`(370.00)`, not `-370.00`. This is the accounting convention, and it makes an overdrawn day impossible to miss when scanning a column. Formatting is presentation only. Nothing downstream of `formatAmount` is a money value.

## Its dependencies on other modules

`common/errors`, for the two fault codes `parseAmount` can throw.
