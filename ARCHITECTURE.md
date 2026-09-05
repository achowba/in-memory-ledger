# Architecture

Decisions, trade offs and production considerations arising from the ledger core in this repository.

Everything below is about this implementation specifically. Where a claim is about the code, the file is named.

---

## 1. Append only at scale

### What breaks first is the balance query, and it breaks quadratically

`Ledger.balanceMinor` in [`src/modules/ledger/ledger.ts`](src/modules/ledger/ledger.ts) has no cache and no running total. It filters the account's entire history and sums it. Every balance in the system comes from that one function.

The cost is not the sum. The cost is who calls it, and how often.

`assessOverdraftFees` walks every day in the window and calls `balanceMinor` once per day. It runs at every day close. So the work at one day close, for one account, is:

```
days_to_reassess  x  entries_in_account_history
```

Both grow with time. The window is not six days in production; it is every day the account has been open, because a backdated entry can reach any of them. So the per close cost grows linearly in the age of the account, and the entry count it scans also grows linearly. **Total cost is quadratic in account age.**

Ten events over six days hides this completely. At 100 times the volume it is 10,000 times the work at the day close, and the day close is a batch job with a fixed window before the business opens.

Interest capitalization has the same shape. So does any projection rebuild, which is the operation append only is supposed to make cheap and which here means replaying from inception.

Storage is not the problem. Storage is the cheapest part of an append only design and the one people worry about first.

### Where the design accumulates unbounded state

Four places, in descending order of how quickly they hurt.

**The restatement window.** Nothing limits how far back a `valueDate` may reach, so no day is ever finished. This is the root cause of the quadratic cost above, and it is also the root cause of most of section 2.

**The hold register.** [`HoldRegister`](src/modules/authorizations/hold-register.ts) has no expiry. An authorization that is never settled and never voided holds funds forever. Nothing in this replay exposes it, because the only unsettled authorization was declined, so no hold survives the window. On a real book, abandoned authorizations accumulate at a steady rate and every one of them is a customer whose money is unavailable.

**The event log and the ledger.** Unbounded by design, and correctly so. These are history. The problem is not that they grow, it is that everything is recomputed from them.

**Derived state that is recomputed rather than stored.** Every daily closing balance is recalculated on demand. That is what makes a balance always correct and never stale, and it is the same property that makes it expensive.

### The cheapest structural change

**A periodic balance snapshot, plus a sealed period flag.** One table and one job.

```
snapshot(account_id, value_date) -> closing_balance, as_of_sequence
```

The nightly job writes a closing balance per account for the day just sealed. `balanceMinor` then reads the nearest snapshot and applies only the entries after it, so the scan is bounded by the entries since the last snapshot rather than by the whole history. The sealed flag forbids a value date landing inside a closed period; a back valued entry that reaches that far is posted to the current open period as a prior period adjustment instead.

It is the highest leverage change available because one mechanism bounds four separate problems at once:

| Problem                 | How the snapshot bounds it                                           |
| ----------------------- | -------------------------------------------------------------------- |
| Balance query cost      | Scan from the snapshot, not from inception                           |
| Fee reassessment loop   | Only days in the open period can move, so only those are reassessed  |
| Interest recomputation  | Accruals in a sealed period are final and are read, not recalculated |
| Projection rebuild time | Rebuild from the last snapshot, not from the first event             |

It requires no change to the append only log. The log stays the source of truth and the snapshot stays a cache, which means a snapshot can be discarded and rebuilt whenever it is doubted. That property is what makes the change cheap: it cannot corrupt anything, so it can be deployed and verified alongside the existing path before anything depends on it.

The second change, once the first is in, is a TTL on the hold register. It is smaller and it is not on the same critical path.

### One thing this design gets right for scale, almost by accident

There is no cross account invariant anywhere in this model. No rule reads two accounts. So the log shards cleanly on `account_id` with no coordination, and `test/order-independence.e2e-spec.ts` demonstrates the property that makes that safe.

That stops being true the moment double entry is introduced, because a balanced transaction spans accounts and the balance check becomes a distributed invariant. Which is worth knowing before choosing the sharding key, not after.

---

## 2. Value dated entries in a UAE licensed bank

### The operational surface

A back valued entry does not change one number. It changes every number derived from the days it reaches, and most of those numbers have already been sent somewhere.

**Statements already issued become wrong.** A customer holding a paper or emailed statement for a closed month now holds a document the bank disagrees with. The bank has to decide between reissuing, which invites the question of what else changed, and disclosing an adjustment line in the current period, which is harder to read but leaves the audit trail intact.

**Fees already charged may no longer be due, or may now be due.** The fee engine here reassesses closed days precisely because of this. The corollary is that a customer can be charged today for a day that closed a week ago, which needs a customer facing explanation the system currently cannot generate.

**Interest already credited is recomputed.** In this implementation that happens silently, because interest is derived. Silently is fine within a window that has not been reported. Across a period that has been reported it is a restatement.

**Downstream consumers have already consumed.** Transaction monitoring, credit decisioning, limit management and any data warehouse feed have all read the old numbers. A back valued entry has to be republished to each of them, and each has its own idea of what a correction means.

### The regulatory surface

Named because they are the ones a value date can move a transaction across. Each would need verification against current CBUAE issuances before go live; the point is the shape of the exposure, not a compliance opinion.

**Consumer protection.** The CBUAE Consumer Protection Regulation (Circular 8/2020) and its accompanying Standards govern fee disclosure, error correction and complaint handling. A fee charged retroactively for a day that already closed sits directly in that surface, and a fee that a later reversal shows to have been the bank's own error sits further into it. This implementation cannot distinguish those cases, which is the subject of its one failing test.

**AML and CFT.** Federal Decree-Law No. 20 of 2018 and Cabinet Decision No. 10 of 2019 make transaction monitoring date sensitive. Back valuing moves a transaction into or out of a monitoring window, and can change whether a set of transactions constitutes structuring. Reporting timelines run from detection, so a back valued entry that triggers an alert starts a clock today about activity dated weeks ago.

**Regulatory reporting.** Returns to the CBUAE are period based. A value date landing in a period already submitted changes a figure already filed, which is a resubmission and a conversation rather than a routine correction.

**Accounting.** Under IFRS, interest recognition attaches to a period. A back valued entry crossing a reporting boundary is a prior period adjustment under IAS 8 if it is material, and materiality is assessed in aggregate rather than per account, so the exposure is the total volume of back valuing rather than any single entry.

**VAT.** Under Federal Decree-Law No. 8 of 2017, explicit fee based financial services are generally standard rated at five percent, unlike margin based products. A fee is therefore a taxable supply with a tax point, and back dating a fee assessment or reversing one moves that tax point, potentially across a filed return period.

**Dormancy.** The CBUAE Dormant Accounts Regulation keys off the date of last customer activity. A back valued entry changes that date retroactively, which can move an account into or out of dormancy and, at the far end, into or out of unclaimed balance transfer.

**Shari'ah compliance.** This model is conventional. Interest on a credit balance and a flat overdraft fee are not directly transferable to an Islamic product, where the equivalents are profit distribution and a cost recovery charge with a different basis. A bank running both would need the accrual engine to be product aware rather than one rate applied to a balance.

### The one control I would add before going live

**A closed period lock, with back valuing beyond it requiring dual authorization and a reason code.**

Concretely: value dates may not fall inside a sealed accounting period. Inside the open period, back valuing beyond a short window, T plus two business days, requires maker checker approval, a reason drawn from a closed list, and an immutable audit record of who approved it. Anything reaching further is posted as a prior period adjustment in the current period, never as a silent rewrite of a closed one.

I would choose this over the alternatives, including tamper evident hash chaining and a full bitemporal audit trail, for three reasons.

**It bounds how far a correction can reach, rather than recording where it reached.** Every problem in this section is a consequence of a correction reaching somewhere that has already been reported. A lock stops it reaching. An audit trail tells you afterwards where it reached, which is useful and is not the same thing.

**It supplies the missing field.** The reason code is the concept whose absence produces this implementation's one failing test. Once a reversal says why, the system can distinguish a bank error, where consumer protection rules require the fees to be refunded, from a legitimate customer return, where the account really was overdrawn. Today it cannot, so it applies one rule to both and is wrong about one of them every time.

**It is the same mechanism as the scaling fix.** The sealed period flag from section 1 and the closed period lock here are one feature. Getting the performance work and the regulatory control from a single change is unusual and worth taking.

The runners up, in order: a TTL on the hold register, hash chaining the log for tamper evidence, and a customer facing adjustment advice generated automatically whenever a restatement crosses a statement boundary.

---

## 3. Authorization lifecycle

### What this model actually supports

Being precise about this first, because the list is short and its shortness is the finding.

An authorization in [`authorization.types.ts`](src/modules/authorizations/authorization.types.ts) has three states: approved, settled, declined. Reading the paths in [`replay-engine.ts`](src/modules/replay/replay-engine.ts) rather than the state list, there are **three** ways one ends other than a settlement for the amount held, and a fourth path where it never ends at all.

**1. Declined at creation.** Applying the hold would take the available balance below zero, so no hold is created and the state is terminal.

_Scenario:_ the ordinary one. A customer at a point of sale with insufficient funds, or with funds already committed to an earlier hold.

_Mandated behaviour, and implemented:_ record the decline rather than discard it, with the balances that produced it. Two reasons. The refusal is an output the operator needs to see, not an error to swallow. And storing it lets a later settlement distinguish an authorization that was refused from one that was never requested, which are different situations deserving different handling even though neither recurs here.

**2. Refused at creation as a duplicate identifier.** A second authorization arriving under an identifier already in the register is refused, and never becomes an authorization at all.

_Scenario:_ a retry. The acquirer did not receive the response and sends the request again, or a message is redelivered by a queue with at least once semantics.

_Mandated behaviour, and implemented:_ refuse, and leave the existing authorization untouched. The alternative, treating the retry as a new request, creates a second hold for the same purchase and locks twice the money. Note what this is not: it is refusal, not idempotency. A genuine idempotent path would return the original outcome so the retry succeeds. This model has no idempotency, which is listed in section 4.

**3. Settled for an amount other than the amount held.** The presentment differs from the reservation. The authorization terminates and the whole hold is released, whatever the difference.

_Scenario:_ routine, and it is what happens in this replay. The final amount is rarely the estimate: a restaurant bill before a tip, a fuel pump pre authorization, a basket that changes before capture.

_Mandated behaviour:_ this is the one place the implemented behaviour is only conditionally right. Releasing the entire hold is correct for a single presentment product and wrong for a multi presentment one, where a hotel folio or a split shipment will present again and the residual should stay held until a final authorization or an expiry. I would mandate the release policy per product rather than globally, and I would treat a global choice as a defect regardless of which way it is set.

**4. It never ends.** An approved authorization that is never presented holds funds indefinitely. There is no expiry, no acquirer void, and no sweep.

_Scenario:_ the merchant abandons the sale, the terminal drops the connection after approval, or a pre authorization is simply never captured.

_Mandated behaviour:_ this path should not exist, so what I would mandate is the expiry described below. It is worth being clear why the gap is invisible here: the only authorization left unsettled in this replay was declined, so no hold survives the window and nothing looks wrong. On a longer stream it appears as a hold that never releases against money a customer cannot spend and cannot get an explanation for.

One guard is worth naming because it is what keeps a terminated authorization terminated. A settlement arriving against an already settled authorization is refused rather than posted, so a duplicate presentment cannot debit the account twice.

### What production must mandate

Four endings this model has no path for at all, plus one case that is their mirror image.

**Expiry.** The merchant never presents. A restaurant pre authorizes and the customers leave without paying. An online order is abandoned after authorization. Mandate a TTL per product, not one global value: card present retail is commonly around seven days, hotel and vehicle rental thirty, and fuel at an automated pump much shorter. On expiry, append a release event and free the hold. Never mutate the authorization in place. A settlement arriving after expiry is then a force post and goes down that path rather than silently reviving a dead hold.

**Acquirer initiated void or reversal.** The merchant cancels at the terminal, or an estimated authorization is replaced by a final one. Mandate immediate release, full or partial, on receipt of the reversal message, and no further settlement against that identifier. This is the cheapest hold to release and the one customers notice most when it is not, because they are standing at the counter.

**Over settlement beyond tolerance.** The presented amount exceeds the hold. Restaurant tips, fuel dispensed after the pre authorization, and currency movement on a foreign transaction all do this legitimately. Mandate a tolerance per merchant category, commonly around fifteen to twenty percent for restaurants and fuel and zero for most others. Within tolerance, post and release. Outside it, post anyway, because the issuer is generally obliged to honour the presentment, and raise an exception so the excess is investigated rather than absorbed.

**Settlement with no authorization at all.** Not an ending, because there is no authorization to end. Included because it is the mirror of every ending above, and because this model does have a path for it and takes the wrong one. Offline and floor limit transactions, chip fallback, stand in processing during an issuer outage, and late presentment after expiry. This implementation refuses these, because the brief requires it, and no real issuer could. Mandate posting to a suspense account with an exception raised, then pursue chargeback rights if the authorization is genuinely absent. Never silently decline: the acquirer is unpaid and the customer has already taken the goods.

**Account state change between authorization and settlement.** A freeze, a sanctions match, a court order, a closure, or the death of the customer. Mandate that the existing hold survives, because those funds are already committed and releasing them into a frozen balance helps nobody, while new authorizations are declined. A settlement against a frozen account still posts, and the freeze is enforced at the balance level rather than by dropping the posting, so the bank does not create an unreconciled difference with the scheme. Escalate to compliance rather than resolving in the ledger.

One more sits just outside the lifecycle but ends the economics: a **chargeback** after settlement, which reverses the posting under scheme timelines that are entirely separate from anything in this model.

---

## 4. What was cut, and what each cut defers

Ordered by the size of the risk, not by the size of the change.

**Double entry.** This is single entry per customer account. There are no contra accounts for fee income, interest expense, settlement clearing or suspense. _Defers:_ no trial balance, no way to prove value is conserved across the book rather than within one account, and finance cannot see fee income or interest expense at all. A ledger that cannot be balanced is a record, not a ledger. This is the largest cut here.

**Closed periods and a back value limit.** _Defers:_ everything in section 2. Every statement and every regulatory return stays permanently provisional.

**Snapshots.** _Defers:_ the quadratic day close from section 1, and a projection rebuild that goes from seconds to hours.

**Idempotency.** No event carries a key and nothing deduplicates. _Defers:_ a retried delivery double posts. In a system fed by a message queue with at least once delivery, this is not an edge case. It is routine.

**Concurrency control.** The replay is single threaded with no locking or optimistic versioning. _Defers:_ two authorizations arriving together both read the same available balance and both approve, and the account goes overdrawn past a limit that was supposed to prevent exactly that.

**Authorization expiry.** _Defers:_ holds leak, and customer funds are locked with no event that will ever free them.

**Reversal reason codes.** _Defers:_ the consumer protection exposure in section 2, and it is the subject of the one failing test.

**Tamper evidence.** The log is append only by construction and by convention, with frozen records, but it is not hash chained or signed. _Defers:_ an append only log with no tamper evidence is not an audit record, whatever the code does. Cheap to add, and cheaper before there is history to migrate.

**A business calendar.** No weekends, no UAE public holidays, no timezone, no cutoff. _Defers:_ accruals and value dates diverge from the business calendar, and the divergence compounds. The UAE weekend moved from Friday and Saturday to Saturday and Sunday for the federal sector in January 2022, so the rule is not even a constant.

**A day count convention.** A flat rate per day, with no Actual/365, Actual/360 or 30/360. _Defers:_ the accrual will not agree with product terms or with treasury, and the difference is small per day and systematic.

**Debit interest.** An overdraft is priced by a flat fee only. _Defers:_ an overdraft is mispriced, and it is mispriced in a way that is regressive, since a small overdraft pays the same fee as a large one.

**A multi currency fee schedule.** Only AED is priced. _Defers:_ an account in any other currency cannot be charged, which the code raises on rather than guessing. Honest, and still a gap.

**Access control and segregation of duties.** No authentication, no authorization, no maker checker. _Defers:_ every control in section 2 assumes somebody can be prevented from doing something, and nothing here can prevent anything.

**Observability.** No metrics, no structured logs, no reconciliation report. _Defers:_ the first production incident is diagnosed by reading source code.

**Event schema versioning.** _Defers:_ the first change to an event shape makes the historical log unreadable by the current code, which is the specific failure that turns an append only log from an asset into a liability.

**Persistence, and everything downstream of it.** No storage, no transactions, no recovery. Out of scope by instruction, and named because every cut above interacts with it.
