# architecture-pdf

Renders [`ARCHITECTURE.md`](../../ARCHITECTURE.md) to `ARCHITECTURE.pdf`, the Part 2 deliverable.

```
npm run docs:pdf
```

## Why this exists

The deliverable is a PDF of two to four pages. A PDF committed without the thing that produced
it drifts from its source on the first edit, and nobody notices because the two files are read
by different people. The build takes seconds, so there is no reason to hand craft the PDF.

`build.sh` fails when the output falls outside two to four pages, because the page count is a
requirement of the brief rather than a preference.

## How it works

Three parts. It needs `bash`, `python3` and Chrome or Chromium, all of which macOS and most
Linux distributions already have, so there is nothing to install. `build.sh` names whichever one
is missing rather than letting the shell report a command it cannot find.

| File            | Does                                                          |
| --------------- | ------------------------------------------------------------- |
| `md-to-html.py` | Converts the markdown subset this document uses to HTML       |
| `print.css`     | Sets the page box, the type scale and the break rules         |
| `build.sh`      | Finds Chrome or Chromium, renders, then checks the page count |

`md-to-html.py` covers headings, paragraphs, fenced code, tables, horizontal rules, and inline
code, bold, italic and links. That is the whole of what `ARCHITECTURE.md` uses. It is not a
general markdown implementation and is not meant to become one: a converter that handles only
what this repository writes is small enough to read in one sitting.

Chrome renders it, because a browser is the only print engine on this machine and pulling in a
LaTeX toolchain to typeset three pages would cost more than the document.

## The layout

Two columns, because measure governs how verbose a document feels far more than word count does.
At A4 width with these margins a single column runs past 100 characters a line, where comfortable
reading is 45 to 75. Two columns land near 55 without cutting a word.

Headings, the document subtitle and tables span both columns. Code blocks do not, so they are
written to fit an 85mm column. A table breaks between rows rather than moving whole to the next
page, which had been stranding a third of one, and `thead` repeats after the break.

## After editing the document

Run the build, read the page count it prints, and commit `ARCHITECTURE.md` and
`ARCHITECTURE.pdf` together. They are one deliverable in two formats and a commit holding only
one of them is a commit that made them disagree.
