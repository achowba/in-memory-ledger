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

Three parts, no dependency to install beyond a browser that is already present.

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
LaTeX toolchain to typeset four pages would cost more than the document.

## After editing the document

Run the build, read the page count it prints, and commit `ARCHITECTURE.md` and
`ARCHITECTURE.pdf` together. They are one deliverable in two formats and a commit holding only
one of them is a commit that made them disagree.
