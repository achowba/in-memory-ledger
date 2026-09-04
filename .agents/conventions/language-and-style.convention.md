# Language and style convention

## Simplified Technical English

Prose here follows ASD-STE100, the writing standard used for aerospace and defence maintenance manuals.

The standard exists for one reason. A reader who does not speak English as a first language must get one meaning, quickly.

### Where it matters most

That need is strongest where prose tells somebody what to do, and weakest where prose argues why a decision was made.

Apply the rules strictly to prose that instructs. A convention tells the next contributor what to do. A doc block tells a caller whether to call. A comment tells a reader why. A pull request template tells an author what to fill in. A module README states what a folder owns. A commit message is read later, out of context, by somebody looking for one fact.

Use judgement on sentence length in the root documents. `README.md`, `ARCHITECTURE.md`, `NUMBERS.md`, `AMBIGUITIES.md`, `REJECTED.md` and `WORKLOG.md` exist to make a case. An argument has the shape "X is right for A and wrong for B, because C". Splitting that into three sentences does not make it clearer. It hides which clause depends on which.

An idiom is the exception, and it is worth stating separately. Avoid one everywhere. An idiom defeats a reader who does not have the reference, whether the sentence instructs or argues.

### The rules

- One approved word per meaning. Do not switch between synonyms in one document.
- Short sentences. Under 20 words in an instruction. Under 25 in an explanation.
- One idea per sentence. Do not chain actions with "and" or "then".
- Active voice. Write "Walk the days in ascending order", not "The days should be walked".
- Present tense for an instruction and for a fact.
- Prefer the plain word. Write `use`, not `utilize`.
- State the condition before the action. Write "If the balance is below zero, book a fee".
- Repeat the noun when "it" or "this" could point at two things.
- Avoid a noun cluster. Write "the timeout for the connection pool", not "connection pool timeout".
- No idiom, and no phrase that depends on one culture.

## Agreed terms

One term per idea, used everywhere. This domain has several words for the same thing, and a reader should never have to work out whether two of them mean the same.

| Use               | Not                             |
| ----------------- | ------------------------------- |
| value date        | effective date, posting date    |
| booking day       | booked date, entry date         |
| arrival sequence  | insertion order, index          |
| closing balance   | end of day balance, EOD balance |
| ledger entry      | posting, line, transaction      |
| hold              | reservation, block, earmark     |
| accrual           | interest amount, daily interest |
| capitalization    | crediting, posting of interest  |
| refusal, rejected | denial, failure                 |
