---
name: pr-doc-creator
description: Reads the local changes and writes a pull request description in this repository's template format, then opens or updates the pull request. Use when a branch is ready to review.
---

# pr-doc-creator

## Purpose

Turns a diff into a description a reviewer can act on. It fills every section of `.github/pull_request_template.md` and ticks only the boxes that are true.

## Inputs

| Input               | Default | Meaning                                                        |
| ------------------- | ------- | -------------------------------------------------------------- |
| base branch         | `main`  | What the branch is compared against.                           |
| pull request number | none    | When given, updates that pull request instead of creating one. |
| draft               | false   | Opens as a draft.                                              |

## Workflow

1. **Read the change.** Use `git diff <base>...HEAD` for content. Use `git log <base>..HEAD` for the intent the author already wrote down. Group the diff by concern, not by file.
2. **Read the template.** Take the section headings from `.github/pull_request_template.md`. Do not assume them. The description then tracks the template if the template changes.
3. **Draft the description.** Fill `What?`, `Why?`, `How?` and `Testing?` from the diff and the commit bodies. Put deliberate follow up work in `Anything Else?`.
4. **Fill or delete the `Numbers?` section.** This is the step that matters most here, and it has no equivalent in an ordinary repository. See below.
5. **Tick the checklist honestly.** Tick only what is true. An unticked box is information. A falsely ticked one is a defect.
6. **Run the gates and quote the real output.** Never claim a command passed without running it.
7. **Apply the labels.** Exactly one `type:`, every `module:` the change touches, any `area:`, and a concern label where it applies. See [labels](../../conventions/labels.convention.md). A change that moves a published figure takes `numbers`, and its `Numbers?` section must then be filled rather than deleted.
8. **Write the file, then create or update the pull request.**

```bash
gh pr create --title "<a sentence, not a commit subject>" --body-file <path> --assignee @me --label "<labels>"
gh pr edit <number> --body-file <path> --add-label "<labels>"
```

## The `Numbers?` section

Delete the section when the change moves no number. Fill it whenever the change touches money, rounding, the fee cascade, the interest schedule or the event stream.

A figure in this repository appears in up to five documents at once. `NUMBERS.md` derives it. `AMBIGUITIES.md` compares it against the reading not taken. `REJECTED.md` uses it to refuse a criterion. `README.md` summarises it. `ARCHITECTURE.md` may cite it.

A change that moves a figure and updates one document leaves four documents lying.

So the section states which figures moved, shows the arithmetic, and names every document updated in the same pull request.

Run `npm start` before and after. The report is the authority.

## Reporting the one intentional failure

`npm test` reports exactly one failure by design, in `test/known-gap.e2e-spec.ts`. A description that says "all tests pass" is wrong. A reviewer who sees a red suite with no explanation will assume the branch is broken.

State both results:

```
npm run verify     passes
npm test           1 failure, the known gap, as required by the brief
```

## Output

- The description at `artifacts/pr/<descriptor>_<YYYYMMDDHHMMSS>.notes.md`, per the artifacts convention. The descriptor is short and `snake_case`, taken from what the change does. Never the branch name, which carries a slash and would write into a directory the convention does not describe.
- A created or updated pull request.
- The pull request URL printed.

## Rules

- Follow [language and style](../../conventions/language-and-style.convention.md). A description is read once, quickly, by somebody deciding whether to look closer, so keep the sentences short.
- No filler, no marketing words, no praise of the code.
- Describe what the change does and what it costs. Do not claim a benefit the diff does not deliver.
- Never invent a test that was not run.
- Read the label set with `gh label list` before applying. There is no local cache: twenty labels fetch instantly, and a cache is one more thing that can disagree with GitHub.
