# Numbers

Every constant in the system, why it holds that value, and what changes if it moves.

The brief supplies several of these. A supplied number still gets interrogated here, because using a number without knowing what it does is the same risk whoever chose it.

Each constant lives in a `<folder>.constants.ts` file with a doc block. This document is the prose companion to those files, not a second source of truth.

---

## AED 25.00, the overdraft fee

`OVERDRAFT_FEE_MINOR_BY_CURRENCY.AED = 2500n` in `src/modules/fees/fees.constants.ts`

Supplied by the brief. Held as 2500 fils, because a fee is money and money is an integer count of minor units.

### Why not half it

Halving it changes nothing, and that is worth knowing, because it means the fee count in this replay is not sensitive in the direction you would expect.

The fee is load bearing in one place only. Once E7 posts, Day 3 closes at 30.00 before any fee lands. The Day 2 fee is value dated Day 2, so it lowers Day 3 as well. Day 3 goes below zero, and a fourth fee is charged, only when the fee exceeds 30.00.

| Fee | Day 3 closing | Fees charged | Total charged |
|---|---|---|---|
| 12.50 | 17.50 | 3 | 37.50 |
| **25.00** | **5.00** | **3** | **75.00** |
| 30.00 | 0.00 | 3 | 90.00 |
| 30.01 | (0.01) | 4 | 120.04 |
| 50.00 | (20.00) | 4 | 200.00 |

So AED 25.00 sits AED 5.01 below a cliff. That margin of 5.00 on Day 3 is the single most fragile number in the replay, and it is the reason the answer to criterion 2 is three rather than four.

The table is asserted in `src/modules/fees/fees.spec.ts`.

### Whether it is a plausible number

AED 25.00 is within the range UAE retail banks charge for an overdraft or a returned item. Before go live it would have to be checked against the bank's approved Schedule of Charges and against the CBUAE Consumer Protection Standards, which govern fee disclosure and cap certain retail charges. That is a compliance check against a published schedule, not a modelling decision, and it is not one this exercise can make.

### What it does not cover

There is no BHD fee. See "Currencies" below.

---

## 0.04 percent per day, the interest rate

`DAILY_RATE_NUMERATOR = 4n`, `DAILY_RATE_DENOMINATOR = 10000n` in `src/modules/interest/interest.constants.ts`

Supplied by the brief. Held as a pair of integers rather than as `0.0004`, because `0.0004` is not representable in binary floating point and a rate that is already wrong before it is applied cannot be rounded back into correctness.

An accrual is `balanceMinor * 4n / 10000n`, multiplied before divided, so there is exactly one rounding.

### Why 10000 and not 2500

`0.04 percent` is also `1n / 2500n`, which is exact and one operation cheaper. It is not used, because `4 / 10000` reads back as "four hundredths of a percent" against the brief, and `1 / 2500` does not. A reviewer checking the rate should not have to do arithmetic to confirm the code matches the specification.

### Why not half it

Halving the rate to 0.02 percent is where the rounding mode stops being free.

At 0.04 percent no daily accrual lands on an exact tie, so `HALF_UP` and `HALF_EVEN` give identical answers and the mode changes nothing. At 0.02 percent, two of the six accruals land exactly on a tie:

| Day | Balance | At 0.02 percent | HALF_UP | HALF_EVEN |
|---|---|---|---|---|
| 1 | 250.00 | 0.050 | 0.05 | 0.05 |
| 2 | 225.00 | **0.045** | 0.05 | 0.04 |
| 3 | 625.00 | **0.125** | 0.13 | 0.12 |
| 4 | 415.00 | 0.083 | 0.08 | 0.08 |
| 5 | 390.00 | 0.078 | 0.08 | 0.08 |
| 6 | 390.00 | 0.078 | 0.08 | 0.08 |
| | | | **0.47** | **0.45** |

A 0.02 difference on a total of about 0.46, which is over four percent, decided entirely by a constant that does not affect this replay at all. That is the argument for fixing the mode explicitly rather than discovering it at the first tie. Both cases are asserted in `src/common/rounding/rounding.spec.ts`.

### Whether it is a plausible number

It is not, and this is worth saying rather than transcribing quietly.

```
0.0004 x 365                = 14.6 percent a year, simple
(1.0004 ^ 365) - 1          = 15.7 percent a year, compounded
```

That is a lending rate. No deposit account pays 15 percent. A realistic UAE savings rate at the time of writing would be one to four percent a year, which is roughly 0.003 to 0.011 percent a day, an order of magnitude below what the brief specifies.

The rate is used as given, because the brief is the specification. It is flagged because a system that accepts an implausible rate without comment will accept a mistyped one the same way. In production this belongs behind a product configuration with a sanity bound, not in a constant.

---

## AED 2 places, BHD 3 places

`CURRENCY_EXPONENT` in `src/common/money/money.constants.ts`

From ISO 4217. The dirham subdivides into 100 fils, the Bahraini dinar into 1000.

### Why not one precision for both

Because the brief pairs them deliberately, and a single global precision is the failure it is testing for. Every AED assertion in this project passes at three decimal places. Every BHD amount silently corrupts at two: BHD 10.000 becomes 10.00, and the instalment split becomes 3.34, 3.33, 3.33, totalling 10.00 rather than 10.000.

That failure is invisible in the AED account, which is where anyone would look first.

BHD is one of a small group of three place currencies, with KWD, OMR, TND, JOD, LYD and IQD. Treating 3 as an exotic special case rather than as an ordinary value in a registry is exactly the mistake the registry exists to prevent.

---

## HALF_UP, the rounding mode

`ROUNDING_MODE` in `src/common/rounding/rounding.constants.ts`

The retail banking convention, and what a customer expects when a fraction of a fils is in question. `HALF_UP` here means away from zero, matching `ROUND_HALF_UP` in Java `BigDecimal` and in the Python `decimal` module.

Away from zero rather than upward on the number line, so `-1.5` rounds to `-2` and `1.5` rounds to `2`. A rule that rounds a debit differently from a credit of the same size leaks value in one direction over many roundings. The spec sweeps every magnitude in the window to assert symmetry.

### What it costs

`HALF_UP` has a known upward bias: it rounds up on every tie, and never down. Over one account and six days that is immaterial. Over millions of accounts and a year of daily accruals it is a systematic transfer, and `HALF_EVEN` exists precisely to remove it.

The bias does not show here because no tie occurs. It would show at 0.02 percent, as the table above shows. At production scale the right answer is to measure the bias and probably switch, which `ARCHITECTURE.md` records.

---

## Zero, twice, and both comparisons are strict

`OVERDRAFT_THRESHOLD_MINOR = 0n` in `src/modules/fees/fees.constants.ts`
`ACCRUAL_THRESHOLD_MINOR = 0n` in `src/modules/interest/interest.constants.ts`

A day closing at exactly zero is **not overdrawn** and **earns nothing**.

```
overdraft:  balance <  0n     not <=
interest:   balance >  0n     not >=
```

Both are load bearing in this replay. ACC-002 holds exactly zero on Days 1 to 4 and accrues nothing on any of them, which is why its total is 0.008 and not more.

Written as `<= 0n`, the overdraft test would charge an account that owes nothing. Written as `>= 0n`, the interest test would try to pay interest on nothing, which is harmless arithmetically and wrong as a statement about the product.

The available balance gate is the deliberate exception. It is `>= 0n`, because the brief says the available balance must remain "at or above zero", and declining a customer who empties their account to the fils would be wrong.

---

## Day 0 and Days 1 to 6

`OPENING_DAY = 0`, `REPLAY_DAYS = [1, 2, 3, 4, 5, 6]` in `src/common/day/day.constants.ts`

Six accrual days, Day 1 to Day 6 inclusive. Interest capitalizes at the end of Day 6, and Day 6 accrues before its own credit lands.

### Why not five

Some interest conventions exclude one end of a period, accruing from the start date to the day before the end date. That reading would give five accruals rather than six and would lower the ACC-001 total from 0.93 to 0.77.

Six is chosen because the brief says "0.04 percent per day on the closing ledger balance" with no exclusion, and every one of the six days has a closing balance. This is recorded in `AMBIGUITIES.md` A20 rather than assumed.

### Why the opening balance sits on Day 0

So that a balance stays a pure function of the entry list and no caller has to remember to add a starting figure. Day 0 also keeps two ideas apart: Day 1 holds what happened on Day 1, Day 0 holds what was already true before the window opened. Nothing is ever assessed against Day 0.

---

## Three instalments, and the residual goes first

`splitEvenly(10000n, 3)` gives `[3334n, 3333n, 3333n]`

The count of three is supplied by the brief. The placement of the residual is not.

10000 fils over three parts is 3333 each with 1 left over. That one fils has to go somewhere, and where it goes is a choice.

**Earliest part**, by largest remainder with the index as the tie break. All three instalments share a value date of Day 5, so the placement moves no money in time and is presentational.

It is fixed anyway. An allocation that depends on nothing visible is one that changes the day somebody reorders a loop, and that change would not fail a test that only checks the total.

The alternative convention puts the residual on the last part, which is how an amortisation schedule is usually written, the final payment squaring the total. Here the parts are simultaneous, so neither convention has an economic argument and the tie break is arbitrary but recorded.

---

## Presentation constants

In `src/common/money/money.constants.ts` and `src/modules/report/day-report.ts`.

| Constant | Value | Why |
|---|---|---|
| `DIGIT_GROUP_SIZE` | 3 | The brief writes `AED 1,200.00`. Grouping never touches a stored value. |
| `RULE_WIDTH` | 78 | Fits an 80 column terminal with room for a margin. |
| `ACCRUAL_COLUMN` | 31 | Where the accrual column starts, so the rule and the total align under it and a reader can add the column up by eye. |
| `ACCRUAL_WIDTH` | 10 | Wide enough for `(1,200.000)` at three decimal places. |
| Balance column width | 13 | One width for every currency. AED prints two decimals and BHD three, so a width derived from the currency leaves the two accounts misaligned in the same column. |

None of these can change a number. `src/modules/report/` reads and never writes.

---

## The numbers the replay produces

Not constants. Derived, and reproducible by running `npm start`.

| Figure | Value | Where it comes from |
|---|---|---|
| Day 2 closing, at end of Day 5, before fees | (370.00) | 1200.00 minus 950.00 minus 620.00 |
| Overdraft fees charged | 3, totalling 75.00 | Days 2, 4 and 5 close below zero once E7 posts |
| Day 3 margin | 5.00 | 650.00 minus 620.00 minus the Day 2 fee of 25.00 |
| ACC-001 daily accruals | 0.10, 0.09, 0.25, 0.17, 0.16, 0.16 | 0.04 percent of each restated closing balance |
| ACC-001 capitalized interest | 0.93 | The sum of those six |
| ACC-002 capitalized interest | 0.008 | 0.004 on Day 5 and Day 6, nothing before |
| ACC-001 final | 390.93 | 390.00 plus 0.93 |
| ACC-002 final | 10.008 | 10.000 plus 0.008 |

### Three comparison figures worth holding on to

| Figure | Value | What it is |
|---|---|---|
| 0.92 | The rate applied to the summed balances | `0.0004 x 2295.00 = 0.918`. One fils below the sum of the parts. This is the remainder criterion 8 wants discarded. |
| 0.81 | Accruing on the balance known at each day's own close | The reading not taken. 0.12 below the restated answer. See `AMBIGUITIES.md` A6. |
| 1.03 | What the window would have earned had E7 never posted | 0.10 above the actual. That 0.10 is interest the three fees cost by holding every later balance down. |

The account ends AED 75.10 short of the counterfactual: 75.00 of fees, plus 0.10 of foregone interest. That is the subject of the one failing test.
